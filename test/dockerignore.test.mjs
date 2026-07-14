import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDockerignoreMatcher } from '../lib/collect/dockerignore.mjs';

const PATTERNS = ['**/node_modules', '/admin', '.env', '.git', 'logs', 'tests', '*.log', '# a comment', ''];
const ignored = makeDockerignoreMatcher(PATTERNS);

test('any-depth **/name excludes the directory at every level', () => {
  assert.equal(ignored('node_modules'), true);
  assert.equal(ignored('admin-ui/node_modules'), true);
  assert.equal(ignored('node_modules/lodash/index.js'), true);
});

test('root-anchored names match at root only', () => {
  assert.equal(ignored('admin'), true);
  assert.equal(ignored('logs/today.log'), true);
  assert.equal(ignored('src/logs'), false);
  assert.equal(ignored('.git'), true);
});

test('a similarly-named sibling is not swept up by an anchored rule', () => {
  assert.equal(ignored('admin-ui'), false);
  assert.equal(ignored('admin-ui/src/app.ts'), false);
});

test('glob patterns and plain source files behave correctly', () => {
  assert.equal(ignored('server.log'), true);
  assert.equal(ignored('src/app.ts'), false);
  assert.equal(ignored('.env'), true);
  assert.equal(ignored('src/.env'), false);
});

test('comments and blank lines are ignored as rules', () => {
  assert.equal(makeDockerignoreMatcher(['# just a comment', ''])('anything'), false);
});
