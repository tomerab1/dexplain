import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDockerfile } from '../lib/collect/dockerfile-parse.mjs';
import duplicateLifecycle from '../lib/rules/duplicate-lifecycle-instruction.mjs';
import { SEVERITY } from '../lib/constants.mjs';

const df = (text) => ({ dockerfile: parseDockerfile(text) });

test('duplicate-lifecycle-instruction flags shadowed CMD in single stage', () => {
  const findings = duplicateLifecycle.evaluate(
    df('FROM node:20\nCMD ["npm", "start"]\nCMD ["node", "index.js"]\n')
  );
  assert.equal(findings.length, 1, 'should flag first CMD only');
  assert.equal(findings[0].severity, SEVERITY.LOW);
  assert.equal(findings[0].location.line, 2, 'should point to first CMD');
  assert.equal(findings[0].evidence.keyword, 'CMD');
  assert.equal(findings[0].evidence.winningLine, 3, 'should cite winning line 3');
  assert.match(findings[0].title, /CMD.*line 2.*ignored.*line 3/);
});

test('duplicate-lifecycle-instruction ignores CMD in different stages', () => {
  const dockerfile = `FROM node:20 AS build
CMD ["npm", "run", "build"]
FROM nginx
CMD ["nginx", "-g", "daemon off;"]
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 0, 'CMD in different stages do not shadow each other');
});

test('duplicate-lifecycle-instruction flags multiple shadowed ENTRYPOINTs', () => {
  const dockerfile = `FROM node:20
ENTRYPOINT ["node"]
ENTRYPOINT ["node", "app.js"]
ENTRYPOINT ["/bin/sh"]
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 2, 'should flag first two ENTRYPOINT as shadowed');
  assert.equal(findings[0].location.line, 2, 'first shadowed at line 2');
  assert.equal(findings[0].evidence.winningLine, 4, 'winning line is 4');
  assert.equal(findings[1].location.line, 3, 'second shadowed at line 3');
  assert.equal(findings[1].evidence.winningLine, 4, 'winning line is 4');
});

test('duplicate-lifecycle-instruction ignores single lifecycle instruction', () => {
  const dockerfile = `FROM node:20
CMD ["npm", "start"]
ENTRYPOINT ["node"]
HEALTHCHECK CMD curl http://localhost:3000
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 0, 'single of each should not flag');
});

test('duplicate-lifecycle-instruction handles mixed lifecycle duplicates', () => {
  const dockerfile = `FROM node:20
CMD ["npm", "start"]
ENTRYPOINT ["node"]
CMD ["node", "app.js"]
ENTRYPOINT ["/bin/sh"]
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 2, 'should flag first of each duplicate keyword');
  const cmdFindings = findings.filter((f) => f.evidence.keyword === 'CMD');
  const epFindings = findings.filter((f) => f.evidence.keyword === 'ENTRYPOINT');
  assert.equal(cmdFindings.length, 1, 'should flag 1 shadowed CMD');
  assert.equal(epFindings.length, 1, 'should flag 1 shadowed ENTRYPOINT');
});

test('duplicate-lifecycle-instruction detects shadowed HEALTHCHECK', () => {
  const dockerfile = `FROM node:20
HEALTHCHECK CMD curl http://localhost:3000
HEALTHCHECK --interval=30s CMD curl http://localhost:3000
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 1, 'should flag first HEALTHCHECK');
  assert.equal(findings[0].location.line, 2);
  assert.equal(findings[0].evidence.keyword, 'HEALTHCHECK');
  assert.equal(findings[0].evidence.winningLine, 3);
});

test('duplicate-lifecycle-instruction stages are independent', () => {
  const dockerfile = `FROM node:20 AS stage1
CMD ["npm", "start"]
CMD ["npm", "build"]
FROM nginx AS stage2
ENTRYPOINT ["nginx"]
ENTRYPOINT ["/bin/sh"]
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 2, 'should flag one shadowed CMD and one shadowed ENTRYPOINT');
  const stage1Findings = findings.filter((f) => f.location.line <= 3);
  const stage2Findings = findings.filter((f) => f.location.line >= 5);
  assert.equal(stage1Findings.length, 1, 'stage1 should have 1 shadowed');
  assert.equal(stage2Findings.length, 1, 'stage2 should have 1 shadowed');
});

test('duplicate-lifecycle-instruction with many instructions between', () => {
  const dockerfile = `FROM node:20
CMD ["npm", "start"]
RUN echo "building"
RUN npm run build
COPY . .
RUN ls -la
CMD ["node", "index.js"]
`;
  const findings = duplicateLifecycle.evaluate(df(dockerfile));
  assert.equal(findings.length, 1, 'should still detect shadowed CMD despite intervening instructions');
  assert.equal(findings[0].location.line, 2);
  assert.equal(findings[0].evidence.winningLine, 7);
});
