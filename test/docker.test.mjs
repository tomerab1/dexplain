import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBuildxVersion } from '../lib/docker.mjs';

test('parseBuildxVersion parses real docker buildx version output', () => {
  const parsed = parseBuildxVersion('github.com/docker/buildx v0.19.2 1fc5647');
  assert.deepEqual(parsed, { major: 0, minor: 19, patch: 2 });
});

test('parseBuildxVersion extracts version from output with different commit format', () => {
  const parsed = parseBuildxVersion('github.com/docker/buildx v0.12.1 abc');
  assert.deepEqual(parsed, { major: 0, minor: 12, patch: 1 });
});

test('parseBuildxVersion handles version with prerelease suffix', () => {
  const parsed = parseBuildxVersion('v0.13.0-rc1');
  assert.deepEqual(parsed, { major: 0, minor: 13, patch: 0 });
});

test('parseBuildxVersion returns null for unparseable input', () => {
  assert.equal(parseBuildxVersion('garbage'), null);
  assert.equal(parseBuildxVersion(''), null);
  assert.equal(parseBuildxVersion('no version here'), null);
});

test('parseBuildxVersion handles version without patch', () => {
  const parsed = parseBuildxVersion('v1.2');
  assert.deepEqual(parsed, { major: 1, minor: 2, patch: 0 });
});

test('parseBuildxVersion tolerates desktop and other suffixes', () => {
  const parsed = parseBuildxVersion('github.com/docker/buildx v0.19.2-desktop.1 412cbb151f1be3f8a94dc4eb03cd1b67f261dec5');
  assert.deepEqual(parsed, { major: 0, minor: 19, patch: 2 });
});
