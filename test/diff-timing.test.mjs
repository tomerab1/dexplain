import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBuildTrace } from '../lib/collect/build-events.mjs';
import { diffTiming } from '../lib/diff/timing.mjs';

const dir = import.meta.dirname;

function makeStep(index, command, durationMs, cached = false, internal = false) {
  return {
    name: internal ? '[internal] load' : `[${index}/5] ${command}`,
    command,
    internal,
    cached,
    startedMs: index * 1000,
    durationMs,
    error: null,
    logTail: null,
    stage: null,
    instruction: null,
    position: index,
  };
}

function makeTrace(steps, totalDurationMs) {
  return { steps, totalDurationMs, buildStepCount: steps.filter((s) => !s.internal).length, cachedCount: steps.filter((s) => !s.internal && s.cached).length, failedStep: null };
}

test('diff-timing: identical non-internal steps produce zero deltas', () => {
  const traceA = makeTrace([makeStep(1, 'RUN build', 1000)], 1000);
  const traceB = makeTrace([makeStep(1, 'RUN build', 1000)], 1000);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps.length, 1);
  assert.equal(diff.steps[0].deltaMs, 0);
  assert.equal(diff.wallDeltaMs, 0);
  assert.equal(diff.cacheLost.length, 0);
  assert.equal(diff.cacheGained.length, 0);
});

test('diff-timing: step duration increases', () => {
  const traceA = makeTrace([makeStep(1, 'RUN build', 1000)], 1000);
  const traceB = makeTrace([makeStep(1, 'RUN build', 1500)], 1500);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps.length, 1);
  assert.equal(diff.steps[0].durationA, 1000);
  assert.equal(diff.steps[0].durationB, 1500);
  assert.equal(diff.steps[0].deltaMs, 500);
  assert.equal(diff.wallDeltaMs, 500);
});

test('diff-timing: step duration decreases', () => {
  const traceA = makeTrace([makeStep(1, 'RUN build', 2000)], 2000);
  const traceB = makeTrace([makeStep(1, 'RUN build', 1200)], 1200);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps[0].deltaMs, -800);
  assert.equal(diff.wallDeltaMs, -800);
});

test('diff-timing: cache gained when step went from uncached to cached', () => {
  const traceA = makeTrace([makeStep(1, 'RUN build', 1000, false)], 1000);
  const traceB = makeTrace([makeStep(1, 'RUN build', 0, true)], 0);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.cacheGained.length, 1);
  assert.equal(diff.cacheGained[0].command, 'RUN build');
  assert.equal(diff.cacheGained[0].savings, 1000);
  assert.equal(diff.cacheLost.length, 0);
});

test('diff-timing: cache lost when step went from cached to uncached', () => {
  const traceA = makeTrace([makeStep(1, 'RUN build', 0, true)], 0);
  const traceB = makeTrace([makeStep(1, 'RUN build', 1500, false)], 1500);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.cacheLost.length, 1);
  assert.equal(diff.cacheLost[0].command, 'RUN build');
  assert.equal(diff.cacheLost[0].cost, 1500);
  assert.equal(diff.cacheGained.length, 0);
});

test('diff-timing: duplicate steps match in order', () => {
  const traceA = makeTrace([
    makeStep(1, 'RUN npm ci', 2000),
    makeStep(2, 'RUN npm ci', 2000),
    makeStep(3, 'RUN npm ci', 2000),
  ], 2000);
  const traceB = makeTrace([
    makeStep(1, 'RUN npm ci', 1800),
    makeStep(2, 'RUN npm ci', 1900),
    makeStep(3, 'RUN npm ci', 2100),
  ], 2100);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps.length, 3);
  // Sorted by |deltaMs| descending: -200 (200), 100 (100), -100 (100)
  assert.equal(diff.steps[0].deltaMs, -200);
  assert.ok([100, -100].includes(diff.steps[1].deltaMs));
  assert.ok([100, -100].includes(diff.steps[2].deltaMs));
});

