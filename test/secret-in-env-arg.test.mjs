import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import secretInEnvArg from '../lib/rules/secret-in-env-arg.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('secret-in-env-arg: ENV API_KEY=abc123 produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV API_KEY=abc123\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
  assert.match(findings[0].title, /API_KEY/);
});

test('secret-in-env-arg: ENV DB_PASSWORD legacy form produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV DB_PASSWORD secret\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
  assert.match(findings[0].title, /DB_PASSWORD/);
});

test('secret-in-env-arg: ARG GITHUB_TOKEN produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nARG GITHUB_TOKEN\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
  assert.match(findings[0].title, /GITHUB_TOKEN/);
});

test('secret-in-env-arg: ENV NODE_ENV=production PORT=3000 produces no findings', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV NODE_ENV=production PORT=3000\n'));
  assert.equal(findings.length, 0);
});

test('secret-in-env-arg: ENV AWS_KEY=AKIAIOSFODNN7EXAMPLE produces exactly one HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV AWS_KEY=AKIAIOSFODNN7EXAMPLE\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
  assert.match(findings[0].title, /AWS access key/);
});

test('secret-in-env-arg: ARG BUILD_VERSION=1.2.3 produces no findings', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nARG BUILD_VERSION=1.2.3\n'));
  assert.equal(findings.length, 0);
});

test('secret-in-env-arg: ENV PASSWORD_FIELD=value produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV PASSWORD_FIELD=value\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('secret-in-env-arg: ENV SECRET=abc produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV SECRET=abc\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('secret-in-env-arg: ARG ACCESS_KEY_ID produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nARG ACCESS_KEY_ID\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('secret-in-env-arg: ENV CREDENTIALS=user:pass produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV CREDENTIALS=user:pass\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('secret-in-env-arg: multiple ENV on one line, only secret ones fire', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV NODE_ENV=prod API_TOKEN=xyz\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.name, 'API_TOKEN');
});

test('secret-in-env-arg: ENV with AWS key in value only (not in name) produces AWS finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV SOME_VALUE=AKIAIOSFODNN7EXAMPLE\n'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /AWS access key/);
});

test('secret-in-env-arg: ARG AUTH produces HIGH finding', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nARG AUTH\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test('secret-in-env-arg: empty args produces no findings', () => {
  const findings = secretInEnvArg.evaluate(df('FROM node:20\nENV\n'));
  assert.equal(findings.length, 0);
});
