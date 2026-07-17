import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A pragmatic .dockerignore matcher. It covers the patterns that dominate context size
 * — directory and file names, `**​/name` any-depth excludes, root-anchored entries, and
 * simple `*` globs — so context measurement reflects what Docker actually uploads.
 * Negation (`!`) patterns are not yet supported; when a .dockerignore relies on `!`
 * re-includes to restore files within an ignored directory, the estimate may under-count.
 */

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function compileRule(raw) {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith('#') || pattern.startsWith('!')) return null;
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  let anyDepth = false;
  if (pattern.startsWith('**/')) {
    anyDepth = true;
    pattern = pattern.slice(3);
  }
  pattern = pattern.replace(/\/$/, '');
  if (!pattern) return null;
  if (anyDepth) {
    const rx = globToRegExp(pattern);
    return (relPath) => relPath.split('/').some((segment) => rx.test(segment));
  }
  if (/[*?]/.test(pattern)) {
    const rx = globToRegExp(pattern);
    return (relPath) => rx.test(relPath);
  }
  return (relPath) => relPath === pattern || relPath.startsWith(`${pattern}/`);
}

export function makeDockerignoreMatcher(patterns) {
  const rules = patterns.map(compileRule).filter(Boolean);
  return (relPath) => rules.some((rule) => rule(relPath));
}

/** Reads and returns the raw pattern lines of a context's .dockerignore, or []. */
export function readDockerignore(contextDir) {
  const path = join(contextDir, '.dockerignore');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n');
}
