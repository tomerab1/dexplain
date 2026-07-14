/**
 * Parses a BuildKit `--progress=rawjson` stream (newline-delimited JSON) into a
 * normalized BuildTrace. Each vertex appears several times as its state advances
 * (queued → started → completed), so vertexes are accumulated by digest with the
 * latest non-null field winning.
 */

// BuildKit left-pads the step number to align columns once a build has ≥10 steps
// (e.g. "[ 2/18]"), so the leading whitespace inside the brackets is optional.
const STEP_NAME = /^\[\s*(\d+)\/(\d+)\]\s+(.*)$/s;
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
  };
}

function classifyName(name) {
  const match = (name ?? '').match(STEP_NAME);
  if (!match) return { internal: true, index: null, stageTotal: null, command: name ?? '', instruction: null };
  const command = match[3].trim();
  const keyword = command.split(/\s+/)[0]?.toUpperCase() ?? null;
  return {
    internal: false,
    index: Number(match[1]),
    stageTotal: Number(match[2]),
    command,
    instruction: INSTRUCTION_KEYWORDS.has(keyword) ? keyword : null,
  };
}

function toStep(vertex) {
  const classified = classifyName(vertex.name);
  const cached = vertex.cached === true;
  const startedMs = vertex.started ? Date.parse(vertex.started) : null;
  const completedMs = vertex.completed ? Date.parse(vertex.completed) : null;
  const measured = startedMs !== null && completedMs !== null ? completedMs - startedMs : 0;
  return {
    ...classified,
    name: vertex.name ?? '',
    digest: vertex.digest,
    cached,
    startedMs,
    durationMs: cached ? 0 : measured,
    error: vertex.error ?? null,
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
  const vertexes = accumulateVertexes(parseLines(ndjson));
  const steps = sortSteps(vertexes.map(toStep)).map((step, position) => ({ ...step, position }));
  const buildSteps = steps.filter((step) => !step.internal);
  return {
    steps,
    totalDurationMs: wallClockMs(steps),
    buildStepCount: buildSteps.length,
    cachedCount: buildSteps.filter((step) => step.cached).length,
    failedStep: steps.find((step) => step.error) ?? null,
  };
}
