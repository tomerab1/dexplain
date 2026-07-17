import { spawn } from 'node:child_process';
import { MIN_BUILDX } from './constants.mjs';

/**
 * Thin wrapper over the docker CLI. Every impure Docker interaction goes through here so
 * the rest of the code stays testable and unaware of process spawning.
 */
export function capture(args, { env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn('docker', args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message, spawnError: true }));
    child.on('close', (code) => resolve({ code, stdout, stderr, spawnError: false }));
  });
}

/**
 * Parse docker buildx version output into { major, minor, patch } or null if unparseable.
 * Tolerates surrounding text; extracts v-prefixed semantic version pattern (e.g., v0.19.2).
 */
export function parseBuildxVersion(text) {
  const match = text.match(/\bv(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3] ?? 0, 10),
  };
}

/** Reports whether the docker CLI and daemon are usable, with a human-readable reason if not. */
export async function dockerStatus() {
  const result = await capture(['version', '--format', '{{.Server.Version}}']);
  if (result.spawnError) return { ok: false, reason: 'docker CLI not found on PATH' };
  if (result.code !== 0) return { ok: false, reason: 'docker daemon is not responding' };
  return { ok: true, version: result.stdout.trim() };
}

/**
 * Reports whether docker buildx is available and recent enough for --progress=rawjson.
 * Returns { ok: false, reason: ... } if buildx is absent or too old.
 * Returns { ok: true, version } if buildx >= MIN_BUILDX, or if version is unparseable (fail open).
 */
export async function buildxStatus() {
  const result = await capture(['buildx', 'version']);
  if (result.spawnError || result.code !== 0) {
    return {
      ok: false,
      reason: `docker buildx not found — dexplain build needs Buildx >= ${MIN_BUILDX.major}.${MIN_BUILDX.minor} for --progress=rawjson; use \`dexplain analyze\` on a captured log instead`,
    };
  }
  const parsed = parseBuildxVersion(result.stdout);
  if (!parsed) {
    // Unparseable version string; fail open to avoid blocking on format changes
    return { ok: true, version: null };
  }
  if (parsed.major < MIN_BUILDX.major || (parsed.major === MIN_BUILDX.major && parsed.minor < MIN_BUILDX.minor)) {
    return {
      ok: false,
      reason: `docker buildx ${parsed.major}.${parsed.minor}.${parsed.patch} is too old — dexplain build needs >= ${MIN_BUILDX.major}.${MIN_BUILDX.minor} for --progress=rawjson`,
    };
  }
  return { ok: true, version: `${parsed.major}.${parsed.minor}.${parsed.patch}` };
}
