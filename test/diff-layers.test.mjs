import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseImageModel } from '../lib/collect/image-inspect.mjs';
import { diffLayers } from '../lib/diff/layers.mjs';

const dir = import.meta.dirname;

test('diff-layers: matched pair with equal bytes omits zero-delta', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 100,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 100,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.changed.length, 0, 'equal bytes should not produce changed entries');
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.totalDeltaBytes, 0);
});

test('diff-layers: matched pair with byte difference includes delta', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 100,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 150,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 150, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].createdBy, 'RUN build');
  assert.equal(diff.changed[0].bytesA, 100);
  assert.equal(diff.changed[0].bytesB, 150);
  assert.equal(diff.changed[0].deltaBytes, 50);
  assert.equal(diff.totalDeltaBytes, 50);
});

test('diff-layers: delta can be negative', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 100,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 60,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 60, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.changed[0].deltaBytes, -40);
  assert.equal(diff.totalDeltaBytes, -40);
});

test('diff-layers: unmatched A layers are removed', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 150,
    layers: [
      { index: 0, createdBy: 'COPY app', bytes: 50, empty: false, instruction: 'COPY' },
      { index: 1, createdBy: 'RUN build', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 50,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 50, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].createdBy, 'COPY app');
  assert.equal(diff.removed[0].bytes, 50);
  assert.equal(diff.added.length, 0);
});

test('diff-layers: unmatched B layers are added', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 50,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 50, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 150,
    layers: [
      { index: 0, createdBy: 'RUN build', bytes: 50, empty: false, instruction: 'RUN' },
      { index: 1, createdBy: 'COPY app', bytes: 100, empty: false, instruction: 'COPY' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].createdBy, 'COPY app');
  assert.equal(diff.added[0].bytes, 100);
  assert.equal(diff.removed.length, 0);
});

test('diff-layers: duplicate createdBy values pair in order', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 300,
    layers: [
      { index: 0, createdBy: 'RUN npm', bytes: 100, empty: false, instruction: 'RUN' },
      { index: 1, createdBy: 'RUN npm', bytes: 100, empty: false, instruction: 'RUN' },
      { index: 2, createdBy: 'RUN npm', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 400,
    layers: [
      { index: 0, createdBy: 'RUN npm', bytes: 110, empty: false, instruction: 'RUN' },
      { index: 1, createdBy: 'RUN npm', bytes: 120, empty: false, instruction: 'RUN' },
      { index: 2, createdBy: 'RUN npm', bytes: 170, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.changed.length, 3);
  assert.equal(diff.changed[0].deltaBytes, 10);
  assert.equal(diff.changed[1].deltaBytes, 20);
  assert.equal(diff.changed[2].deltaBytes, 70);
  assert.equal(diff.totalDeltaBytes, 100);
});

test('diff-layers: duplicate createdBy with partial match', () => {
  const imageA = {
    ref: 'test:a',
    totalBytes: 200,
    layers: [
      { index: 0, createdBy: 'RUN clean', bytes: 100, empty: false, instruction: 'RUN' },
      { index: 1, createdBy: 'RUN clean', bytes: 100, empty: false, instruction: 'RUN' },
    ],
  };
  const imageB = {
    ref: 'test:b',
    totalBytes: 150,
    layers: [
      { index: 0, createdBy: 'RUN clean', bytes: 150, empty: false, instruction: 'RUN' },
    ],
  };
  const diff = diffLayers(imageA, imageB);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].deltaBytes, 50);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].bytes, 100);
});

test('diff-layers: real fixture test with history and inspect', () => {
  const historyA = readFileSync(`${dir}/fixtures/history-fixture.ndjson`, 'utf8');
  const inspectA = readFileSync(`${dir}/fixtures/inspect-fixture.json`, 'utf8');
  const historyB = readFileSync(`${dir}/fixtures/history-fixture-b.ndjson`, 'utf8');
  const inspectB = readFileSync(`${dir}/fixtures/inspect-fixture-b.json`, 'utf8');

  const imageA = parseImageModel({ ref: 'dexplain-fixture:a', historyNdjson: historyA, inspectJson: inspectA });
  const imageB = parseImageModel({ ref: 'dexplain-fixture:b', historyNdjson: historyB, inspectJson: inspectB });

  const diff = diffLayers(imageA, imageB);

  // Layer 0 (first custom layer) changed from 4.1kB to 5.2kB
  const changedDone = diff.changed.find((c) => c.createdBy.includes('cat /tmp/a.txt'));
  assert.ok(changedDone, 'should have changed the done layer');
  assert.equal(changedDone.bytesA, 4100);
  assert.equal(changedDone.bytesB, 5200);
  assert.equal(changedDone.deltaBytes, 1100);

  // Layer with "layer two" was removed
  const removedTwo = diff.removed.find((r) => r.createdBy.includes('layer two content bigger'));
  assert.ok(removedTwo, 'should have removed the layer two layer');
  assert.equal(removedTwo.bytes, 12300);

  // Layer with "custom build step" was added
  const addedCustom = diff.added.find((a) => a.createdBy.includes('custom build step'));
  assert.ok(addedCustom, 'should have added the custom layer');
  assert.equal(addedCustom.bytes, 8500);

  // Total delta: B has 5.2 + 12.3 + 8.5 + 12.3 = 38.3kB custom, A has 4.1 + 12.3 + 12.3 + 12.3 = 41kB
  // So delta is -2.7kB = -2700 bytes (plus any changes in postgres layers which should be 0)
  assert.ok(diff.totalDeltaBytes < 0, 'fixture B should be smaller overall');
  assert.ok(diff.totalDeltaBytes >= -3000, 'delta should be around -2.7kB');
});
