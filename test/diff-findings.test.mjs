import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEVERITY } from '../lib/constants.mjs';
import { diffFindings } from '../lib/diff/findings.mjs';

function makeFinding(ruleId, title, evidence = {}) {
  return {
    ruleId,
    category: 'test',
    severity: SEVERITY.MEDIUM,
    title,
    detail: 'test detail',
    location: null,
    evidence,
    suggestedFix: null,
    estimatedImpact: null,
    fixRisk: null,
  };
}

test('diff-findings: identical findings remain unchanged', () => {
  const findingsA = [makeFinding('rule-x', 'Title A')];
  const findingsB = [makeFinding('rule-x', 'Title A')];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.introduced.length, 0);
});

test('diff-findings: A-only findings are resolved', () => {
  const findingsA = [makeFinding('rule-x', 'Title A')];
  const findingsB = [];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.resolved.length, 1);
  assert.equal(diff.resolved[0].ruleId, 'rule-x');
  assert.equal(diff.introduced.length, 0);
  assert.equal(diff.unchangedCount, 0);
});

test('diff-findings: B-only findings are introduced', () => {
  const findingsA = [];
  const findingsB = [makeFinding('rule-y', 'Title B')];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.introduced.length, 1);
  assert.equal(diff.introduced[0].ruleId, 'rule-y');
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.unchangedCount, 0);
});

test('diff-findings: same ruleId with different evidence keys are not matched', () => {
  const findingsA = [makeFinding('fat-layer', 'Layer 1', { createdBy: 'RUN npm' })];
  const findingsB = [makeFinding('fat-layer', 'Layer 1', { createdBy: 'RUN pip' })];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.resolved.length, 1);
  assert.equal(diff.introduced.length, 1);
  assert.equal(diff.unchangedCount, 0);
});

test('diff-findings: digits in title are normalized for matching', () => {
  const findingsA = [makeFinding('fat-layer', 'Layer 18 adds 156MB')];
  const findingsB = [makeFinding('fat-layer', 'Layer 17 adds 149MB')];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.introduced.length, 0);
});

test('diff-findings: evidence.createdBy takes precedence over title', () => {
  const findingsA = [makeFinding('rule-x', 'Some title', { createdBy: 'RUN build' })];
  const findingsB = [makeFinding('rule-x', 'Different title', { createdBy: 'RUN build' })];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.introduced.length, 0);
});

test('diff-findings: evidence.name is checked after createdBy', () => {
  const findingsA = [makeFinding('rule-x', 'Title', { name: 'npm' })];
  const findingsB = [makeFinding('rule-x', 'Title', { name: 'npm' })];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
});

test('diff-findings: duplicate findings multiset matching', () => {
  const findingsA = [
    makeFinding('rule-x', 'Title A'),
    makeFinding('rule-x', 'Title A'),
    makeFinding('rule-x', 'Title A'),
  ];
  const findingsB = [
    makeFinding('rule-x', 'Title A'),
    makeFinding('rule-x', 'Title A'),
  ];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 2, 'should match the first two');
  assert.equal(diff.resolved.length, 1, 'third A should be resolved');
  assert.equal(diff.introduced.length, 0);
});

test('diff-findings: duplicate findings with B having more', () => {
  const findingsA = [makeFinding('rule-x', 'Title A')];
  const findingsB = [
    makeFinding('rule-x', 'Title A'),
    makeFinding('rule-x', 'Title A'),
  ];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.introduced.length, 1);
});

test('diff-findings: mixed resolved, introduced, and unchanged', () => {
  const findingsA = [
    makeFinding('rule-1', 'Title 1'),
    makeFinding('rule-2', 'Title 2'),
    makeFinding('rule-3', 'Title 3'),
  ];
  const findingsB = [
    makeFinding('rule-1', 'Title 1'),
    makeFinding('rule-4', 'Title 4'),
  ];
  const diff = diffFindings(findingsA, findingsB);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.resolved.length, 2, 'rule-2 and rule-3 should be resolved');
  assert.equal(diff.introduced.length, 1, 'rule-4 should be introduced');
});

test('diff-findings: first present evidence key wins', () => {
  const findingsA = [
    makeFinding('rule-x', 'Title', { createdBy: 'RUN', name: 'node', image: 'node:20' }),
  ];
  const findingsB = [
    makeFinding('rule-x', 'Title', { name: 'node', image: 'node:20' }),
  ];
  const diff = diffFindings(findingsA, findingsB);
  // A uses createdBy as key, B uses name as key (createdBy missing), so no match
  assert.equal(diff.resolved.length, 1);
  assert.equal(diff.introduced.length, 1);
});
