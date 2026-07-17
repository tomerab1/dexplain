import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureContext } from '../lib/collect/context-size.mjs';

function tempContext(setup) {
  const contextDir = mkdtempSync(join(tmpdir(), 'dexplain-'));
  setup(contextDir);
  return contextDir;
}

test('symlink: counted as 1 file with 0 bytes, not descended', () => {
  const contextDir = tempContext((dir) => {
    mkdirSync(join(dir, 'real'));
    writeFileSync(join(dir, 'real', 'file.txt'), 'content');
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
  });
  const result = measureContext(contextDir);
  assert.equal(result.fileCount, 2);
  assert.equal(result.totalBytes, 7);
});

test('ignored dir with negated re-include: byte count includes only re-included file', () => {
  const contextDir = tempContext((dir) => {
    mkdirSync(join(dir, 'ignored'));
    writeFileSync(join(dir, 'ignored', 'a.txt'), 'aaa');
    writeFileSync(join(dir, 'ignored', 'b.txt'), 'bbb');
    writeFileSync(join(dir, '.dockerignore'), 'ignored\n!ignored/b.txt\n');
  });
  const result = measureContext(contextDir);
  assert.equal(result.totalBytes, 23 + 3);
  assert.equal(result.fileCount, 2);
});

test('Dockerfile ignored by * pattern is still counted', () => {
  const contextDir = tempContext((dir) => {
    writeFileSync(join(dir, 'Dockerfile'), 'FROM alpine');
    writeFileSync(join(dir, '.dockerignore'), '*\n');
  });
  const result = measureContext(contextDir);
  assert.ok(result.fileCount >= 1);
  assert.ok(result.totalBytes >= 11);
});

test('.dockerignore is always counted', () => {
  const contextDir = tempContext((dir) => {
    writeFileSync(join(dir, '.dockerignore'), 'ignored\npatterns\n');
    writeFileSync(join(dir, 'Dockerfile'), 'FROM alpine');
  });
  const result = measureContext(contextDir);
  assert.equal(result.totalBytes, 17 + 11);
  assert.equal(result.fileCount, 2);
});

test('no double-count: Dockerfile and .dockerignore already in tree', () => {
  const contextDir = tempContext((dir) => {
    writeFileSync(join(dir, 'Dockerfile'), 'FROM alpine');
    writeFileSync(join(dir, '.dockerignore'), 'ignore\n');
  });
  const result = measureContext(contextDir);
  const expected = 11 + 7;
  assert.equal(result.totalBytes, expected);
  assert.equal(result.fileCount, 2);
});
