import { SEVERITY_RANK } from '../constants.mjs';

/**
 * A single actionable finding produced by a rule. `estimatedImpact` is always
 * best-effort and rendered as an estimate, never a promise.
 */
export function makeFinding({
  ruleId,
  category,
  severity,
  title,
  detail,
  location = null,
  evidence = null,
  suggestedFix = null,
  estimatedImpact = null,
}) {
  return {
    ruleId,
    category,
    severity,
    title,
    detail,
    location,
    evidence,
    suggestedFix,
    estimatedImpact,
  };
}

/** Numeric weight of a finding's estimated impact, used only as a tie-breaker in ranking. */
function impactWeight(finding) {
  const impact = finding.estimatedImpact;
  if (!impact) return 0;
  return impact.milliseconds ?? impact.bytes ?? 0;
}

/** Orders findings most-severe first, breaking ties by larger estimated impact. */
export function compareFindings(a, b) {
  const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (bySeverity !== 0) return bySeverity;
  return impactWeight(b) - impactWeight(a);
}

export function rankFindings(findings) {
  return [...findings].sort(compareFindings);
}
