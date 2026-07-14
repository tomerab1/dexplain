import { CATEGORY, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { hasCacheMount, matchPackageManager, runInstructions } from './helpers.mjs';

/**
 * Flags package-manager RUN steps that lack a BuildKit cache mount, so the package
 * cache is re-downloaded from scratch whenever the layer is rebuilt.
 */
function toFinding(instruction, manager) {
  return makeFinding({
    ruleId: 'missing-cache-mount',
    category: CATEGORY.CACHE,
    severity: SEVERITY.MEDIUM,
    title: `${manager.name} install has no build cache mount`,
    detail:
      `\`${instruction.raw}\` (line ${instruction.line}) re-downloads the ${manager.name} ` +
      'cache on every rebuild of this layer.',
    location: { line: instruction.line },
    evidence: { packageManager: manager.name },
    suggestedFix: `Add \`RUN --mount=type=cache,target=${manager.target}\` to persist the ${manager.name} cache across builds.`,
  });
}

export default {
  id: 'missing-cache-mount',
  category: CATEGORY.CACHE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const findings = [];
    for (const instruction of runInstructions(model.dockerfile)) {
      const manager = matchPackageManager(instruction.args);
      if (manager && !hasCacheMount(instruction.args)) findings.push(toFinding(instruction, manager));
    }
    return findings;
  },
};
