/**
 * Parses a BuildKit `--progress=rawjson` stream (newline-delimited JSON) into a
 * normalized BuildTrace. Each vertex appears several times as its state advances
 * (queued → started → completed), so vertexes are accumulated by digest with the
 * latest non-null field winning.
 */

import { LOG_TAIL_MAX_LINES } from '../constants.mjs';

// A build-step vertex is named "[<n>/<m>] <cmd>". BuildKit left-pads the number once a
// build has ≥10 steps ("[ 2/18]"), and prefixes the target stage in multi-stage builds
// ("[runtime 3/8]", "[admin-build 4/8]"), so both the padding and the stage label are
// optional. A stage label always starts with a letter, which keeps it distinct from "[2/8]".
const STEP_NAME = /^\[\s*(?:([A-Za-z][\w.-]*)\s+)?(\d+)\/(\d+)\]\s+(.*)$/s;
const INSTRUCTION_KEYWORDS = new Set([
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

function parseLines(ndjson) {
  const events = [];
  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return events;
}

/**
 * Accumulates log output per vertex digest. Each log event carries base64-encoded
 * process output; we decode and append per vertex, keeping only the last N lines
 * to avoid unbounded memory growth.
 */
function accumulateLogs(events) {
  const byDigest = new Map();
  for (const event of events) {
    for (const log of event.logs ?? []) {
      const digest = log.vertex;
      if (!digest) continue;
      const decoded = Buffer.from(log.data || '', 'base64').toString('utf8');
      const lines = decoded.split('\n').filter((line) => line.trim());
      if (!lines.length) continue;
      const existing = byDigest.get(digest) || [];
      const combined = [...existing, ...lines];
      // Keep only the last N lines.
      const tail = combined.slice(-LOG_TAIL_MAX_LINES);
      byDigest.set(digest, tail);
    }
  }
  return byDigest;
}

function accumulateVertexes(events) {
  const byDigest = new Map();
  let order = 0;
  for (const event of events) {
    for (const vertex of event.vertexes ?? []) {
      const existing = byDigest.get(vertex.digest) ?? { order: order++ };
      byDigest.set(vertex.digest, mergeVertex(existing, vertex));
    }
  }
  return [...byDigest.values()];
}

function mergeVertex(existing, incoming) {
  return {
    ...existing,
    digest: incoming.digest,
    name: incoming.name ?? existing.name,
    started: incoming.started ?? existing.started,
    completed: incoming.completed ?? existing.completed,
    cached: incoming.cached ?? existing.cached,
    error: incoming.error ?? existing.error,
    logTail: existing.logTail ?? null,
  };
}

function classifyName(name) {
  const match = (name ?? '').match(STEP_NAME);
  if (!match) return { internal: true, stage: null, index: null, stageTotal: null, command: name ?? '', instruction: null };
  const command = match[4].trim();
  const keyword = command.split(/\s+/)[0]?.toUpperCase() ?? null;
  return {
    internal: false,
    stage: match[1] ?? null,
    index: Number(match[2]),
    stageTotal: Number(match[3]),
    command,
    instruction: INSTRUCTION_KEYWORDS.has(keyword) ? keyword : null,
  };
}

function toStep(vertex, logsByDigest) {
  const classified = classifyName(vertex.name);
  const cached = vertex.cached === true;
  const startedMs = vertex.started ? Date.parse(vertex.started) : null;
  const completedMs = vertex.completed ? Date.parse(vertex.completed) : null;
  const measured = startedMs !== null && completedMs !== null ? completedMs - startedMs : 0;
  const error = vertex.error ?? null;
  // Only attach log tail to steps that have an error.
  const logTail = error ? (logsByDigest.get(vertex.digest) || null) : null;
  return {
    ...classified,
    name: vertex.name ?? '',
    digest: vertex.digest,
    cached,
    startedMs,
    durationMs: cached ? 0 : measured,
    error,
    logTail,
    order: vertex.order,
  };
}

function sortSteps(steps) {
  return [...steps].sort((a, b) => {
    if (a.startedMs !== null && b.startedMs !== null && a.startedMs !== b.startedMs) {
      return a.startedMs - b.startedMs;
    }
    return a.order - b.order;
  });
}

function wallClockMs(steps) {
  const starts = steps.map((s) => s.startedMs).filter((v) => v !== null);
  const ends = steps
    .map((s) => (s.startedMs !== null ? s.startedMs + s.durationMs : null))
    .filter((v) => v !== null);
  if (!starts.length || !ends.length) return 0;
  return Math.max(...ends) - Math.min(...starts);
}

export function parseBuildTrace(ndjson) {
  const events = parseLines(ndjson);
  const vertexes = accumulateVertexes(events);
  const logsByDigest = accumulateLogs(events);
  const steps = sortSteps(vertexes.map((v) => toStep(v, logsByDigest))).map((step, position) => ({ ...step, position }));
  const buildSteps = steps.filter((step) => !step.internal);
  return {
    steps,
    totalDurationMs: wallClockMs(steps),
    buildStepCount: buildSteps.length,
    cachedCount: buildSteps.filter((step) => step.cached).length,
    failedStep: steps.find((step) => step.error) ?? null,
  };
}
