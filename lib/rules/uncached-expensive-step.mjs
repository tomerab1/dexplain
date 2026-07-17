import { CATEGORY, FIX_RISK, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatDuration } from '../format.mjs';

/**
 * Flags expensive RUN steps that were not served from cache this build — each is a
 * candidate for a cache mount or for reordering so it caches across builds. It reports
 * the opportunity; whether the step can actually cache is left to human judgement.
 */
function isCandidate(step, thresholds) {
  return (
    !step.internal &&
    !step.cached &&
    step.instruction === 'RUN' &&
    step.durationMs >= thresholds.expensiveStepMinDurationMs
  );
}

function toFinding(step) {
  return makeFinding({
    ruleId: 'uncached-expensive-step',
    category: CATEGORY.CACHE,
    severity: SEVERITY.LOW,
    title: `Step ${step.index} ran uncached for ${formatDuration(step.durationMs)}`,
    detail: `\`${step.command}\` was not cached this build and is a candidate for a cache mount or reordering.`,
    location: { step: step.index },
    evidence: { durationMs: step.durationMs, cached: false },
    estimatedImpact: { milliseconds: step.durationMs },
    suggestedFix: 'If this step is deterministic, reorder inputs so it caches, or add a BuildKit cache mount.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'uncached-expensive-step',
  category: CATEGORY.CACHE,
  severity: SEVERITY.LOW,
  requires: [INPUT.BUILD_TRACE],
  evaluate(model, thresholds = THRESHOLDS) {
    return model.buildTrace.steps.filter((step) => isCandidate(step, thresholds)).map(toFinding);
  },
};
