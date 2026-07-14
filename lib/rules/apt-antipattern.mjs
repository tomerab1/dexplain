import { APT_LIST_CLEANUP, CATEGORY, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { hasCacheMount, runInstructions } from './helpers.mjs';

const APT_INSTALL = /\bapt(-get)?\s+install\b/;
const APT_UPDATE = /\bapt(-get)?\s+update\b/;

function installsWithoutOwnUpdate(instruction) {
  return APT_INSTALL.test(instruction.args) && !APT_UPDATE.test(instruction.args);
}

function splitUpdateFinding(instruction) {
  return makeFinding({
    ruleId: 'apt-antipattern',
    category: CATEGORY.CACHE,
    severity: SEVERITY.MEDIUM,
    title: 'apt-get update and install are in separate layers',
    detail:
      `\`apt-get install\` at line ${instruction.line} relies on an \`apt-get update\` from an ` +
      'earlier layer; a cached update can then install stale packages.',
    location: { line: instruction.line },
    suggestedFix: 'Run `apt-get update && apt-get install -y …` in a single RUN so they cache together.',
  });
}

function noCleanupFinding(instruction) {
  return makeFinding({
    ruleId: 'apt-antipattern',
    category: CATEGORY.IMAGE_SIZE,
    severity: SEVERITY.LOW,
    title: 'apt package lists are left in the image',
    detail: `\`apt-get install\` at line ${instruction.line} does not remove /var/lib/apt/lists, bloating the layer.`,
    location: { line: instruction.line },
    suggestedFix: 'Append `&& rm -rf /var/lib/apt/lists/*` to the RUN, or use a cache mount for /var/lib/apt.',
  });
}

export default {
  id: 'apt-antipattern',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const runs = runInstructions(model.dockerfile);
    const hasSeparateUpdate = runs.some((run) => APT_UPDATE.test(run.args) && !APT_INSTALL.test(run.args));
    const findings = [];
    for (const run of runs) {
      if (!APT_INSTALL.test(run.args)) continue;
      if (hasSeparateUpdate && installsWithoutOwnUpdate(run)) findings.push(splitUpdateFinding(run));
      if (!APT_LIST_CLEANUP.test(run.args) && !hasCacheMount(run.args)) findings.push(noCleanupFinding(run));
    }
    return findings;
  },
};
