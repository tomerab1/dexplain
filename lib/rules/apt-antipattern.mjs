import { APT_LIST_CLEANUP, CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { commandTextOf, instructionHasCacheMount, runInstructions } from './helpers.mjs';

// Flags may sit between the command and subcommand ("apt-get -y install").
const APT_INSTALL = /\bapt(-get)?\s+(?:-{1,2}\S+\s+)*install\b/;
const APT_UPDATE = /\bapt(-get)?\s+(?:-{1,2}\S+\s+)*update\b/;
const NO_RECOMMENDS = /--no-install-recommends|APT::Install-Recommends/;

function installsWithoutOwnUpdate(text) {
  return APT_INSTALL.test(text) && !APT_UPDATE.test(text);
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
    fixRisk: FIX_RISK.MEDIUM,
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
    fixRisk: FIX_RISK.LOW,
  });
}

function noRecommendsFinding(instruction) {
  return makeFinding({
    ruleId: 'apt-antipattern',
    category: CATEGORY.IMAGE_SIZE,
    severity: SEVERITY.LOW,
    title: 'apt-get install pulls in recommended packages',
    detail:
      `\`apt-get install\` at line ${instruction.line} installs recommended packages too, which ` +
      'often adds unneeded weight to the layer.',
    location: { line: instruction.line },
    suggestedFix: 'Add `--no-install-recommends` and explicitly install anything you actually need.',
    fixRisk: FIX_RISK.HIGH,
  });
}

export default {
  id: 'apt-antipattern',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const runs = runInstructions(model.dockerfile);
    const hasSeparateUpdate = runs.some((run) => {
      const text = commandTextOf(run);
      return APT_UPDATE.test(text) && !APT_INSTALL.test(text);
    });
    const findings = [];
    for (const run of runs) {
      const text = commandTextOf(run);
      if (!APT_INSTALL.test(text)) continue;
      if (hasSeparateUpdate && installsWithoutOwnUpdate(text)) findings.push(splitUpdateFinding(run));
      if (!APT_LIST_CLEANUP.test(text) && !instructionHasCacheMount(run)) findings.push(noCleanupFinding(run));
      if (!NO_RECOMMENDS.test(text)) findings.push(noRecommendsFinding(run));
    }
    return findings;
  },
};
