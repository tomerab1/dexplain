import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDockerignoreMatcher } from '../lib/collect/dockerignore.mjs';

test('any-depth **/name excludes the directory at every level', () => {
  const { ignores } = makeDockerignoreMatcher(['**/node_modules']);
  assert.equal(ignores('node_modules'), true);
  assert.equal(ignores('admin-ui/node_modules'), true);
  assert.equal(ignores('node_modules/lodash/index.js'), true);
});

test('root-anchored names match at root only', () => {
  const { ignores } = makeDockerignoreMatcher(['/admin', 'logs', '.git']);
  assert.equal(ignores('admin'), true);
  assert.equal(ignores('logs/today.log'), true);
  assert.equal(ignores('src/logs'), false);
  assert.equal(ignores('.git'), true);
});

test('a similarly-named sibling is not swept up by an anchored rule', () => {
  const { ignores } = makeDockerignoreMatcher(['/admin']);
  assert.equal(ignores('admin-ui'), false);
  assert.equal(ignores('admin-ui/src/app.ts'), false);
});

test('glob patterns and plain source files behave correctly', () => {
  const { ignores } = makeDockerignoreMatcher(['*.log', '.env']);
  assert.equal(ignores('server.log'), true);
  assert.equal(ignores('src/app.ts'), false);
  assert.equal(ignores('.env'), true);
  assert.equal(ignores('src/.env'), false);
});

test('comments and blank lines are ignored as rules', () => {
  const { ignores } = makeDockerignoreMatcher(['# just a comment', '']);
  assert.equal(ignores('anything'), false);
});

test('negation: ! re-includes a file within an ignored directory', () => {
  const { ignores } = makeDockerignoreMatcher(['node_modules', '!node_modules/keep.txt']);
  assert.equal(ignores('node_modules'), true);
  assert.equal(ignores('node_modules/lodash/index.js'), true);
  assert.equal(ignores('node_modules/keep.txt'), false);
});

test('negation: order matters (last match wins)', () => {
  const { ignores: ignores1 } = makeDockerignoreMatcher(['!keep.txt', 'node_modules']);
  assert.equal(ignores1('node_modules/keep.txt'), true);

  const { ignores: ignores2 } = makeDockerignoreMatcher(['node_modules', '!node_modules/keep.txt']);
  assert.equal(ignores2('node_modules/keep.txt'), false);
});

test('negation: triple pattern with last-match-wins', () => {
  const { ignores } = makeDockerignoreMatcher(['*.log', '!important.log', '*.log']);
  assert.equal(ignores('debug.log'), true);
  assert.equal(ignores('important.log'), true);
});

test('** anywhere: a/**/b matches a/b, a/x/b, a/x/y/b', () => {
  const { ignores } = makeDockerignoreMatcher(['a/**/b']);
  assert.equal(ignores('a/b'), true);
  assert.equal(ignores('a/x/b'), true);
  assert.equal(ignores('a/x/y/b'), true);
  assert.equal(ignores('a/bc'), false);
  assert.equal(ignores('a/c/b/x'), false);
});

test('** anywhere: src/** matches everything under src', () => {
  const { ignores } = makeDockerignoreMatcher(['src/**']);
  assert.equal(ignores('src/app.ts'), true);
  assert.equal(ignores('src/lib/helper.js'), true);
  assert.equal(ignores('test/app.ts'), false);
});

test('** anywhere: **/name matches at any depth', () => {
  const { ignores } = makeDockerignoreMatcher(['**/test']);
  assert.equal(ignores('test'), true);
  assert.equal(ignores('src/test'), true);
  assert.equal(ignores('a/b/c/test'), true);
  assert.equal(ignores('src/testing'), false);
});

test('canPruneDir: fast path with no negations', () => {
  const { canPruneDir } = makeDockerignoreMatcher(['node_modules', '.git', '*.log']);
  assert.equal(canPruneDir('node_modules'), true);
  assert.equal(canPruneDir('.git'), true);
  assert.equal(canPruneDir('src'), false);
});

test('canPruneDir: true when ignored dir has no negations affecting it', () => {
  const { canPruneDir } = makeDockerignoreMatcher(['node_modules', '!other/keep.txt']);
  assert.equal(canPruneDir('node_modules'), true);
  assert.equal(canPruneDir('other'), false);
});

test('canPruneDir: false when negation pattern starts with dirPrefix', () => {
  const { canPruneDir } = makeDockerignoreMatcher(['node_modules', '!node_modules/keep.txt']);
  assert.equal(canPruneDir('node_modules'), false);
});

test('canPruneDir: false when negation contains **', () => {
  const { canPruneDir } = makeDockerignoreMatcher(['src', '!**/keep.txt']);
  assert.equal(canPruneDir('src'), false);
});

test('canPruneDir: false when dir not ignored', () => {
  const { canPruneDir } = makeDockerignoreMatcher(['node_modules', '!src/keep.txt']);
  assert.equal(canPruneDir('src'), false);
});
