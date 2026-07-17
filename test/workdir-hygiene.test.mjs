import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import workdirHygiene from '../lib/rules/workdir-hygiene.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('workdir-hygiene flags RUN starting with cd', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nRUN cd /app && make\n'));
  assert.equal(findings.length, 1);
  assert.ok(/RUN starts with `cd`/.test(findings[0].title));
  assert.equal(findings[0].location.line, 2);
});

test('workdir-hygiene ignores cd in the middle of a RUN', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nRUN make && cd dist && zip\n'));
  assert.equal(findings.length, 0);
});

test('workdir-hygiene flags WORKDIR with relative path', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nWORKDIR app\n'));
  assert.equal(findings.length, 1);
  assert.ok(/WORKDIR uses a relative path/.test(findings[0].title));
  assert.equal(findings[0].location.line, 2);
});

test('workdir-hygiene ignores WORKDIR with absolute path', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nWORKDIR /app\n'));
  assert.equal(findings.length, 0);
});

test('workdir-hygiene ignores WORKDIR with environment variable', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nWORKDIR $HOME\n'));
  assert.equal(findings.length, 0);
});

test('workdir-hygiene ignores WORKDIR with variable expansion', () => {
  const findings = workdirHygiene.evaluate(df('FROM node:20\nWORKDIR ${APP_DIR}\n'));
  assert.equal(findings.length, 0);
});

test('workdir-hygiene reports both issues when present', () => {
  const findings = workdirHygiene.evaluate(
    df('FROM node:20\nWORKDIR app\nRUN cd /srv && build\n'),
  );
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => /WORKDIR uses a relative path/.test(f.title)));
  assert.ok(findings.some((f) => /RUN starts with `cd`/.test(f.title)));
});

test('workdir-hygiene ignores bare cd as a complete command', () => {
  // A Dockerfile with just "RUN cd" is unusual but we should flag it
  const findings = workdirHygiene.evaluate(df('FROM node:20\nRUN cd /app\n'));
  assert.equal(findings.length, 1);
  assert.ok(/RUN starts with `cd`/.test(findings[0].title));
});
