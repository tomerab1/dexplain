import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiffHuman } from '../lib/render/diff-human.mjs';
import { SEVERITY } from '../lib/constants.mjs';

test('diff render: size section paints negative delta green', () => {
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      layers: { totalDeltaBytes: -1000, added: [], removed: [], changed: [] },
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /1\.0kB/);
  assert.match(output, /SIZE/);
});

test('diff render: size section paints positive delta red', () => {
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      layers: { totalDeltaBytes: 5000, added: [], removed: [], changed: [] },
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /5\.0kB/);
  assert.match(output, /SIZE/);
  assert.match(output, /\+/);
});

test('diff render: layers section caps lists at 8 rows', () => {
  const layers = [];
  for (let i = 0; i < 12; i++) {
    layers.push({ createdBy: `RUN echo ${i}`, bytes: 1000 * (i + 1) });
  }
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      layers: { totalDeltaBytes: 0, added: layers, removed: [], changed: [] },
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /added \(12\)/);
  assert.match(output, /\+4 more/);
});

test('diff render: findings section shows introduced and resolved', () => {
  const introduced = [{ ruleId: 'cache-miss', severity: SEVERITY.HIGH, title: 'new cache miss', location: { step: 5 } }];
  const resolved = [{ ruleId: 'slow-step', severity: SEVERITY.MEDIUM, title: 'slow RUN removed', location: null }];
  const diff = {
    a: { ref: 'old:1', findings: resolved },
    b: { ref: 'new:1', findings: introduced },
    deltas: {
      findings: { introduced, resolved, unchangedCount: 3 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /introduced \(1\)/);
  assert.match(output, /resolved \(1\)/);
  assert.match(output, /unchanged: 3/);
  assert.match(output, /new cache miss/);
  assert.match(output, /slow RUN removed/);
});

test('diff render: timing section shows wall clock and cache transitions', () => {
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
      timing: {
        wallDeltaMs: 2000,
        steps: [
          { command: 'RUN npm ci', durationA: 5000, durationB: 7000, deltaMs: 2000, cacheA: true, cacheB: false },
          { command: 'COPY . .', durationA: 100, durationB: 100, deltaMs: 0, cacheA: false, cacheB: false },
        ],
        cacheLost: [{ command: 'RUN npm ci', cost: 7000 }],
        cacheGained: [{ command: 'FROM node', savings: 3000 }],
      },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /wall clock/);
  assert.match(output, /\+2\.0s/);
  assert.match(output, /cache lost/);
  assert.match(output, /cache gained/);
  assert.match(output, /top deltas/);
});

test('diff render: empty diff shows no differences', () => {
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /no differences detected/);
});

test('diff render: headline uses trace paths when present', () => {
  const diff = {
    a: { trace: '/path/to/old.ndjson', findings: [] },
    b: { trace: '/path/to/new.ndjson', findings: [] },
    deltas: {
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /\/path\/to\/old\.ndjson.*\/path\/to\/new\.ndjson/);
});

test('diff render: changed layers show delta with sign', () => {
  const diff = {
    a: { ref: 'old:1', findings: [] },
    b: { ref: 'new:1', findings: [] },
    deltas: {
      layers: {
        totalDeltaBytes: 0,
        added: [],
        removed: [],
        changed: [
          { createdBy: 'RUN npm ci', bytesA: 50000000, bytesB: 60000000, deltaBytes: 10000000 },
          { createdBy: 'COPY src src', bytesA: 20000000, bytesB: 15000000, deltaBytes: -5000000 },
        ],
      },
      findings: { introduced: [], resolved: [], unchangedCount: 0 },
    },
  };
  const output = renderDiffHuman(diff, { color: false });
  assert.match(output, /10\.0MB/);
  assert.match(output, /5\.0MB/);
  assert.match(output, /changed/);
  assert.match(output, /\+10/);
});
