import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuildTrace } from '../lib/collect/build-events.mjs';

const dir = import.meta.dirname;
const uncached = readFileSync(`${dir}/fixtures/build-rawjson-uncached.ndjson`, 'utf8');
const cached = readFileSync(`${dir}/fixtures/build-rawjson-cached.ndjson`, 'utf8');
const failed = readFileSync(`${dir}/fixtures/build-rawjson-failed.ndjson`, 'utf8');

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

test('classifies multi-stage step names that carry a stage prefix', () => {
  const multi = [
    '{"vertexes":[{"digest":"a","name":"[admin-build 4/8] RUN npm run build","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:26Z"}]}',
    '{"vertexes":[{"digest":"b","name":"[runtime 3/8] RUN apt-get update","started":"2026-01-01T00:00:26Z","completed":"2026-01-01T00:00:36Z"}]}',
  ].join('\n');
  const trace = parseBuildTrace(multi);
  assert.equal(trace.buildStepCount, 2);
  const build = trace.steps.find((step) => step.stage === 'admin-build');
  assert.equal(build.internal, false);
  assert.equal(build.index, 4);
  assert.equal(build.instruction, 'RUN');
  assert.equal(trace.steps.find((step) => step.stage === 'runtime').durationMs, 10_000);
});

test('tolerates blank and malformed lines', () => {
  const trace = parseBuildTrace(`\n{"vertexes":[{"digest":"a","name":"[1/1] RUN x","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:01Z"}]}\nnot json\n`);
  assert.equal(trace.buildStepCount, 1);
  assert.equal(trace.steps[0].durationMs, 1000);
});

test('parses a failed build and extracts the failing step with error and logTail', () => {
  const trace = parseBuildTrace(failed);
  assert.ok(trace.failedStep, 'expected a failedStep');
  assert.ok(trace.failedStep.error.includes('exit code: 127'), `expected exit code in error: ${trace.failedStep.error}`);
  assert.ok(trace.failedStep.error.includes('this-command-does-not-exist'), 'expected command in error');
  assert.ok(trace.failedStep.logTail, 'expected logTail on failed step');
  assert.ok(Array.isArray(trace.failedStep.logTail), 'logTail should be an array');
  assert.ok(trace.failedStep.logTail.some((line) => line.includes('not found')), 'expected "not found" in logTail');
});

test('non-failed steps have logTail null', () => {
  const trace = parseBuildTrace(failed);
  const successfulSteps = trace.steps.filter((step) => !step.error && !step.internal);
  assert.ok(successfulSteps.length > 0, 'expected some non-failed steps');
  for (const step of successfulSteps) {
    assert.equal(step.logTail, null, `expected logTail to be null for successful step ${step.name}`);
  }
});
