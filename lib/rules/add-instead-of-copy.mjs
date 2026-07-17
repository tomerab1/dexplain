/**
 * Flags ADD instructions used for plain local files where COPY is more explicit.
 * ADD has surprising behavior: auto-extracts tar archives and fetches URLs.
 * For plain files, COPY is identical in behavior and clearer in intent.
 * Hadolint rule: DL3020.
 */

import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

const TAR_ARCHIVE = /\.(tar(?:\.\w+)?|tgz|txz|tbz|tbz2)$/i;
const URL_PATTERN = /^https?:\/\//;
const FLAG_PATTERN = /^--/;

/**
 * Parse args into tokens, removing line continuations and collapsing whitespace.
 * Returns array of tokens (flags and filenames mixed).
 */
function tokenizeArgs(args) {
  return args
    .replace(/\\\s*$/gm, ' ') // Remove line continuations
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Extract source file paths from ADD/COPY args.
 * Skips leading flags (--flag, --flag=value), assumes last token is destination.
 * Returns { sources: [filenames], hasDeliberateAddFlag: boolean }.
 */
function parseSourcesAndFlags(args) {
  const tokens = tokenizeArgs(args);
  if (tokens.length < 2) return { sources: [], hasDeliberateAddFlag: false };

  const sources = [];
  let hasDeliberateAddFlag = false;

  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (FLAG_PATTERN.test(token)) {
      if (/^--(?:from|checksum)/.test(token)) {
        hasDeliberateAddFlag = true;
      }
    } else {
      sources.push(token);
    }
  }

  return { sources, hasDeliberateAddFlag };
}

/**
 * Check if any source is a URL or tar archive.
 */
function hasUrlOrArchiveSource(sources) {
  return sources.some(
    (src) => URL_PATTERN.test(src) || TAR_ARCHIVE.test(src)
  );
}

function addSufficeFinding(instruction) {
  return makeFinding({
    ruleId: 'add-instead-of-copy',
    category: CATEGORY.DOCKERFILE,
    severity: SEVERITY.LOW,
    title: 'ADD used where COPY suffices',
    detail:
      `ADD at line ${instruction.line} copies local files without using URL fetching or tar extraction. ` +
      'COPY is more explicit and identical in behavior for plain files.',
    location: { line: instruction.line },
    fixRisk: FIX_RISK.LOW,
    suggestedFix:
      'Use COPY for local files; reserve ADD for remote URLs (with --checksum) and intentional tar auto-extraction.',
  });
}

export default {
  id: 'add-instead-of-copy',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.LOW,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const findings = [];
    for (const instruction of model.dockerfile.instructions) {
      if (instruction.keyword !== 'ADD') continue;

      const { sources, hasDeliberateAddFlag } = parseSourcesAndFlags(instruction.args);
      if (hasDeliberateAddFlag) continue; // --from or --checksum present; intentional ADD

      if (!hasUrlOrArchiveSource(sources)) {
        findings.push(addSufficeFinding(instruction));
      }
    }
    return findings;
  },
};
