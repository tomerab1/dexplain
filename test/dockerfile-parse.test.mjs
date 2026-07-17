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

test('shellText equals args for plain shell-form RUN', () => {
  const { instructions } = parseDockerfile('FROM alpine\nRUN npm ci');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.shellText, run.args);
  assert.equal(run.shellText, 'npm ci');
});

test('exec-form RUN with valid JSON array sets execForm and shellText', () => {
  const { instructions } = parseDockerfile('FROM alpine\nRUN ["npm","ci"]');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.execForm, true);
  assert.equal(run.shellText, 'npm ci');
});

test('malformed exec-form falls back to shell-form', () => {
  const { instructions } = parseDockerfile('FROM alpine\nRUN [not json]');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.execForm, undefined);
  assert.equal(run.shellText, '[not json]');
});

test('exec-form with whitespace in JSON', () => {
  const { instructions } = parseDockerfile('FROM alpine\nRUN [ "sh", "-c", "echo hello" ]');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.execForm, true);
  assert.equal(run.shellText, 'sh -c echo hello');
});

test('heredoc: RUN <<EOF with body lines and terminator', () => {
  const dockerfile = `FROM alpine
RUN <<EOF
apt-get update
apt-get install -y curl
echo done
EOF
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.delimiter, 'EOF');
  assert.equal(run.heredoc.body, 'apt-get update\napt-get install -y curl\necho done');
  assert.equal(run.shellText, run.heredoc.body);
  const copy = instructions.find((i) => i.keyword === 'COPY');
  assert.equal(copy.line, 7);
});

test('heredoc with <<- and indented terminator', () => {
  const dockerfile = `FROM alpine
RUN <<-EOF
  apt-get update
  apt-get install -y curl
	EOF
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.delimiter, 'EOF');
  assert.equal(run.shellText, '  apt-get update\n  apt-get install -y curl');
});

test('heredoc with single-quoted delimiter', () => {
  const dockerfile = `FROM alpine
RUN <<'EOF'
$VAR is not expanded
EOF
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.delimiter, 'EOF');
  assert.equal(run.shellText, '$VAR is not expanded');
});

test('heredoc with double-quoted delimiter', () => {
  const dockerfile = `FROM alpine
RUN <<"EOF"
quoted heredoc
EOF
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.delimiter, 'EOF');
  assert.equal(run.shellText, 'quoted heredoc');
});

test('unterminated heredoc runs to EOF', () => {
  const dockerfile = `FROM alpine
RUN <<EOF
apt-get update
apt-get install -y curl`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.delimiter, 'EOF');
  assert.equal(run.shellText, 'apt-get update\napt-get install -y curl');
});

test('nested heredoc-like text inside body does not terminate outer heredoc', () => {
  const dockerfile = `FROM alpine
RUN <<EOF
cat <<EOC
inner
EOC
EOF
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.equal(run.heredoc.body, 'cat <<EOC\ninner\nEOC');
  const copy = instructions.find((i) => i.keyword === 'COPY');
  assert.equal(copy.line, 7);
});

test('escape directive with backtick continuation', () => {
  const dockerfile = `# escape=\`
FROM alpine
RUN apt-get update \`
  && apt-get install -y curl
COPY . .`;
  const { instructions, directives } = parseDockerfile(dockerfile);
  assert.equal(directives.escape, '`');
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.match(run.args, /apt-get update.*apt-get install -y curl/);
  assert.equal(run.line, 3);
});

test('backslash continuation unaffected by other escape directives', () => {
  const dockerfile = `FROM alpine
RUN apt-get update \\
  && apt-get install -y curl
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const run = instructions.find((i) => i.keyword === 'RUN');
  assert.match(run.args, /apt-get update.*apt-get install -y curl/);
});

test('directives collected on parse result', () => {
  const dockerfile = `# syntax=docker/dockerfile:1
# escape=\`
FROM alpine`;
  const { directives } = parseDockerfile(dockerfile);
  assert.equal(directives.syntax, 'docker/dockerfile:1');
  assert.equal(directives.escape, '`');
});

test('directives stop after first non-comment non-blank line', () => {
  const dockerfile = `# syntax=docker/dockerfile:1
FROM alpine
# escape=\` (too late)
RUN echo test`;
  const { directives } = parseDockerfile(dockerfile);
  assert.equal(directives.syntax, 'docker/dockerfile:1');
  assert.equal(directives.escape, undefined);
});

test('CRLF and LF files parse identically', () => {
  const lfDockerfile = 'FROM alpine\nRUN npm ci\nCOPY . .';
  const crlfDockerfile = 'FROM alpine\r\nRUN npm ci\r\nCOPY . .';
  const lfResult = parseDockerfile(lfDockerfile);
  const crlfResult = parseDockerfile(crlfDockerfile);
  assert.deepEqual(
    lfResult.instructions.map((i) => ({ keyword: i.keyword, args: i.args, line: i.line })),
    crlfResult.instructions.map((i) => ({ keyword: i.keyword, args: i.args, line: i.line })),
  );
});

test('ONBUILD RUN with shell form', () => {
  const dockerfile = `FROM alpine
ONBUILD RUN npm ci
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const onbuild = instructions.find((i) => i.keyword === 'ONBUILD');
  assert.equal(onbuild.triggered.keyword, 'RUN');
  assert.equal(onbuild.triggered.args, 'npm ci');
  assert.equal(onbuild.triggered.shellText, 'npm ci');
  assert.equal(onbuild.shellText, 'RUN npm ci');
});

test('ONBUILD with exec-form inner instruction', () => {
  const dockerfile = `FROM alpine
ONBUILD RUN ["npm","ci"]
COPY . .`;
  const { instructions } = parseDockerfile(dockerfile);
  const onbuild = instructions.find((i) => i.keyword === 'ONBUILD');
  assert.equal(onbuild.triggered.keyword, 'RUN');
  assert.equal(onbuild.triggered.execForm, true);
  assert.equal(onbuild.triggered.shellText, 'npm ci');
});

test('ONBUILD COPY', () => {
  const dockerfile = `FROM alpine
ONBUILD COPY . /app
RUN npm ci`;
  const { instructions } = parseDockerfile(dockerfile);
  const onbuild = instructions.find((i) => i.keyword === 'ONBUILD');
  assert.equal(onbuild.triggered.keyword, 'COPY');
  assert.equal(onbuild.triggered.args, '. /app');
  assert.equal(onbuild.shellText, 'COPY . /app');
});
