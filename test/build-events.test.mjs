import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuildTrace } from '../lib/collect/build-events.mjs';

const dir = import.meta.dirname;
const uncached = readFileSync(`${dir}/fixtures/build-rawjson-uncached.ndjson`, 'utf8');
const cached = readFileSync(`${dir}/fixtures/build-rawjson-cached.ndjson`, 'utf8');

test('parses the five build steps from a real uncached rawjson stream', () => {
  const trace = parseBuildTrace(uncached);
  assert.equal(trace.buildStepCount, 5);
  assert.equal(trace.cachedCount, 0);
  assert.ok(trace.totalDurationMs > 0);
  assert.equal(trace.failedStep, null);
});

test('classifies step name, index, and instruction keyword', () => {
  const trace = parseBuildTrace(uncached);
  const run = trace.steps.find((step) => step.name.startsWith('[2/5]'));
  assert.equal(run.instruction, 'RUN');
  assert.equal(run.index, 2);
  assert.equal(run.stageTotal, 5);
  assert.equal(run.internal, false);
  const copy = trace.steps.find((step) => step.instruction === 'COPY');
  assert.ok(copy, 'expected a COPY step');
});

test('marks internal vertexes and keeps them out of the build-step count', () => {
  const trace = parseBuildTrace(uncached);
  const internal = trace.steps.filter((step) => step.internal);
  assert.ok(internal.length > 0);
  assert.ok(internal.some((step) => step.name.includes('[internal]')));
});

test('a cached rebuild reports cached steps with zero duration', () => {
  const trace = parseBuildTrace(cached);
  assert.ok(trace.cachedCount >= 4, `expected >=4 cached, got ${trace.cachedCount}`);
  for (const step of trace.steps.filter((s) => s.cached && !s.internal)) {
    assert.equal(step.durationMs, 0);
  }
});

test('classifies space-padded step numbers from builds with >=10 steps', () => {
  const padded = [
    '{"vertexes":[{"digest":"a","name":"[ 2/18] RUN npm ci --omit=dev","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:52Z"}]}',
    '{"vertexes":[{"digest":"b","name":"[10/18] RUN npm run build","started":"2026-01-01T00:00:52Z","completed":"2026-01-01T00:01:00Z"}]}',
  ].join('\n');
  const trace = parseBuildTrace(padded);
  assert.equal(trace.buildStepCount, 2);
  const early = trace.steps.find((step) => step.name.includes('[ 2/18]'));
  assert.equal(early.internal, false);
  assert.equal(early.index, 2);
  assert.equal(early.instruction, 'RUN');
  assert.equal(early.durationMs, 52_000);
});

test('tolerates blank and malformed lines', () => {
  const trace = parseBuildTrace(`\n{"vertexes":[{"digest":"a","name":"[1/1] RUN x","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:01Z"}]}\nnot json\n`);
  assert.equal(trace.buildStepCount, 1);
  assert.equal(trace.steps[0].durationMs, 1000);
});
