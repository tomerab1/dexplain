import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import addInsteadOfCopy from '../lib/rules/add-instead-of-copy.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('add-instead-of-copy flags ADD for plain local files', () => {
  const findings = addInsteadOfCopy.evaluate(df('FROM node:20\nADD src/ /app/\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.LOW);
  assert.equal(findings[0].location.line, 2);
  assert.match(findings[0].title, /ADD used where COPY suffices/);
});

test('add-instead-of-copy ignores ADD for remote URLs', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD https://example.com/x.bin /x\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy ignores ADD for tar archives', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD app.tar.gz /opt/\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy ignores ADD for .tgz', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD rootfs.tgz /\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy ignores ADD for various tar formats', () => {
  const tarVariants = [
    'FROM node:20\nADD archive.tar /opt/',
    'FROM node:20\nADD archive.tar.bz2 /opt/',
    'FROM node:20\nADD archive.tar.xz /opt/',
    'FROM node:20\nADD archive.tbz /opt/',
    'FROM node:20\nADD archive.tbz2 /opt/',
    'FROM node:20\nADD archive.txz /opt/',
  ];

  for (const dockerfile of tarVariants) {
    const findings = addInsteadOfCopy.evaluate(df(dockerfile));
    assert.equal(findings.length, 0, `Should ignore ${dockerfile}`);
  }
});

test('add-instead-of-copy ignores ADD with --checksum flag', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD --checksum=sha256:abc https://e.com/f /f\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy ignores ADD with --from flag', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM base\nFROM node:20\nADD --from=base /app /app\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy flags ADD even with --chown (not deliberate)', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD --chown=app src/ /app/\n')
  );
  assert.equal(findings.length, 1, 'chown alone does not justify ADD');
  assert.equal(findings[0].location.line, 2);
});

test('add-instead-of-copy never flags COPY instructions', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nCOPY src/ /app/\n')
  );
  assert.equal(findings.length, 0);
});

test('add-instead-of-copy handles multiple instructions', () => {
  const dockerfile = `FROM node:20
ADD app.tar.gz /opt/
ADD src/ /app/
COPY package.json /app/
ADD https://example.com/x /x
`;
  const findings = addInsteadOfCopy.evaluate(df(dockerfile));
  assert.equal(findings.length, 1, 'should flag only line 3 (src/ without checksum or URL)');
  assert.equal(findings[0].location.line, 3);
});

test('add-instead-of-copy case-insensitive archive detection', () => {
  const findings = addInsteadOfCopy.evaluate(
    df('FROM node:20\nADD Archive.TAR.GZ /opt/\n')
  );
  assert.equal(findings.length, 0, 'should ignore uppercase .TAR.GZ');
});
