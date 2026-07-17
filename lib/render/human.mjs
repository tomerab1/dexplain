import { CATEGORY, SEVERITY } from '../constants.mjs';
import { formatBytes, formatDuration } from '../format.mjs';
import { colorizer } from './colors.mjs';

const SEVERITY_COLOR = Object.freeze({
  [SEVERITY.HIGH]: 'red',
  [SEVERITY.MEDIUM]: 'yellow',
  [SEVERITY.LOW]: 'gray',
});

const CATEGORY_ORDER = [
  CATEGORY.SECURITY,
  CATEGORY.CACHE,
  CATEGORY.BUILD_TIME,
  CATEGORY.IMAGE_SIZE,
  CATEGORY.DOCKERFILE,
  CATEGORY.CONTEXT,
];

const CATEGORY_LABEL = Object.freeze({
  [CATEGORY.SECURITY]: 'SECURITY',
  [CATEGORY.CACHE]: 'CACHE',
  [CATEGORY.BUILD_TIME]: 'BUILD TIME',
  [CATEGORY.IMAGE_SIZE]: 'IMAGE SIZE',
  [CATEGORY.DOCKERFILE]: 'DOCKERFILE',
  [CATEGORY.CONTEXT]: 'CONTEXT',
});

/** Suffix warning shown when applying the suggested fix can change behavior. */
const FIX_RISK_CAUTION = Object.freeze({
  medium: 'verify the build after applying',
  high: 'can change runtime behavior — verify after applying',
});

function headline(report, paint) {
  const parts = [paint('bold', `dexplain ${report.meta.command}`)];
  const build = report.summary.build;
  if (build) {
    parts.push(`built in ${formatDuration(build.totalDurationMs)}`);
    parts.push(`cache ${build.cachedCount}/${build.buildStepCount} steps`);
  }
  if (report.summary.image) parts.push(`image ${formatBytes(report.summary.image.totalBytes)}`);
  return parts.join(' · ');
}

function locationLabel(location) {
  if (!location) return '';
  if (location.line != null) return `Dockerfile:${location.line}`;
  if (location.step != null) return `step ${location.step}`;
  if (location.layer != null) return `layer ${location.layer}`;
  return '';
}

function renderFinding(finding, paint) {
  const mark = paint(SEVERITY_COLOR[finding.severity], '●');
  const where = locationLabel(finding.location);
  const head = `  ${mark} ${finding.severity.padEnd(6)} ${paint('cyan', finding.ruleId)}${where ? `  ${paint('dim', where)}` : ''}`;
  const lines = [head, `      ${finding.title}`];
  if (finding.suggestedFix) {
    const caution = FIX_RISK_CAUTION[finding.fixRisk];
    const suffix = caution ? ` ${paint('yellow', `(⚠ ${caution})`)}` : '';
    lines.push(`      ${paint('dim', `→ ${finding.suggestedFix}`)}${suffix}`);
  }
  return lines.join('\n');
}

function renderCategory(category, findings, paint) {
  const block = findings.filter((finding) => finding.category === category);
  if (!block.length) return null;
  return [`  ${paint('bold', CATEGORY_LABEL[category])}`, ...block.map((finding) => renderFinding(finding, paint))].join('\n');
}

function footer(report, paint) {
  const high = report.summary.bySeverity[SEVERITY.HIGH];
  const total = report.summary.findingCount;
  const counts = `${total} finding${total === 1 ? '' : 's'}${high ? ` (${high} high)` : ''}`;
  return paint('dim', `${counts} · run with --json for the full machine-readable report`);
}

function failureBlock(report, paint) {
  const failedStep = report.buildTrace?.failedStep;
  if (!failedStep) return null;
  const lines = [paint('red', `BUILD FAILED at ${failedStep.name}`)];
  if (failedStep.error) lines.push(failedStep.error);
  if (failedStep.logTail && failedStep.logTail.length) {
    for (const logLine of failedStep.logTail) {
      lines.push(paint('dim', `  ${logLine}`));
    }
  }
  return lines.join('\n');
}

/** Renders a report as the default terminal summary. `color` gates ANSI styling. */
export function renderHuman(report, { color = true } = {}) {
  const paint = colorizer(color);
  const sections = [headline(report, paint), ''];
  const failed = failureBlock(report, paint);
  if (failed) sections.push(failed, '');
  if (report.warnings.length) sections.push(paint('yellow', `warnings: ${report.warnings.join('; ')}`), '');
  if (report.summary.findingCount === 0) {
    sections.push(paint('gray', '  no findings — nothing stood out'));
  } else {
    const grouped = CATEGORY_ORDER.map((category) => renderCategory(category, report.findings, paint)).filter(Boolean);
    sections.push(grouped.join('\n\n'), '', footer(report, paint));
  }
  return sections.join('\n');
}
