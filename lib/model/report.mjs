import { SEVERITY, SEVERITY_RANK } from '../constants.mjs';
import { rankFindings } from './finding.mjs';

/**
 * The normalized, machine-readable artifact dexplain emits. Collectors populate the
 * optional model parts (buildTrace / image / dockerfile / context); the rule runner
 * fills `findings`; `buildSummary` derives headline numbers for the renderer.
 */
export function buildReport({
  command,
  buildTrace = null,
  image = null,
  dockerfile = null,
  context = null,
  findings = [],
  warnings = [],
}) {
  const ranked = rankFindings(findings);
  return {
    meta: { tool: 'dexplain', command },
    buildTrace,
    image,
    dockerfile,
    context,
    findings: ranked,
    warnings,
    summary: summarize({ buildTrace, image, findings: ranked }),
  };
}

function countBySeverity(findings) {
  const counts = { [SEVERITY.HIGH]: 0, [SEVERITY.MEDIUM]: 0, [SEVERITY.LOW]: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function summarize({ buildTrace, image, findings }) {
  return {
    findingCount: findings.length,
    bySeverity: countBySeverity(findings),
    build: buildTrace
      ? {
          totalDurationMs: buildTrace.totalDurationMs,
          cachedCount: buildTrace.cachedCount,
          buildStepCount: buildTrace.buildStepCount,
        }
      : null,
    image: image ? { totalBytes: image.totalBytes, layerCount: image.layers.length } : null,
  };
}

/**
 * True when the report contains at least one finding at or above the given severity.
 * Severity levels: high (rank 3), medium (rank 2), low (rank 1).
 */
export function hasFindingsAtOrAbove(report, severity) {
  const severityRank = SEVERITY_RANK[severity];
  if (severityRank === undefined) return false;
  for (const finding of report.findings) {
    if (SEVERITY_RANK[finding.severity] >= severityRank) return true;
  }
  return false;
}

/** True when the report contains at least one high-severity finding. */
export function hasHighSeverity(report) {
  return hasFindingsAtOrAbove(report, SEVERITY.HIGH);
}

export { SEVERITY_RANK };
