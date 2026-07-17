import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBuildArgs } from '../lib/collect/build-run.mjs';

test('strips --progress with separate value', () => {
  const result = sanitizeBuildArgs(['-t', 'myapp', '--progress', 'plain', '.']);
  assert.deepEqual(result, ['-t', 'myapp', '.']);
});

test('strips --progress with inline value', () => {
  const result = sanitizeBuildArgs(['-t', 'myapp', '--progress=plain', '.']);
  assert.deepEqual(result, ['-t', 'myapp', '.']);
});

test('strips -q flag', () => {
  const result = sanitizeBuildArgs(['-t', 'myapp', '-q', '.']);
  assert.deepEqual(result, ['-t', 'myapp', '.']);
});

test('strips --quiet flag', () => {
  const result = sanitizeBuildArgs(['-t', 'myapp', '--quiet', '.']);
  assert.deepEqual(result, ['-t', 'myapp', '.']);
});

test('preserves all other args in order', () => {
  const result = sanitizeBuildArgs([
    '-t', 'myapp',
    '--build-arg', 'FOO=bar',
    '--progress', 'plain',
    '-q',
    '--platform', 'linux/amd64',
    '.'
  ]);
  assert.deepEqual(result, [
    '-t', 'myapp',
    '--build-arg', 'FOO=bar',
    '--platform', 'linux/amd64',
    '.'
  ]);
});
