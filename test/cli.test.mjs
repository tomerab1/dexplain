import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs, main } from '../lib/cli.mjs';
import { EXIT } from '../lib/constants.mjs';

function fakeIo() {
  const out = [];
  const err = [];
  return { out: (t) => out.push(t), err: (t) => err.push(t), isTTY: false, text: () => out.join('\n'), errors: () => err.join('\n') };
}

test('parseCliArgs splits command, passthrough args, and own flags anywhere', () => {
  assert.deepEqual(parseCliArgs(['build', '-t', 'x', '.']), {
    command: 'build',
    rest: ['-t', 'x', '.'],
    options: { json: false, noColor: false, jsonOut: null, image: null, top: null },
  });
  const withFlags = parseCliArgs(['--json', 'analyze', 'log.ndjson', '--image', 'ref', '--top=5']);
  assert.equal(withFlags.command, 'analyze');
  assert.deepEqual(withFlags.rest, ['log.ndjson']);
  assert.equal(withFlags.options.json, true);
  assert.equal(withFlags.options.image, 'ref');
  assert.equal(withFlags.options.top, 5);
});

test('help and unknown commands behave predictably', async () => {
  const help = fakeIo();
  assert.equal(await main(['help'], help), EXIT.OK);
  assert.match(help.text(), /Usage:/);
  const bad = fakeIo();
  assert.equal(await main(['frobnicate'], bad), EXIT.USAGE);
  assert.match(bad.errors(), /unknown command/);
});

test('dockerfile command runs offline and reports a cache-invalidation finding', async () => {
  const path = join(tmpdir(), `dexplain-cli-${process.pid}.Dockerfile`);
  writeFileSync(path, 'FROM node:20\nWORKDIR /app\nCOPY . .\nRUN npm ci\n');
  try {
    const io = fakeIo();
    const code = await main(['dockerfile', path, '--json'], io);
    assert.equal(code, EXIT.OK);
    const report = JSON.parse(io.text());
    assert.equal(report.meta.command, 'dockerfile');
    assert.ok(report.findings.some((f) => f.ruleId === 'cache-invalidation'));
  } finally {
    rmSync(path, { force: true });
  }
});

test('analyze command ingests a rawjson fixture offline', async () => {
  const fixture = join(import.meta.dirname, 'fixtures', 'build-rawjson-uncached.ndjson');
  const io = fakeIo();
  const code = await main(['analyze', fixture], io);
  assert.equal(code, EXIT.OK);
  assert.match(io.text(), /dexplain analyze/);
});

test('analyze reports a usage error for a missing file argument', async () => {
  const io = fakeIo();
  assert.equal(await main(['analyze'], io), EXIT.USAGE);
});
