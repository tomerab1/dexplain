import { CATEGORY, FIX_RISK, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatDuration, formatPercent } from '../format.mjs';

/**
 * Flags builds where BuildKit's export phase (writing layers and the image) dominates
 * wall time — the tell of a fat final image: the build itself is fast, but shipping the
 * result is not. Only a build trace can see this; no static linter can.
 */
const EXPORT_STEP = /^export(ing)?\s+(to image|layers|to oci|to docker)/i;

function exportDurationMs(steps) {
  return steps
    .filter((step) => step.internal && EXPORT_STEP.test(step.name))
    .reduce((sum, step) => sum + step.durationMs, 0);
}

function toFinding(durationMs, share) {
  return makeFinding({
    ruleId: 'slow-export',
    category: CATEGORY.BUILD_TIME,
    severity: share >= 0.5 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    title: `Exporting the image took ${formatDuration(durationMs)} (${formatPercent(share)} of the build)`,
    detail:
      'The build steps were not the bottleneck — writing the image out was, which usually ' +
      'means the final image is large.',
    evidence: { durationMs, shareOfBuild: share },
    estimatedImpact: { milliseconds: durationMs },
    suggestedFix:
      'Shrink the final image: multi-stage build, smaller base, fewer/lighter layers — ' +
      'export time scales with what ships.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'slow-export',
  category: CATEGORY.BUILD_TIME,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.BUILD_TRACE],
  evaluate(model, thresholds = THRESHOLDS) {
    const total = model.buildTrace.totalDurationMs;
    const exportMs = exportDurationMs(model.buildTrace.steps);
    if (total <= 0 || exportMs < thresholds.exportMinDurationMs) return [];
    const share = exportMs / total;
    if (share < thresholds.exportShareOfBuild) return [];
    return [toFinding(exportMs, share)];
  },
};
