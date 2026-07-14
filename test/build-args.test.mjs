import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuildArgs } from '../lib/collect/build-args.mjs';

test('finds tag, context, and defaults for a simple invocation', () => {
  const meta = parseBuildArgs(['-t', 'myapp', '.']);
  assert.equal(meta.tag, 'myapp');
  assert.equal(meta.contextDir, '.');
  assert.equal(meta.file, null);
});

test('handles inline =, explicit -f, and a named context dir', () => {
  const meta = parseBuildArgs(['--tag=myapp:1', '--file', 'docker/Dockerfile', 'ctx']);
  assert.equal(meta.tag, 'myapp:1');
  assert.equal(meta.file, 'docker/Dockerfile');
  assert.equal(meta.contextDir, 'ctx');
});

test('skips value-bearing flags when locating the context', () => {
  const meta = parseBuildArgs(['--build-arg', 'FOO=bar', '--platform', 'linux/amd64', '-t', 'x', '.']);
  assert.equal(meta.tag, 'x');
  assert.equal(meta.contextDir, '.');
});

test('detects an explicit --progress and defaults context to .', () => {
  const meta = parseBuildArgs(['--progress=plain']);
  assert.equal(meta.progressPresent, true);
  assert.equal(meta.contextDir, '.');
});
