import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHumanSize, formatBytes } from '../lib/collect/size.mjs';

test('parseHumanSize handles docker base-1000 units', () => {
  assert.equal(parseHumanSize('4.1kB'), 4100);
  assert.equal(parseHumanSize('12.3kB'), 12300);
  assert.equal(parseHumanSize('113MB'), 113_000_000);
  assert.equal(parseHumanSize('2.26GB'), 2_260_000_000);
});

test('parseHumanSize treats bare numbers as bytes and is fault-tolerant', () => {
  assert.equal(parseHumanSize('0B'), 0);
  assert.equal(parseHumanSize('0'), 0);
  assert.equal(parseHumanSize('512'), 512);
  assert.equal(parseHumanSize(''), 0);
  assert.equal(parseHumanSize(null), 0);
  assert.equal(parseHumanSize('garbage'), 0);
});

test('formatBytes round-trips into readable units', () => {
  assert.equal(formatBytes(0), '0B');
  assert.equal(formatBytes(512), '512B');
  assert.equal(formatBytes(4100), '4.1kB');
  assert.equal(formatBytes(113_000_000), '113MB');
});
