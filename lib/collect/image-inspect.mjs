import { parseHumanSize } from './size.mjs';

/**
 * Builds a normalized ImageModel from `docker history --format '{{json .}}'` (one JSON
 * object per line, newest layer first) and `docker inspect` output. History sizes are
 * humanized strings, parsed back to bytes; inspect provides the authoritative total.
 */

const NOP = /^\/bin\/sh -c #\(nop\)\s+(\w+)/;
const SHELL_FORM = /^\/bin\/sh -c /;
const KEYWORDS = new Set([
  'FROM',
  'RUN',
  'COPY',
  'ADD',
  'CMD',
  'ENTRYPOINT',
  'ENV',
  'ARG',
  'WORKDIR',
  'EXPOSE',
  'LABEL',
  'USER',
  'VOLUME',
]);

function instructionFromCreatedBy(createdBy) {
  const text = (createdBy ?? '').replace(/\s*#\s*buildkit\s*$/, '').trim();
  const nop = text.match(NOP);
  if (nop) return nop[1].toUpperCase();
  if (SHELL_FORM.test(text)) return 'RUN';
  const first = text.split(/\s+/)[0]?.toUpperCase() ?? null;
  return KEYWORDS.has(first) ? first : null;
}

function parseHistory(historyNdjson) {
  const rows = [];
  for (const line of historyNdjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return rows.reverse();
}

function toLayer(row, index) {
  const bytes = parseHumanSize(row.Size);
  return {
    index,
    createdBy: row.CreatedBy ?? '',
    instruction: instructionFromCreatedBy(row.CreatedBy),
    bytes,
    empty: bytes === 0,
  };
}

function readInspect(inspectJson) {
  const parsed = typeof inspectJson === 'string' ? JSON.parse(inspectJson) : inspectJson;
  const doc = Array.isArray(parsed) ? parsed[0] : parsed;
  const config = doc?.Config ?? {};
  return {
    architecture: doc?.Architecture ?? null,
    config: {
      entrypoint: config.Entrypoint ?? null,
      cmd: config.Cmd ?? null,
      envCount: (config.Env ?? []).length,
      user: config.User || null,
      workdir: config.WorkingDir || null,
    },
  };
}

/**
 * Image total is the sum of layer sizes (what `docker images` reports and what the
 * per-layer findings add up to), not inspect's `.Size`, which measures something else
 * and can contradict the layers.
 */
export function parseImageModel({ ref, historyNdjson, inspectJson }) {
  const layers = parseHistory(historyNdjson).map(toLayer);
  const inspect = readInspect(inspectJson);
  return {
    ref: ref ?? null,
    totalBytes: layers.reduce((sum, layer) => sum + layer.bytes, 0),
    architecture: inspect.architecture,
    config: inspect.config,
    layers,
  };
}
