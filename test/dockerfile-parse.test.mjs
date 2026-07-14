import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';

const MULTISTAGE = `# syntax=docker/dockerfile:1
FROM node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
`;

test('extracts instructions with keyword, args, and 1-based line numbers', () => {
  const { instructions } = parseDockerfile(MULTISTAGE);
  const workdir = instructions.find((i) => i.keyword === 'WORKDIR');
  assert.equal(workdir.args, '/app');
  assert.equal(workdir.line, 3);
});

test('tracks multi-stage boundaries and names', () => {
  const { stages, instructions } = parseDockerfile(MULTISTAGE);
  assert.equal(stages.length, 2);
  assert.deepEqual(
    stages.map((s) => s.name),
    ['build', 'runtime'],
  );
  const cmd = instructions.find((i) => i.keyword === 'CMD');
  assert.equal(cmd.stageIndex, 1);
});

test('ignores full-line comments', () => {
  const { instructions } = parseDockerfile(MULTISTAGE);
  assert.ok(instructions.every((i) => i.keyword !== '#'));
  assert.equal(instructions[0].keyword, 'FROM');
});

test('joins line continuations into one instruction', () => {
  const { instructions } = parseDockerfile('FROM alpine\nRUN apt-get update \\\n  && apt-get install -y curl\n');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.match(run.args, /apt-get update.*apt-get install -y curl/);
  assert.equal(run.line, 2);
});
