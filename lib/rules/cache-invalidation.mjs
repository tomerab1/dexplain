import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { commandTextOf, instructionsInStage, isBroadSourceCopy, matchPackageManager } from './helpers.mjs';

/**
 * Flags a whole-context `COPY . .` placed before a dependency-install `RUN` in the same
 * stage: any source edit then busts the install layer's cache and reinstalls on every
 * build. The Docker equivalent of a query that can't use its index.
 */
function findInStage(dockerfile, stageIndex) {
  const stageInstructions = instructionsInStage(dockerfile, stageIndex);
  let broadCopy = null;
  let install = null;
  for (const instruction of stageInstructions) {
    if (!broadCopy && isBroadSourceCopy(instruction)) {
      broadCopy = instruction;
      continue;
    }
    if (broadCopy && instruction.keyword === 'RUN' && matchPackageManager(commandTextOf(instruction))) {
      install = instruction;
      break;
    }
  }
  if (!broadCopy || !install) return null;
  // Count instructions after the install in this stage.
  let foundInstall = false;
  let downstreamCount = 0;
  for (const instruction of stageInstructions) {
    if (instruction === install) {
      foundInstall = true;
      continue;
    }
    if (foundInstall) {
      downstreamCount++;
    }
  }
  return { broadCopy, install, downstreamCount };
}

function toFinding({ broadCopy, install }, instructionCount) {
  let detail =
    `\`${broadCopy.raw}\` (line ${broadCopy.line}) copies the whole context before ` +
    `\`${install.raw}\` (line ${install.line}), so any source change reinstalls dependencies`;
  if (instructionCount > 0) {
    detail += ` and also re-runs the ${instructionCount} instruction(s) after the install in this stage.`;
  } else {
    detail += '.';
  }
  return makeFinding({
    ruleId: 'cache-invalidation',
    category: CATEGORY.CACHE,
    severity: SEVERITY.HIGH,
    title: 'Source copied before dependency install busts the install cache',
    detail,
    location: { line: broadCopy.line },
    evidence: { copyLine: broadCopy.line, installLine: install.line },
    suggestedFix:
      'Copy only the dependency manifests, run the install, then copy the rest of the source ' +
      'so edits no longer invalidate the install layer.',
    fixRisk: FIX_RISK.HIGH,
  });
}

export default {
  id: 'cache-invalidation',
  category: CATEGORY.CACHE,
  severity: SEVERITY.HIGH,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    return model.dockerfile.stages
      .map((stage) => findInStage(model.dockerfile, stage.index))
      .filter(Boolean)
      .map(({ downstreamCount, ...rest }) => toFinding(rest, downstreamCount));
  },
};
