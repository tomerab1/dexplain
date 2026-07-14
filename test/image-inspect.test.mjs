import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseImageModel } from '../lib/collect/image-inspect.mjs';

const dir = import.meta.dirname;
const historyNdjson = readFileSync(`${dir}/fixtures/history-fixture.ndjson`, 'utf8');
const inspectJson = readFileSync(`${dir}/fixtures/inspect-fixture.json`, 'utf8');

function model() {
  return parseImageModel({ ref: 'dexplain-fixture:latest', historyNdjson, inspectJson });
}

test('reports total as the sum of layer sizes and reads config from inspect', () => {
  const image = model();
  const layerSum = image.layers.reduce((sum, layer) => sum + layer.bytes, 0);
  const largestLayer = Math.max(...image.layers.map((layer) => layer.bytes));
  assert.equal(image.totalBytes, layerSum);
  assert.ok(image.totalBytes >= largestLayer, 'total must never be smaller than a single layer');
  assert.equal(image.architecture, 'arm64');
  assert.deepEqual(image.config.entrypoint, ['docker-entrypoint.sh']);
  assert.equal(image.config.envCount, 8);
});

test('parses layers with sizes and derived instructions', () => {
  const image = model();
  assert.ok(image.layers.length > 0);
  const helloCopy = image.layers.find(
    (layer) => layer.instruction === 'COPY' && layer.createdBy.includes('hello.txt'),
  );
  assert.ok(helloCopy, 'expected the hello.txt COPY layer');
  assert.equal(helloCopy.bytes, 12_300);
  assert.ok(image.layers.some((layer) => layer.instruction === 'RUN'));
});

test('layers are ordered base-first', () => {
  const image = model();
  assert.equal(image.layers[0].index, 0);
  assert.equal(image.layers.at(-1).index, image.layers.length - 1);
});
