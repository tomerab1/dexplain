import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import maintainerDeprecated from '../lib/rules/maintainer-deprecated.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('maintainer-deprecated flags MAINTAINER instruction', () => {
  const findings = maintainerDeprecated.evaluate(df('FROM node:22\nMAINTAINER john <john@example.com>\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.LOW);
  assert.match(findings[0].title, /deprecated/);
  assert.equal(findings[0].location.line, 2);
});

test('maintainer-deprecated passes when no MAINTAINER present', () => {
  const findings = maintainerDeprecated.evaluate(df('FROM node:22\nRUN npm ci\n'));
  assert.equal(findings.length, 0);
});

test('maintainer-deprecated flags multiple MAINTAINER instructions', () => {
  // While unusual, multiple MAINTAINER instructions should each be flagged
  const dockerfile = 'FROM node:22 AS build\nMAINTAINER alice <alice@example.com>\nFROM alpine\nMAINTAINER bob <bob@example.com>\n';
  const findings = maintainerDeprecated.evaluate(df(dockerfile));
  assert.equal(findings.length, 2);
  assert.equal(findings[0].location.line, 2);
  assert.equal(findings[1].location.line, 4);
});

test('maintainer-deprecated uses LOW fixRisk', () => {
  const findings = maintainerDeprecated.evaluate(df('MAINTAINER x <x@y.z>\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].fixRisk, 'low');
});

test('maintainer-deprecated suggestedFix recommends LABEL', () => {
  const findings = maintainerDeprecated.evaluate(df('MAINTAINER test\n'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].suggestedFix, /LABEL maintainer/);
});
