import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTimeline, renderTimeline } from '../lib/render/timeline.mjs';
import { parseBuildTrace } from '../lib/collect/build-events.mjs';
import { THRESHOLDS } from '../lib/constants.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const paint = (name, s) => s;

function makeTrace(steps, totalDurationMs = 0) {
  return {
    steps,
    totalDurationMs,
    buildStepCount: steps.filter(s => !s.internal).length,
    cachedCount: steps.filter(s => s.cached).length,
  };
}

function makeStep(props = {}) {
  return {
    internal: false,
    name: '[1/3] RUN test',
    digest: 'sha256:abc',
    cached: false,
    startedMs: 1000,
    durationMs: 500,
    index: 1,
    stageTotal: 3,
    command: 'test',
    stage: null,
    ...props,
  };
}

test('shouldShowTimeline: duration below floor returns false', () => {
  const trace = makeTrace([makeStep()], 2000);
  assert.strictEqual(shouldShowTimeline(trace, THRESHOLDS), false);
});

test('shouldShowTimeline: step count below floor returns false', () => {
  const trace = makeTrace(
    [makeStep(), makeStep({ index: 2 })],
    5000,
  );
  assert.strictEqual(shouldShowTimeline(trace, THRESHOLDS), false);
});

test('shouldShowTimeline: both thresholds met returns true', () => {
  const steps = Array(4)
    .fill(0)
    .map((_, i) =>
      makeStep({
        index: i + 1,
        startedMs: 1000 + i * 1000,
      }),
    );
  const trace = makeTrace(steps, 4000);
  assert.strictEqual(shouldShowTimeline(trace, THRESHOLDS), true);
});

test('3-step sequential trace renders in start order', () => {
  const steps = [
    makeStep({ index: 1, startedMs: 1000, durationMs: 1000 }),
    makeStep({ index: 2, startedMs: 2000, durationMs: 2000 }),
    makeStep({ index: 3, startedMs: 4000, durationMs: 3000 }),
  ];
  const trace = makeTrace(steps, 6000);

  const lines = renderTimeline(trace, { paint, width: 80 });

  assert.strictEqual(lines.length, 4);
  assert.match(lines[0], /1\.0s|1000ms/);
  assert.match(lines[1], /2\.0s|2000ms/);
  assert.match(lines[2], /3\.0s|3000ms/);
  assert.match(lines[3], /0s/);
  assert.match(lines[3], /6\.0s/);
});

test('cached step renders ░ and CACHED', () => {
  const steps = [
    makeStep({ index: 1, startedMs: 1000, durationMs: 1000, cached: false }),
    makeStep({ index: 2, startedMs: 2000, durationMs: 0, cached: true }),
  ];
  const trace = makeTrace(steps, 1500);

  const lines = renderTimeline(trace, { paint, width: 80 });

  assert.match(lines[1], /CACHED/);
  assert.match(lines[1], /░/);
});

test('overlapping parallel steps produce bars with overlapping column ranges', () => {
  const steps = [
    makeStep({ index: 1, startedMs: 1000, durationMs: 1000 }),
    makeStep({ index: 2, startedMs: 1500, durationMs: 1500 }),
  ];
  const trace = makeTrace(steps, 2000);

  const lines = renderTimeline(trace, { paint, width: 80 });

  const line0 = lines[0];
  const line1 = lines[1];

  const firstBarStart = line0.indexOf('█');
  const secondBarStart = line1.indexOf('█');
  assert.ok(firstBarStart < secondBarStart);

  const firstBarEnd = line0.lastIndexOf('█');
  assert.ok(firstBarEnd >= secondBarStart);
});

test('long command is truncated with …', () => {
  const longCmd = 'RUN ' + 'x'.repeat(100);
  const steps = [makeStep({ command: longCmd })];
  const trace = makeTrace(steps, 5000);

  const lines = renderTimeline(trace, { paint });

  assert.match(lines[0], /…/);
});

test('no output line exceeds requested width', () => {
  const steps = Array(5)
    .fill(0)
    .map((_, i) =>
      makeStep({
        index: i + 1,
        startedMs: 1000 + i * 500,
        durationMs: 500,
        command: 'RUN ' + 'y'.repeat(30),
      }),
    );
  const trace = makeTrace(steps, 5000);

  const width = 80;
  const lines = renderTimeline(trace, { paint, width });

  for (const line of lines) {
    assert.ok(line.length <= width, `Line too long: ${line.length} > ${width}`);
  }
});

test('fixture: build-rawjson-uncached parses and renders without error', () => {
  const fixturePath = join(__dir, 'fixtures', 'build-rawjson-uncached.ndjson');
  const ndjson = readFileSync(fixturePath, 'utf8');

  const trace = parseBuildTrace(ndjson);
  const lines = renderTimeline(trace, { paint });

  assert.ok(Array.isArray(lines));
  assert.ok(lines.length > 0);

  for (const line of lines) {
    assert.ok(line.length <= 80);
  }
});

test('internal step names are used as labels', () => {
  const steps = [
    makeStep({
      index: 1,
      startedMs: 1000,
      durationMs: 500,
      internal: true,
      name: 'exporting to image',
    }),
  ];
  const trace = makeTrace(steps, 2000);

  const lines = renderTimeline(trace, { paint });

  assert.match(lines[0], /exporting to image/);
});

test('bar renders at least 1 glyph when duration > 0', () => {
  const steps = [
    makeStep({
      index: 1,
      startedMs: 1000,
      durationMs: 1,
      durationMs: 1,
    }),
  ];
  const trace = makeTrace(steps, 1000000);

  const lines = renderTimeline(trace, { paint, width: 80 });

  const line = lines[0];
  assert.ok(line.includes('█'));
});

test('zero duration step renders ▏ marker', () => {
  const steps = [makeStep({ index: 1, startedMs: 1000, durationMs: 0, cached: false })];
  const trace = makeTrace(steps, 1000);

  const lines = renderTimeline(trace, { paint });

  assert.match(lines[0], /▏/);
});

test('axis line shows total duration aligned right', () => {
  const steps = [makeStep({ startedMs: 1000, durationMs: 5000 })];
  const trace = makeTrace(steps, 5000);

  const lines = renderTimeline(trace, { paint });
  const axisLine = lines[1];

  assert.match(axisLine, /0s/);
  assert.match(axisLine, /5\.0s/);
  assert.ok(axisLine.indexOf('5.0s') > axisLine.indexOf('0s'));
});

test('multiple steps with varying durations show monotonic bar growth', () => {
  const steps = [
    makeStep({ index: 1, startedMs: 0, durationMs: 1000 }),
    makeStep({ index: 2, startedMs: 1000, durationMs: 2000 }),
    makeStep({ index: 3, startedMs: 3000, durationMs: 3000 }),
  ];
  const trace = makeTrace(steps, 6000);

  const lines = renderTimeline(trace, { paint });

  const barCounts = lines.slice(0, 3).map(line => {
    let count = 0;
    for (const c of line) {
      if (c === '█') count++;
    }
    return count;
  });

  for (let i = 1; i < barCounts.length; i++) {
    assert.ok(barCounts[i] >= barCounts[i - 1], 'Bar lengths should be monotonically non-decreasing');
  }
});

test('empty steps array returns empty array', () => {
  const trace = makeTrace([], 0);
  const lines = renderTimeline(trace, { paint });
  assert.strictEqual(lines.length, 0);
});

test('null buildTrace returns empty array', () => {
  const lines = renderTimeline(null, { paint });
  assert.strictEqual(lines.length, 0);
});
