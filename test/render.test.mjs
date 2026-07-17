import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../lib/model/report.mjs';
import { makeFinding } from '../lib/model/finding.mjs';
import { renderHuman } from '../lib/render/human.mjs';
import { renderJson } from '../lib/render/json.mjs';
import { CATEGORY, SEVERITY } from '../lib/constants.mjs';

function sampleReport() {
  return buildReport({
    command: 'build',
    buildTrace: { totalDurationMs: 71_400, cachedCount: 3, buildStepCount: 9, steps: [] },
    image: { totalBytes: 812_000_000, layers: new Array(9).fill({}) },
    findings: [
      makeFinding({ ruleId: 'context-bloat', category: CATEGORY.CONTEXT, severity: SEVERITY.LOW, title: 'ctx', detail: 'd' }),
      makeFinding({ ruleId: 'cache-invalidation', category: CATEGORY.CACHE, severity: SEVERITY.HIGH, title: 'cache busts', detail: 'd', location: { line: 8 }, suggestedFix: 'reorder' }),
      makeFinding({ ruleId: 'slow-step', category: CATEGORY.BUILD_TIME, severity: SEVERITY.MEDIUM, title: 'slow', detail: 'd', location: { step: 6 } }),
    ],
  });
}

test('human summary shows headline metrics and grouped findings', () => {
  const out = renderHuman(sampleReport(), { color: false });
  assert.match(out, /dexplain build/);
  assert.match(out, /built in 71\.4s/);
  assert.match(out, /cache 3\/9 steps/);
  assert.match(out, /image 812MB/);
  assert.match(out, /CACHE/);
  assert.match(out, /cache-invalidation/);
  assert.match(out, /Dockerfile:8/);
  assert.match(out, /→ reorder/);
  assert.match(out, /3 findings \(1 high\)/);
});

test('human summary is plain text when color is disabled and styled when enabled', () => {
  assert.ok(!renderHuman(sampleReport(), { color: false }).includes('\x1b['));
  assert.ok(renderHuman(sampleReport(), { color: true }).includes('\x1b['));
});

test('human summary handles the empty case', () => {
  const empty = buildReport({ command: 'dockerfile', dockerfile: { instructions: [], stages: [] } });
  assert.match(renderHuman(empty, { color: false }), /no findings/);
});

test('json output is valid and findings are ranked most-severe first', () => {
  const parsed = JSON.parse(renderJson(sampleReport()));
  assert.equal(parsed.findings.length, 3);
  assert.equal(parsed.findings[0].severity, SEVERITY.HIGH);
  assert.equal(parsed.findings.at(-1).severity, SEVERITY.LOW);
  assert.equal(parsed.summary.bySeverity.high, 1);
});

test('human summary displays failure block when buildTrace has a failedStep', () => {
  const reportWithFailure = buildReport({
    command: 'build',
    buildTrace: {
      totalDurationMs: 5000,
      cachedCount: 0,
      buildStepCount: 3,
      steps: [
        {
          internal: false,
          name: '[3/3] RUN failing-cmd',
          digest: 'sha256:abc123',
          error: 'process "/bin/sh -c failing-cmd" did not complete successfully: exit code: 1',
          logTail: ['error line 1', 'error line 2'],
        },
      ],
      failedStep: {
        internal: false,
        name: '[3/3] RUN failing-cmd',
        digest: 'sha256:abc123',
        error: 'process "/bin/sh -c failing-cmd" did not complete successfully: exit code: 1',
        logTail: ['error line 1', 'error line 2'],
      },
    },
  });
  const out = renderHuman(reportWithFailure, { color: false });
  assert.match(out, /BUILD FAILED at/);
  assert.match(out, /\[3\/3\] RUN failing-cmd/);
  assert.match(out, /exit code: 1/);
  assert.match(out, /error line 1/);
  assert.match(out, /error line 2/);
});

test('human summary omits failure block when no failedStep', () => {
  const out = renderHuman(sampleReport(), { color: false });
  assert.ok(!out.includes('BUILD FAILED'));
});
