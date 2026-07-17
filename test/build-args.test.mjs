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

test('handles --memory flag before context', () => {
  const meta = parseBuildArgs(['--memory', '2g', '.']);
  assert.equal(meta.contextDir, '.');
});

test('handles --memory flag after context', () => {
  const meta = parseBuildArgs(['.', '--memory', '2g']);
  assert.equal(meta.contextDir, '.');
});

test('handles --ulimit flag with tag and context', () => {
  const meta = parseBuildArgs(['--ulimit', 'nofile=1024', '-t', 'x', '.']);
  assert.equal(meta.tag, 'x');
  assert.equal(meta.contextDir, '.');
});

test('accepts a git HTTPS URL as context', () => {
  const meta = parseBuildArgs(['https://github.com/x/y.git']);
  assert.equal(meta.contextDir, 'https://github.com/x/y.git');
});

test('accepts a git SSH URL as context', () => {
  const meta = parseBuildArgs(['git@github.com:x/y.git']);
  assert.equal(meta.contextDir, 'git@github.com:x/y.git');
});

test('prefers an existing directory over junk trailing positional with injected isDir', () => {
  const mockIsDir = (path) => path === '/real/dir';
  const meta = parseBuildArgs(['/real/dir', 'junk'], { isDir: mockIsDir });
  assert.equal(meta.contextDir, '/real/dir');
});

test('falls back to last positional when none are plausible directories', () => {
  const mockIsDir = () => false;
  const meta = parseBuildArgs(['junk1', 'junk2'], { isDir: mockIsDir });
  assert.equal(meta.contextDir, 'junk2');
});

test('accepts stdin (-) as a context', () => {
  const mockIsDir = () => false;
  const meta = parseBuildArgs(['-', 'junk'], { isDir: mockIsDir });
  assert.equal(meta.contextDir, '-');
});
