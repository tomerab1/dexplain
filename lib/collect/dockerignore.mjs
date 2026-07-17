import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * .dockerignore matcher with last-match-wins negation, `**` anywhere, and directory
 * pruning hints. Supports negation (`!`) patterns for re-includes within ignored dirs.
 * Character classes like `[a-z]` are escaped to literals (over-count only).
 * Returns { ignores(relPath), canPruneDir(relPath) } so callers can optimize
 * directory walks: a matched directory is pruned wholesale only when no negation
 * pattern could match beneath it.
 */

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const converted = escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${converted}$`);
}

function compileRule(raw) {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith('#')) return null;

  const negated = pattern.startsWith('!');
  if (negated) pattern = pattern.slice(1).trim();
  if (!pattern) return null;

  let cleanedPattern = pattern;
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  pattern = pattern.replace(/\/$/, '');
  if (!pattern) return null;

  let matcher;
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    const rx = globToRegExp(suffix);
    matcher = (relPath) => relPath.split('/').some((seg) => rx.test(seg));
  } else if (pattern.includes('**/')) {
    const parts = pattern.split('/**/');
    const regexParts = parts.map((p) => {
      const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      return esc.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    });
    const rx = new RegExp(`^${regexParts[0]}/(?:.*/)?${regexParts[1]}$`);
    matcher = (relPath) => rx.test(relPath);
  } else if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    const esc = prefix.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const converted = esc.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    const rx = new RegExp(`^${converted}/.*$`);
    matcher = (relPath) => rx.test(relPath);
  } else if (/[*?]/.test(pattern)) {
    const rx = globToRegExp(pattern);
    matcher = (relPath) => rx.test(relPath);
  } else {
    matcher = (relPath) => relPath === pattern || relPath.startsWith(`${pattern}/`);
  }

  return { matcher, negated, cleanedPattern };
}

export function makeDockerignoreMatcher(patterns) {
  const entries = patterns.map(compileRule).filter(Boolean);
  const hasNegations = entries.some((e) => e.negated);
  const negatedPatterns = entries
    .filter((e) => e.negated)
    .map((e) => {
      let p = e.cleanedPattern;
      if (p.startsWith('/')) p = p.slice(1);
      if (p.startsWith('**/')) p = p.slice(3);
      return p;
    });

  function ignores(relPath) {
    let lastMatch = null;
    for (const entry of entries) {
      if (entry.matcher(relPath)) {
        lastMatch = entry;
      }
    }
    return lastMatch ? !lastMatch.negated : false;
  }

  function canPruneDir(relPath) {
    if (!ignores(relPath)) return false;
    if (!hasNegations) return true;

    const dirPrefix = `${relPath}/`;
    const hasDeepNegation = entries.some((e) => e.negated && e.cleanedPattern.includes('**'));
    if (hasDeepNegation) return false;

    return !negatedPatterns.some((p) => p.startsWith(dirPrefix));
  }

  return { ignores, canPruneDir };
}

export function readDockerignore(contextDir) {
  const path = join(contextDir, '.dockerignore');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n');
}
