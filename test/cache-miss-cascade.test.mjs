import { test } from 'node:test';
import assert from 'node:assert/strict';
import cacheMissCascade from '../lib/rules/cache-miss-cascade.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const step = (overrides) => ({
  internal: false,
  stage: null,
  position: 0,
  index: 0,
  cached: false,
  durationMs: 0,
  command: 'RUN true',
  ...overrides,
});

const trace = (steps) => ({ buildTrace: { steps } });

test('cached, cached, MISS, uncached, uncached → one finding for the MISS', () => {
  const model = trace([
    step({ index: 1, position: 0, cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, cached: true, durationMs: 100 }),
    step({ index: 3, position: 2, cached: false, durationMs: 500, command: 'COPY .' }),
    step({ index: 4, position: 3, cached: false, durationMs: 1000 }),
    step({ index: 5, position: 4, cached: false, durationMs: 2000 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location.step, 3);
  assert.equal(findings[0].evidence.downstreamCount, 2);
  assert.equal(findings[0].evidence.downstreamMs, 3000);
  assert.equal(findings[0].estimatedImpact.milliseconds, 3000);
});

test('all-uncached group → NO finding (noise guard)', () => {
  const model = trace([
    step({ index: 1, position: 0, cached: false, durationMs: 500 }),
    step({ index: 2, position: 1, cached: false, durationMs: 1000 }),
    step({ index: 3, position: 2, cached: false, durationMs: 2000 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 0);
});

test('cached, MISS with no uncached successors → NO finding', () => {
  const model = trace([
    step({ index: 1, position: 0, cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, cached: false, durationMs: 500 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 0);
});

test('two stages: stage A cached+MISS+2 uncached, stage B fully cached → exactly one finding attributed to stage A', () => {
  const model = trace([
    step({ index: 1, position: 0, stage: 'build', cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, stage: 'build', cached: false, durationMs: 500, command: 'COPY .' }),
    step({ index: 3, position: 2, stage: 'build', cached: false, durationMs: 1000 }),
    step({ index: 4, position: 3, stage: 'build', cached: false, durationMs: 2000 }),
    step({ index: 1, position: 4, stage: 'final', cached: true, durationMs: 200 }),
    step({ index: 2, position: 5, stage: 'final', cached: true, durationMs: 300 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.stage, 'build');
  assert.equal(findings[0].evidence.downstreamCount, 2);
});

test('severity HIGH when downstream sum >= 30s, MEDIUM below', () => {
  const highImpact = trace([
    step({ index: 1, position: 0, cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, cached: false, durationMs: 500 }),
    step({ index: 3, position: 2, cached: false, durationMs: 20000 }),
    step({ index: 4, position: 3, cached: false, durationMs: 15000 }),
  ]);
  const highFindings = cacheMissCascade.evaluate(highImpact);
  assert.equal(highFindings.length, 1);
  assert.equal(highFindings[0].severity, SEVERITY.HIGH);

  const mediumImpact = trace([
    step({ index: 1, position: 0, cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, cached: false, durationMs: 500 }),
    step({ index: 3, position: 2, cached: false, durationMs: 10000 }),
    step({ index: 4, position: 3, cached: false, durationMs: 10000 }),
  ]);
  const mediumFindings = cacheMissCascade.evaluate(mediumImpact);
  assert.equal(mediumFindings.length, 1);
  assert.equal(mediumFindings[0].severity, SEVERITY.MEDIUM);
});

test('internal steps excluded from grouping/counting', () => {
  const model = trace([
    step({ index: 1, position: 0, cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, internal: true, durationMs: 5000, command: 'exporting to image' }),
    step({ index: 3, position: 2, cached: false, durationMs: 500 }),
    step({ index: 4, position: 3, cached: false, durationMs: 1000 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location.step, 3);
  assert.equal(findings[0].evidence.downstreamCount, 1);
  assert.equal(findings[0].evidence.downstreamMs, 1000);
});

test('multiple cascades in different stages all fire', () => {
  const model = trace([
    step({ index: 1, position: 0, stage: 'build', cached: true, durationMs: 100 }),
    step({ index: 2, position: 1, stage: 'build', cached: false, durationMs: 500 }),
    step({ index: 3, position: 2, stage: 'build', cached: false, durationMs: 1000 }),
    step({ index: 1, position: 3, stage: 'final', cached: true, durationMs: 200 }),
    step({ index: 2, position: 4, stage: 'final', cached: false, durationMs: 600 }),
    step({ index: 3, position: 5, stage: 'final', cached: false, durationMs: 2000 }),
  ]);
  const findings = cacheMissCascade.evaluate(model);
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.evidence.stage === 'build'));
  assert.ok(findings.some((f) => f.evidence.stage === 'final'));
});
