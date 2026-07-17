import { spawn } from 'node:child_process';
import { parseBuildArgs } from './build-args.mjs';

/**
 * Runs the user's `docker build` with `--progress=rawjson` forced on, capturing the
 * BuildKit event stream (emitted on stderr) for later parsing. The build itself runs
 * exactly as requested; only the progress format is overridden.
 */

const PROGRESS_FLAG = '--progress';
const QUIET_FLAGS = new Set(['-q', '--quiet']);

/**
 * Strips `--progress` and quiet flags from argv, since they would interfere
 * with the instrumented build's raw JSON progress stream.
 */
export function sanitizeBuildArgs(argv) {
  const cleaned = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === PROGRESS_FLAG) {
      i += 1;
      continue;
    }
    if (token.startsWith(`${PROGRESS_FLAG}=`)) continue;
    if (QUIET_FLAGS.has(token)) continue;
    cleaned.push(token);
  }
  return cleaned;
}

export function runInstrumentedBuild(buildArgs, { env = process.env, onStatus = () => {} } = {}) {
  const meta = parseBuildArgs(buildArgs);
  const args = ['build', `${PROGRESS_FLAG}=rawjson`, ...sanitizeBuildArgs(buildArgs)];
  return new Promise((resolve) => {
    const child = spawn('docker', args, { env: { ...env, DOCKER_BUILDKIT: '1' } });
    let rawjson = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => {
      rawjson += chunk;
      onStatus(chunk.toString());
    });
    child.on('error', (error) => resolve({ code: -1, spawnError: true, message: error.message, rawjson, stdout, meta }));
    child.on('close', (code) => resolve({ code, spawnError: false, rawjson, stdout, meta }));
  });
}
