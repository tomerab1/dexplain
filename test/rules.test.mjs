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
import { matchPackageManager } from '../lib/rules/helpers.mjs';
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
  const clean = 'FROM debian\nRUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\n';
  assert.equal(aptAntipattern.evaluate(df(clean)).length, 0);
});

test('apt-antipattern matches flags between command and subcommand', () => {
  const flagged = aptAntipattern.evaluate(df('FROM ubuntu\nRUN apt-get update && apt-get -y install curl\n'));
  assert.ok(flagged.some((f) => /package lists/.test(f.title)));
  assert.ok(matchPackageManager('apt-get -y install curl'));
  assert.ok(matchPackageManager('apt-get --no-install-recommends install curl'));
});

test('apt-antipattern flags installs that pull recommended packages', () => {
  const noisy = aptAntipattern.evaluate(df('FROM debian\nRUN apt-get update && apt-get -y install curl && rm -rf /var/lib/apt/lists/*\n'));
  assert.ok(noisy.some((f) => /recommended packages/.test(f.title) && f.fixRisk === 'high'));
  const slim = 'FROM debian\nRUN apt-get update && apt-get -y install --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\n';
  assert.ok(!aptAntipattern.evaluate(df(slim)).some((f) => /recommended packages/.test(f.title)));
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

test('context-bloat ignores tiny contexts without .dockerignore but flags large ones', () => {
  // 500 bytes without .dockerignore should NOT fire the missing-ignore complaint
  const tinyNoIgnore = contextBloat.evaluate({ context: { totalBytes: 500, hasDockerignore: false } });
  assert.equal(tinyNoIgnore.length, 0, 'tiny context without .dockerignore should not fire');

  // 1.5 MB without .dockerignore SHOULD fire the missing-ignore complaint with severity medium
  const largeNoIgnore = contextBloat.evaluate({ context: { totalBytes: 1.5e6, hasDockerignore: false } });
  assert.equal(largeNoIgnore.length, 1, 'large context without .dockerignore should fire');
  assert.equal(largeNoIgnore[0].severity, 'medium', 'missing .dockerignore should be medium severity');
  assert.ok(/no \.dockerignore/.test(largeNoIgnore[0].title), 'title should mention missing .dockerignore');

  // Very large context with .dockerignore should fire with low severity (no .dockerignore complaint)
  const hugeWithIgnore = contextBloat.evaluate({ context: { totalBytes: 30_000_000, hasDockerignore: true } });
  assert.equal(hugeWithIgnore.length, 1, 'huge context should fire');
  assert.equal(hugeWithIgnore[0].severity, 'low', 'huge context with .dockerignore should be low severity');
  assert.ok(!/no \.dockerignore/.test(hugeWithIgnore[0].title), 'title should not mention missing .dockerignore');
});

test('missing-cache-mount yarn regex: matches install/add/bare, not build/test/run', () => {
  // Should fire: yarn install
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn install\n')).length, 1, 'yarn install should fire');

  // Should fire: yarn add package
  const yarnAdd = missingCacheMount.evaluate(df('FROM node:20\nRUN yarn add lodash\n'));
  assert.equal(yarnAdd.length, 1, 'yarn add should fire');

  // Should fire: bare yarn
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn\n')).length, 1, 'bare yarn should fire');

  // Should fire: yarn with flags
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn --frozen-lockfile\n')).length, 1, 'yarn with flags should fire');

  // Should NOT fire: yarn build
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn build\n')).length, 0, 'yarn build should not fire');

  // Should NOT fire: yarn run build
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn run build\n')).length, 0, 'yarn run build should not fire');

  // Should NOT fire: yarn test
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn test\n')).length, 0, 'yarn test should not fire');

  // Should NOT fire: yarn dev
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn dev\n')).length, 0, 'yarn dev should not fire');

  // Should NOT fire: yarn lint
  assert.equal(missingCacheMount.evaluate(df('FROM node:20\nRUN yarn lint\n')).length, 0, 'yarn lint should not fire');
});

test('missing-cache-mount apk: matches apk add but not with --no-cache', () => {
  // Should fire: apk add curl
  const apkAdd = missingCacheMount.evaluate(df('FROM alpine\nRUN apk add curl\n'));
  assert.equal(apkAdd.length, 1, 'apk add should fire');
  assert.equal(apkAdd[0].evidence.packageManager, 'apk', 'evidence should name apk');

  // Should NOT fire: apk add --no-cache (deliberate slim pattern)
  assert.equal(missingCacheMount.evaluate(df('FROM alpine\nRUN apk add --no-cache curl\n')).length, 0, 'apk add --no-cache should not fire');

  // Should NOT fire: apk add curl --no-cache (--no-cache at end)
  assert.equal(missingCacheMount.evaluate(df('FROM alpine\nRUN apk add curl --no-cache\n')).length, 0, 'apk add with --no-cache flag should not fire');
});

test('missing-cache-mount pip: matches python -m pip install', () => {
  // Should fire: pip install
  const pipInstall = missingCacheMount.evaluate(df('FROM python:3.11\nRUN pip install -r requirements.txt\n'));
  assert.equal(pipInstall.length, 1, 'pip install should fire');

  // Should fire: pip3 install
  const pip3Install = missingCacheMount.evaluate(df('FROM python:3.11\nRUN pip3 install -r requirements.txt\n'));
  assert.equal(pip3Install.length, 1, 'pip3 install should fire');

  // Should fire: python -m pip install
  const pythonMPip = missingCacheMount.evaluate(df('FROM python:3.11\nRUN python -m pip install -r requirements.txt\n'));
  assert.equal(pythonMPip.length, 1, 'python -m pip install should fire');

  // Should fire: python3 -m pip install
  const python3MPip = missingCacheMount.evaluate(df('FROM python:3.11\nRUN python3 -m pip install -r requirements.txt\n'));
  assert.equal(python3MPip.length, 1, 'python3 -m pip install should fire');
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
