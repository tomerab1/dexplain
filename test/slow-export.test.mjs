import { test } from 'node:test';
import assert from 'node:assert/strict';
import slowExport from '../lib/rules/slow-export.mjs';

const step = (overrides) => ({
  internal: false,
  cached: false,
  durationMs: 0,
  name: '[1/1] RUN true',
  ...overrides,
});

const trace = (steps, totalDurationMs) => ({ buildTrace: { steps, totalDurationMs } });

test('flags a build dominated by the export phase', () => {
  const model = trace(
    [
      step({ durationMs: 4000 }),
      step({ internal: true, name: 'exporting to image', durationMs: 12000 }),
    ],
    16000,
  );
  const findings = slowExport.evaluate(model);
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /Exporting the image took 12\.0s/);
  assert.equal(findings[0].severity, 'high');
});

test('sums multiple export vertexes and respects the share threshold', () => {
  const model = trace(
    [
      step({ durationMs: 50000 }),
      step({ internal: true, name: 'exporting layers', durationMs: 4000 }),
      step({ internal: true, name: 'exporting to image', durationMs: 4000 }),
    ],
    58000,
  );
  const findings = slowExport.evaluate(model);
  assert.equal(findings.length, 0);
});

test('ignores fast exports even at a high share', () => {
  const model = trace(
    [step({ internal: true, name: 'exporting to image', durationMs: 3000 })],
    3500,
  );
  assert.equal(slowExport.evaluate(model).length, 0);
});

test('non-export internal steps do not count', () => {
  const model = trace(
    [
      step({ durationMs: 2000 }),
      step({ internal: true, name: 'load build definition from Dockerfile', durationMs: 9000 }),
    ],
    11000,
  );
  assert.equal(slowExport.evaluate(model).length, 0);
});
