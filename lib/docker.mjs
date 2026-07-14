import { spawn } from 'node:child_process';

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

/** Reports whether the docker CLI and daemon are usable, with a human-readable reason if not. */
export async function dockerStatus() {
  const result = await capture(['version', '--format', '{{.Server.Version}}']);
  if (result.spawnError) return { ok: false, reason: 'docker CLI not found on PATH' };
  if (result.code !== 0) return { ok: false, reason: 'docker daemon is not responding' };
  return { ok: true, version: result.stdout.trim() };
}
