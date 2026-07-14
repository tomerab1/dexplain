/**
 * Extracts the tag, Dockerfile path, and context directory from a passthrough
 * `docker build` argument list, so dexplain can locate the image and Dockerfile it
 * should analyze without interpreting every Docker flag. Flags it does not recognize
 * are preserved; only value-bearing flags are skipped when finding the context.
 */

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
]);

const TAG_FLAGS = new Set(['-t', '--tag']);
const FILE_FLAGS = new Set(['-f', '--file']);

function splitInline(token) {
  const eq = token.indexOf('=');
  if (eq === -1) return [token, null];
  return [token.slice(0, eq), token.slice(eq + 1)];
}

export function parseBuildArgs(argv) {
  const result = { tag: null, file: null, contextDir: '.', progressPresent: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const [flag, inlineValue] = splitInline(token);
    if (flag === '--progress') result.progressPresent = true;
    const value = inlineValue ?? (VALUE_FLAGS.has(flag) ? argv[(i += 1)] : null);
    if (TAG_FLAGS.has(flag) && value) result.tag = value;
    if (FILE_FLAGS.has(flag) && value) result.file = value;
  }
  if (positionals.length) result.contextDir = positionals.at(-1);
  return result;
}
