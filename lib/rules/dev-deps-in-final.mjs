import { CATEGORY, DEV_ARTIFACT_HINTS, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatBytes } from '../format.mjs';
import { truncate } from './helpers.mjs';

/**
 * Flags final-image layers that appear to carry build/dev artifacts (package caches,
 * VCS metadata, dependency trees) over a size floor. It reports suspicion, not certainty
 * — some of these are legitimately needed at runtime — so the judgement stays with a human.
 */
function matchedHint(layer) {
  return DEV_ARTIFACT_HINTS.find((hint) => layer.createdBy.includes(hint)) ?? null;
}

function toFinding(layer, hint) {
  return makeFinding({
    ruleId: 'dev-deps-in-final',
    category: CATEGORY.IMAGE_SIZE,
    severity: SEVERITY.MEDIUM,
    title: `Layer ${layer.index} ships \`${hint}\` (${formatBytes(layer.bytes)})`,
    detail:
      `\`${truncate(layer.createdBy)}\` adds \`${hint}\` to the final image; if it is a build-only ` +
      'artifact it should not ship.',
    location: { layer: layer.index },
    evidence: { bytes: layer.bytes, hint, createdBy: layer.createdBy },
    estimatedImpact: { bytes: layer.bytes },
    suggestedFix: `Move \`${hint}\` out of the final image via a multi-stage build, or remove it in the same layer.`,
  });
}

export default {
  id: 'dev-deps-in-final',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.IMAGE],
  evaluate(model, thresholds = THRESHOLDS) {
    const findings = [];
    for (const layer of model.image.layers) {
      if (layer.bytes < thresholds.devArtifactMinBytes) continue;
      const hint = matchedHint(layer);
      if (hint) findings.push(toFinding(layer, hint));
    }
    return findings;
  },
};
