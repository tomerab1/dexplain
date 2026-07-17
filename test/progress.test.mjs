import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProgressPrinter } from '../lib/render/progress.mjs';

const dir = import.meta.dirname;
const uncached = readFileSync(`${dir}/fixtures/build-rawjson-uncached.ndjson`, 'utf8');
const cached = readFileSync(`${dir}/fixtures/build-rawjson-cached.ndjson`, 'utf8');

test('progress printer collects output lines', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  printer(uncached);

  // Should have start and done lines for each of the 5 build steps
  assert.ok(lines.length > 0, 'expected output lines');

  // Each build step should have a start (→) and done (✓) line
  const startLines = lines.filter((l) => l.startsWith('→'));
  const doneLines = lines.filter((l) => l.startsWith('✓'));

  assert.ok(startLines.length >= 5, `expected >=5 start lines, got ${startLines.length}`);
  assert.ok(doneLines.length >= 5, `expected >=5 done lines, got ${doneLines.length}`);
});

test('progress printer handles chunks split mid-line', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  // Split the uncached fixture into arbitrary-sized chunks
  const chunkSize = 150;
  for (let i = 0; i < uncached.length; i += chunkSize) {
    printer(uncached.slice(i, i + chunkSize));
  }

  // Should still parse all vertexes correctly
  const startLines = lines.filter((l) => l.startsWith('→'));
  const doneLines = lines.filter((l) => l.startsWith('✓'));

  assert.ok(startLines.length >= 5, `with chunking: expected >=5 start lines, got ${startLines.length}`);
  assert.ok(doneLines.length >= 5, `with chunking: expected >=5 done lines, got ${doneLines.length}`);
});

test('progress printer does not emit duplicate lines for the same digest', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  // Feed the same fixture twice (simulating repeated data)
  printer(uncached);
  printer(uncached);

  const startLines = lines.filter((l) => l.startsWith('→'));
  const doneLines = lines.filter((l) => l.startsWith('✓'));

  // Should have same count as before (duplicates suppressed)
  assert.equal(startLines.length, 5, 'should emit exactly 5 start lines even with repeated input');
  assert.equal(doneLines.length, 5, 'should emit exactly 5 done lines even with repeated input');
});

test('progress printer formats cached steps with CACHED marker', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  printer(cached);

  const cachedLines = lines.filter((l) => l.includes('CACHED'));
  assert.ok(cachedLines.length >= 4, `expected >=4 CACHED lines, got ${cachedLines.length}`);

  // All cached lines should end with "  CACHED"
  for (const line of cachedLines) {
    assert.match(line, /  CACHED$/, `cached line should end with '  CACHED': ${line}`);
  }
});

test('progress printer includes durations in done lines for uncached steps', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  printer(uncached);

  const doneLines = lines.filter((l) => l.startsWith('✓'));
  const withDuration = doneLines.filter((l) => /\d+(ms|s)$/.test(l));

  assert.ok(withDuration.length > 0, 'expected at least one line with duration');
});

test('progress printer ignores internal vertexes (names not starting with [)', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  printer(uncached);

  // Look for lines referencing internal operations like "[internal]"
  const internalLines = lines.filter((l) => l.includes('[internal]'));

  assert.equal(internalLines.length, 0, 'should not emit lines for internal steps');
});

test('progress printer truncates long command names', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  // Create a fake event with a very long command (with newline so it gets processed)
  const longCommand = `{"vertexes":[{"digest":"abc123","name":"[1/1] RUN ${'x'.repeat(200)}","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:01Z"}]}\n`;

  printer(longCommand);

  assert.ok(lines.length > 0, 'expected output');
  const line = lines[0];
  assert.ok(line.includes('...'), 'long command should be truncated with "..."');
  assert.ok(line.length < 150, 'output line should be reasonably short');
});

test('progress printer handles malformed JSON gracefully', () => {
  const lines = [];
  const printer = createProgressPrinter((line) => lines.push(line));

  // Create events that progress from started-only to completed
  const mixedInput = `{"vertexes":[{"digest":"good1","name":"[1/2] FROM alpine","started":"2026-01-01T00:00:00Z"}]}
not valid json at all
{"vertexes":[{"digest":"good1","name":"[1/2] FROM alpine","started":"2026-01-01T00:00:00Z","completed":"2026-01-01T00:00:01Z"}]}
bad json again!
{"vertexes":[{"digest":"good2","name":"[2/2] RUN echo hi","started":"2026-01-01T00:00:01Z"}]}
{"vertexes":[{"digest":"good2","name":"[2/2] RUN echo hi","started":"2026-01-01T00:00:01Z","completed":"2026-01-01T00:00:02Z"}]}
`;

  printer(mixedInput);

  // Should parse: start good1, done good1, start good2, done good2 = 4 lines total, skipping bad JSON
  assert.equal(lines.length, 4, 'should emit 2 start + 2 done lines (4 total), skipping bad JSON');
});
