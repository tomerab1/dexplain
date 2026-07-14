import { capture } from '../docker.mjs';
import { parseImageModel } from './image-inspect.mjs';

/**
 * Gathers an image's history and inspect output from Docker and hands them to the pure
 * parser. Returns either `{ image }` or `{ error }` so callers can degrade gracefully.
 */
export async function collectImage(ref) {
  const history = await capture(['history', '--no-trunc', '--format', '{{json .}}', ref]);
  if (history.code !== 0) return { error: `docker history failed for ${ref}: ${history.stderr.trim()}` };
  const inspect = await capture(['inspect', ref]);
  if (inspect.code !== 0) return { error: `docker inspect failed for ${ref}: ${inspect.stderr.trim()}` };
  return { image: parseImageModel({ ref, historyNdjson: history.stdout, inspectJson: inspect.stdout }) };
}
