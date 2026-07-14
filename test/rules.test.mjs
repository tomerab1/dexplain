import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import { runRules, REGISTRY } from '../lib/rules/index.mjs';
import cacheInvalidation from '../lib/rules/cache-invalidation.mjs';
import missingCacheMount from '../lib/rules/missing-cache-mount.mjs';
import noMultistage from '../lib/rules/no-multistage.mjs';
import aptAntipattern from '../lib/rules/apt-antipattern.mjs';
import slowStep from '../lib/rules/slow-step.mjs';
import uncachedExpensiveStep from '../lib/rules/uncached-expensive-step.mjs';
import fatLayer from '../lib/rules/fat-layer.mjs';
import devDepsInFinal from '../lib/rules/dev-deps-in-final.mjs';
import contextBloat from '../lib/rules/context-bloat.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });
const step = (over) => ({ internal: false, cached: false, instruction: 'RUN', durationMs: 0, ...over });

test('cache-invalidation flags COPY . . before install, ignores correct order', () => {
  const bad = cacheInvalidation.evaluate(df('FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm ci\n'));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].severity, SEVERITY.HIGH);
  assert.equal(bad[0].location.line, 3);
  const good = cacheInvalidation.evaluate(df('FROM node:20\nCOPY package.json ./\nRUN npm ci\nCOPY . .\n'));
  assert.equal(good.length, 0);
});

test('missing-cache-mount flags bare npm ci, not a mounted one', () => {
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN npm ci\n')).length, 1);
  const mounted = 'FROM node:20\nRUN --mount=type=cache,target=/root/.npm npm ci\n';
  assert.equal(missingCacheMount.evaluate(df(mounted)).length, 0);
});

test('no-multistage flags a single build+ship stage, not a real multi-stage', () => {
  assert.equal(noMultistage.evaluate(df('FROM node:20\nRUN npm run build\n')).length, 1);
  const multi = 'FROM node:20 AS build\nRUN npm run build\nFROM nginx\nCOPY --from=build /app/dist /usr/share/nginx/html\n';
  assert.equal(noMultistage.evaluate(df(multi)).length, 0);
});

test('apt-antipattern flags split update/install and missing cleanup', () => {
  const split = aptAntipattern.evaluate(df('FROM debian\nRUN apt-get update\nRUN apt-get install -y curl\n'));
  assert.ok(split.some((f) => /separate layers/.test(f.title)));
  assert.ok(split.some((f) => /package lists/.test(f.title)));
  const clean = 'FROM debian\nRUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*\n';
  assert.equal(aptAntipattern.evaluate(df(clean)).length, 0);
});

test('slow-step flags a dominant step by absolute time and share', () => {
  const model = { buildTrace: { totalDurationMs: 10000, steps: [step({ index: 2, command: 'npm ci', durationMs: 6000 }), step({ index: 3, command: 'x', durationMs: 400 })] } };
  const findings = slowStep.evaluate(model);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
  const fast = { buildTrace: { totalDurationMs: 800, steps: [step({ index: 2, command: 'x', durationMs: 400 })] } };
  assert.equal(slowStep.evaluate(fast).length, 0);
});

test('uncached-expensive-step flags an uncached long RUN, ignores cached', () => {
  const model = { buildTrace: { totalDurationMs: 9000, steps: [step({ index: 2, command: 'npm ci', durationMs: 9000 })] } };
  assert.equal(uncachedExpensiveStep.evaluate(model).length, 1);
  const cached = { buildTrace: { totalDurationMs: 0, steps: [step({ index: 2, command: 'npm ci', durationMs: 0, cached: true })] } };
  assert.equal(uncachedExpensiveStep.evaluate(cached).length, 0);
});

test('fat-layer flags large layers largest-first with severity scaling', () => {
  const image = { layers: [{ index: 1, bytes: 200_000_000, createdBy: 'RUN build' }, { index: 2, bytes: 1000, createdBy: 'COPY x' }] };
  const findings = fatLayer.evaluate({ image });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('dev-deps-in-final flags node_modules over the size floor', () => {
  const big = { layers: [{ index: 3, bytes: 20_000_000, createdBy: 'COPY node_modules ./node_modules' }] };
  assert.equal(devDepsInFinal.evaluate({ image: big }).length, 1);
  const small = { layers: [{ index: 3, bytes: 1000, createdBy: 'COPY node_modules ./node_modules' }] };
  assert.equal(devDepsInFinal.evaluate({ image: small }).length, 0);
});

test('context-bloat flags a large context and a missing .dockerignore', () => {
  assert.equal(contextBloat.evaluate({ context: { totalBytes: 30_000_000, hasDockerignore: false } }).length, 1);
  assert.equal(contextBloat.evaluate({ context: { totalBytes: 1000, hasDockerignore: true } }).length, 0);
});

test('runRules runs only rules whose inputs are present', () => {
  const { findings, warnings } = runRules(df('FROM node:20\nCOPY . .\nRUN npm ci\n'));
  assert.ok(findings.length >= 1);
  assert.ok(findings.every((f) => f.category !== 'image-size' || f.ruleId === 'no-multistage'));
  assert.equal(warnings.length, 0);
});

test('runRules isolates a throwing rule as a warning', () => {
  const boom = { id: 'boom', requires: ['dockerfile'], evaluate() { throw new Error('kaboom'); } };
  const { warnings } = runRules(df('FROM node:20\n'), { registry: [boom] });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /boom failed: kaboom/);
});

test('every registered rule declares the required contract fields', () => {
  for (const rule of REGISTRY) {
    assert.equal(typeof rule.id, 'string');
    assert.ok(Array.isArray(rule.requires));
    assert.equal(typeof rule.evaluate, 'function');
  }
});
