import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import rootUser from '../lib/rules/root-user.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('root-user: single stage without USER produces one LOW finding', () => {
  const findings = rootUser.evaluate(df('FROM node:20\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.LOW);
  assert.match(findings[0].title, /no USER/);
});

test('root-user: final stage with USER app produces no findings', () => {
  const findings = rootUser.evaluate(df('FROM node:20\nUSER app\n'));
  assert.equal(findings.length, 0);
});

test('root-user: final stage with USER root produces one MEDIUM finding', () => {
  const findings = rootUser.evaluate(df('FROM node:20\nUSER root\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.MEDIUM);
  assert.match(findings[0].title, /explicitly runs as root/);
});

test('root-user: final stage with USER 0 produces one MEDIUM finding', () => {
  const findings = rootUser.evaluate(df('FROM node:20\nUSER 0\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.MEDIUM);
});

test('root-user: USER 0:0 with group suffix produces one MEDIUM finding', () => {
  const findings = rootUser.evaluate(df('FROM node:20\nUSER 0:0\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.MEDIUM);
});

test('root-user: multi-stage where BUILD has USER root but FINAL has USER app produces no findings', () => {
  const dockerfile = 'FROM node:20 AS build\nUSER root\nFROM node:20\nUSER app\n';
  const findings = rootUser.evaluate(df(dockerfile));
  assert.equal(findings.length, 0);
});

test('root-user: USER root followed by USER app in final stage produces no findings', () => {
  const dockerfile = 'FROM node:20\nUSER root\nUSER app\n';
  const findings = rootUser.evaluate(df(dockerfile));
  assert.equal(findings.length, 0);
});

test('root-user: empty stages list returns empty findings', () => {
  const findings = rootUser.evaluate({ dockerfile: { stages: [], instructions: [] } });
  assert.equal(findings.length, 0);
});
