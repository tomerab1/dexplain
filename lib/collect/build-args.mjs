/**
 * Extracts the tag, Dockerfile path, and context directory from a passthrough
 * `docker build` argument list, so dexplain can locate the image and Dockerfile it
 * should analyze without interpreting every Docker flag. Flags it does not recognize
 * are preserved; only value-bearing flags are skipped when finding the context.
 */

import { statSync } from 'node:fs';

// Resource-limiting and constraint flags that require values
const RESOURCE_FLAGS = new Set([
  '--ulimit',
  '--memory',
  '-m',
  '--memory-swap',
  '--shm-size',
  '--cpu-shares',
  '--cpu-period',
  '--cpu-quota',
  '--cpuset-cpus',
  '--cpuset-mems',
  '--cgroup-parent',
]);

// Image metadata and strategy flags that require values
const METADATA_FLAGS = new Set([
  '--isolation',
  '--annotation',
  '--attest',
]);

const VALUE_FLAGS = new Set([
  '-t',
  '--tag',
  '-f',
  '--file',
  '--build-arg',
  '--target',
  '--platform',
  '--progress',
  '--cache-from',
  '--cache-to',
  '--output',
  '-o',
  '--secret',
  '--ssh',
  '--network',
  '--add-host',
  '--label',
  '--iidfile',
  '--metadata-file',
  '--builder',
  '--allow',
  ...RESOURCE_FLAGS,
  ...METADATA_FLAGS,
]);

const TAG_FLAGS = new Set(['-t', '--tag']);
const FILE_FLAGS = new Set(['-f', '--file']);

const STDIN_CONTEXT = '-';
const URL_PROTOCOL_MARKER = '://';
const GIT_SSH_PREFIX = 'git@';

function defaultIsDir(path) {
  try {
    const stats = statSync(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a positional argument plausibly represents a build context.
 * Contexts can be existing directories, URLs/git repos, or stdin.
 * @param {string} positional - The positional argument to check.
 * @param {(path: string) => boolean} isDir - Predicate to check if path is a directory.
 * @returns {boolean} True if the positional is a plausible context.
 */
function isPlausibleContext(positional, isDir) {
  if (positional === STDIN_CONTEXT) return true;
  if (positional.includes(URL_PROTOCOL_MARKER)) return true;
  if (positional.startsWith(GIT_SSH_PREFIX)) return true;
  return isDir(positional);
}

function splitInline(token) {
  const eq = token.indexOf('=');
  if (eq === -1) return [token, null];
  return [token.slice(0, eq), token.slice(eq + 1)];
}

export function parseBuildArgs(argv, { isDir = defaultIsDir } = {}) {
  const result = { tag: null, file: null, contextDir: '.', progressPresent: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === STDIN_CONTEXT || !token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const [flag, inlineValue] = splitInline(token);
    if (flag === '--progress') result.progressPresent = true;
    const value = inlineValue ?? (VALUE_FLAGS.has(flag) ? argv[(i += 1)] : null);
    if (TAG_FLAGS.has(flag) && value) result.tag = value;
    if (FILE_FLAGS.has(flag) && value) result.file = value;
  }
  if (positionals.length) {
    // Prefer the last positional that plausibly is a build context.
    // Fall back to the last positional if none qualify.
    let contextDir = positionals.at(-1);
    for (let i = positionals.length - 1; i >= 0; i -= 1) {
      if (isPlausibleContext(positionals[i], isDir)) {
        contextDir = positionals[i];
        break;
      }
    }
    result.contextDir = contextDir;
  }
  return result;
}
