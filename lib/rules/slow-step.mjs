import { CATEGORY, FIX_RISK, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatDuration, formatPercent } from '../format.mjs';

/**
 * Flags build steps that dominate wall-clock time — the ones worth optimizing first.
 * A step counts as slow only if it exceeds both an absolute floor and a share of the
 * whole build, so trivially short builds do not produce noise.
 */
function isSlow(step, total, thresholds) {
  if (step.internal || step.durationMs < thresholds.slowStepMinDurationMs) return false;
  return total > 0 && step.durationMs / total >= thresholds.slowStepShareOfBuild;
}

function toFinding(step, total) {
  const share = step.durationMs / total;
  return makeFinding({
    ruleId: 'slow-step',
    category: CATEGORY.BUILD_TIME,
    severity: share >= 0.5 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    title: `Step ${step.index} takes ${formatDuration(step.durationMs)} (${formatPercent(share)} of the build)`,
    detail: `\`${step.command}\` dominates the build wall time.`,
    location: { step: step.index },
    evidence: { durationMs: step.durationMs, shareOfBuild: share },
    estimatedImpact: { milliseconds: step.durationMs },
    suggestedFix:
      'Reduce or cache this step: reorder so it caches across builds, add a cache mount, or ' +
      'move heavy work into a separate stage.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'slow-step',
  category: CATEGORY.BUILD_TIME,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.BUILD_TRACE],
  evaluate(model, thresholds = THRESHOLDS) {
    const total = model.buildTrace.totalDurationMs;
    return model.buildTrace.steps
      .filter((step) => isSlow(step, total, thresholds))
      .map((step) => toFinding(step, total));
  },
};