test('diff-timing: steps sorted by absolute delta descending', () => {
  const traceA = makeTrace([
    makeStep(1, 'RUN small', 100),
    makeStep(2, 'RUN medium', 1000),
    makeStep(3, 'RUN large', 2000),
  ], 2000);
  const traceB = makeTrace([
    makeStep(1, 'RUN small', 200),
    makeStep(2, 'RUN medium', 1100),
    makeStep(3, 'RUN large', 1000),
  ], 2000);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps.length, 3);
  // Sorted by |delta| descending: 1000, 100, 100
  assert.equal(Math.abs(diff.steps[0].deltaMs), 1000);
  assert.equal(Math.abs(diff.steps[1].deltaMs), 100);
  assert.equal(Math.abs(diff.steps[2].deltaMs), 100);
});

test('diff-timing: internal steps are ignored', () => {
  const traceA = makeTrace([
    makeStep(0, '[internal] load', 500, false, true),
    makeStep(1, 'RUN build', 1000),
    makeStep(2, '[internal] export', 300, false, true),
  ], 1300);
  const traceB = makeTrace([
    makeStep(0, '[internal] load', 600, false, true),
    makeStep(1, 'RUN build', 1200),
    makeStep(2, '[internal] export', 400, false, true),
  ], 1600);
  const diff = diffTiming(traceA, traceB);
  assert.equal(diff.steps.length, 1, 'should only match non-internal steps');
  assert.equal(diff.steps[0].command, 'RUN build');
  assert.equal(diff.wallDeltaMs, 300);
});

test('diff-timing: real fixture uncached vs cached', () => {
  const uncachedNdjson = readFileSync(`${dir}/fixtures/build-rawjson-uncached.ndjson`, 'utf8');
  const cachedNdjson = readFileSync(`${dir}/fixtures/build-rawjson-cached.ndjson`, 'utf8');

  const traceA = parseBuildTrace(uncachedNdjson);
  const traceB = parseBuildTrace(cachedNdjson);

  const diff = diffTiming(traceA, traceB);

  // Cached build should be faster (negative wall delta)
  assert.ok(diff.wallDeltaMs < 0, 'cached build should be faster');

  // Steps should be matched
  assert.ok(diff.steps.length > 0, 'should have matched steps');

  // Cached build should have gained cache on some steps
  assert.ok(diff.cacheGained.length > 0, 'should have cache gained entries');

  // Steps should be sorted by absolute delta descending
  for (let i = 0; i < diff.steps.length - 1; i++) {
    assert.ok(
      Math.abs(diff.steps[i].deltaMs) >= Math.abs(diff.steps[i + 1].deltaMs),
      'steps should be sorted by absolute delta descending'
    );
  }
});

test('diff-timing: cache transitions match step commands', () => {
  const traceA = makeTrace([
    makeStep(1, 'RUN npm ci', 2000, false),
    makeStep(2, 'COPY app', 100, false),
    makeStep(3, 'RUN build', 3000, false),
  ], 3000);
  const traceB = makeTrace([
    makeStep(1, 'RUN npm ci', 0, true),
    makeStep(2, 'COPY app', 100, false),
    makeStep(3, 'RUN build', 2500, false),
  ], 2500);
  const diff = diffTiming(traceA, traceB);

  // npm ci should be in cacheGained
  const npmCached = diff.cacheGained.find((c) => c.command === 'RUN npm ci');
  assert.ok(npmCached, 'npm ci should have cache gained');
  assert.equal(npmCached.savings, 2000);

  // COPY should not have cache transition
  const noCacheTransition = diff.cacheLost.filter((c) => c.command === 'COPY app').length +
    diff.cacheGained.filter((c) => c.command === 'COPY app').length;
  assert.equal(noCacheTransition, 0, 'COPY should not have cache transitions');
});
