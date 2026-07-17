import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import unpinnedBaseImage from '../lib/rules/unpinned-base-image.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('unpinned-base-image flags FROM node with no tag', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM node\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.MEDIUM);
  assert.match(findings[0].title, /no tag.*latest/);
  assert.equal(findings[0].location.line, 1);
});

test('unpinned-base-image flags FROM node:latest', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM node:latest\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, SEVERITY.MEDIUM);
  assert.match(findings[0].title, /not pinned/);
});

test('unpinned-base-image passes FROM node:22-alpine (specific tag)', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM node:22-alpine\n'));
  assert.equal(findings.length, 0);
});

test('unpinned-base-image passes FROM node:22@sha256:abc (digest-pinned)', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM node:22@sha256:abc123def456\n'));
  assert.equal(findings.length, 0);
});

test('unpinned-base-image passes FROM scratch', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM scratch\n'));
  assert.equal(findings.length, 0);
});

test('unpinned-base-image handles multi-stage FROM stage-name correctly', () => {
  const dockerfile = 'FROM golang:1.22 AS build\nRUN go build -o app .\nFROM build\nCOPY --from=build /app .\n';
  const findings = unpinnedBaseImage.evaluate(df(dockerfile));
  // First stage (golang:1.22) is pinned, so no finding
  // Second stage (FROM build, a stage ref) should be skipped
  assert.equal(findings.length, 0, 'stage reference should not trigger finding');
});

test('unpinned-base-image passes FROM ${BASE_IMAGE} (variable)', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM ${BASE_IMAGE}\n'));
  assert.equal(findings.length, 0);
});

test('unpinned-base-image flags FROM myreg.io:5000/app (port, not tag)', () => {
  // ':5000' is a port, not a tag; the image has no tag (no ':' after the '/')
  const findings = unpinnedBaseImage.evaluate(df('FROM myreg.io:5000/app\n'));
  assert.equal(findings.length, 1);
  assert.match(findings[0].title, /no tag.*latest/);
});

test('unpinned-base-image passes FROM myreg.io:5000/app:1.2 (port + tag)', () => {
  // ':5000' is a port, ':1.2' is the tag (after the '/'), so it's pinned
  const findings = unpinnedBaseImage.evaluate(df('FROM myreg.io:5000/app:1.2\n'));
  assert.equal(findings.length, 0);
});

test('unpinned-base-image evidence includes the image', () => {
  const findings = unpinnedBaseImage.evaluate(df('FROM node\n'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].evidence.image, 'node');
});
