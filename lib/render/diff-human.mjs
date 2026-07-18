import { SEVERITY } from '../constants.mjs';
import { formatBytes, formatDuration } from '../format.mjs';
import { colorizer } from './colors.mjs';

const SEVERITY_COLOR = Object.freeze({
  [SEVERITY.HIGH]: 'red',
  [SEVERITY.MEDIUM]: 'yellow',
  [SEVERITY.LOW]: 'gray',
});

function sideLabel(side) {
  if (side.ref) return side.ref;
  if (side.trace) return side.trace;
  return '?';
}

function headline(diff, paint) {
  const aLabel = sideLabel(diff.a);
  const bLabel = sideLabel(diff.b);
  return paint('bold', `dexplain diff · ${aLabel} → ${bLabel}`);
}

function renderSizeSection(deltas, paint) {
  if (!deltas.layers) return null;
  const delta = deltas.layers.totalDeltaBytes;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const color = delta > 0 ? 'red' : delta < 0 ? 'green' : 'dim';
  const mark = paint(color, `${sign}${formatBytes(Math.abs(delta))}`);
  return `  SIZE\n    ${mark}`;
}

function truncateCreatedBy(createdBy, maxLen = 80) {
  if (createdBy.length <= maxLen) return createdBy;
  return `${createdBy.slice(0, maxLen - 1)}…`;
}

function renderLayersSection(deltas, paint) {
  if (!deltas.layers) return null;
  const lines = ['  LAYERS'];
  const { added, removed, changed } = deltas.layers;

  if (added.length) {
    lines.push(`    ${paint('red', `added (${added.length})`)}:`);
    for (let i = 0; i < Math.min(added.length, 8); i++) {
      const layer = added[i];
      lines.push(`      ${paint('red', '+')} ${formatBytes(layer.bytes)} ${truncateCreatedBy(layer.createdBy)}`);
    }
    if (added.length > 8) lines.push(`      ${paint('dim', `+${added.length - 8} more`)}`);
  }

  if (removed.length) {
    lines.push(`    ${paint('green', `removed (${removed.length})`)}:`);
    for (let i = 0; i < Math.min(removed.length, 8); i++) {
      const layer = removed[i];
      lines.push(`      ${paint('green', '−')} ${formatBytes(layer.bytes)} ${truncateCreatedBy(layer.createdBy)}`);
    }
    if (removed.length > 8) lines.push(`      ${paint('dim', `+${removed.length - 8} more`)}`);
  }

  if (changed.length) {
    lines.push(`    ${paint('cyan', `changed (${changed.length})`)}:`);
    for (let i = 0; i < Math.min(changed.length, 8); i++) {
      const layer = changed[i];
      const sign = layer.deltaBytes > 0 ? '+' : '';
      const color = layer.deltaBytes > 0 ? 'red' : 'green';
      const delta = paint(color, `${sign}${formatBytes(Math.abs(layer.deltaBytes))}`);
      lines.push(`      ${delta} ${truncateCreatedBy(layer.createdBy)}`);
    }
    if (changed.length > 8) lines.push(`      ${paint('dim', `+${changed.length - 8} more`)}`);
  }

  return lines.join('\n');
}

function renderFindingLine(finding, paint) {
  const mark = paint(SEVERITY_COLOR[finding.severity], '●');
  const where = finding.location ? `  ${paint('dim', locationLabel(finding.location))}` : '';
  return `      ${mark} ${finding.severity.padEnd(6)} ${paint('cyan', finding.ruleId)}${where}\n        ${finding.title}`;
}

function locationLabel(location) {
  if (location.line != null) return `Dockerfile:${location.line}`;
  if (location.step != null) return `step ${location.step}`;
  if (location.layer != null) return `layer ${location.layer}`;
  return '';
}

function renderFindingsSection(deltas, paint) {
  const { introduced, resolved, unchangedCount } = deltas.findings;
  const lines = ['  FINDINGS'];

  if (introduced.length) {
    lines.push(`    ${paint('red', `introduced (${introduced.length})`)}:`);
    for (const finding of introduced.slice(0, 8)) {
      lines.push(renderFindingLine(finding, paint));
    }
    if (introduced.length > 8) lines.push(`      ${paint('dim', `+${introduced.length - 8} more`)}`);
  }

  if (resolved.length) {
    lines.push(`    ${paint('green', `resolved (${resolved.length})`)}:`);
    for (const finding of resolved.slice(0, 8)) {
      lines.push(renderFindingLine(finding, paint));
    }
    if (resolved.length > 8) lines.push(`      ${paint('dim', `+${resolved.length - 8} more`)}`);
  }

  if (unchangedCount) lines.push(`    ${paint('dim', `unchanged: ${unchangedCount}`)}`);

  return lines.join('\n');
}

function renderTimingSection(deltas, paint) {
  if (!deltas.timing) return null;
  const { wallDeltaMs, steps, cacheLost, cacheGained } = deltas.timing;
  const sign = wallDeltaMs > 0 ? '+' : '';
  const color = wallDeltaMs > 0 ? 'red' : 'green';
  const wallLine = paint(color, `${sign}${formatDuration(wallDeltaMs)}`);

  const lines = [`  TIMING`, `    wall clock: ${wallLine}`];

  if (cacheLost.length) {
    lines.push(`    ${paint('red', `cache lost (${cacheLost.length})`)}:`);
    for (const item of cacheLost.slice(0, 3)) {
      lines.push(`      ${paint('red', '✗')} ${item.command.slice(0, 50)} now ${formatDuration(item.cost)}`);
    }
    if (cacheLost.length > 3) lines.push(`      ${paint('dim', `+${cacheLost.length - 3} more`)}`);
  }

  if (cacheGained.length) {
    lines.push(`    ${paint('green', `cache gained (${cacheGained.length})`)}:`);
    for (const item of cacheGained.slice(0, 3)) {
      lines.push(`      ${paint('green', '✓')} ${item.command.slice(0, 50)} saved ${formatDuration(item.savings)}`);
    }
    if (cacheGained.length > 3) lines.push(`      ${paint('dim', `+${cacheGained.length - 3} more`)}`);
  }

  if (steps.length) {
    lines.push(`    ${paint('cyan', `top deltas`)}`);
    for (const step of steps.slice(0, 3)) {
      const sign = step.deltaMs > 0 ? '+' : '';
      const color = step.deltaMs > 0 ? 'red' : 'green';
      const delta = paint(color, `${sign}${formatDuration(step.deltaMs)}`);
      lines.push(`      ${delta} ${step.command.slice(0, 50)}`);
    }
  }

  return lines.join('\n');
}

export function renderDiffHuman(diff, { color = true } = {}) {
  const paint = colorizer(color);
  const sections = [headline(diff, paint), ''];

  const hasLayers = diff.deltas.layers;
  const hasTiming = diff.deltas.timing;
  const { introduced, resolved } = diff.deltas.findings;
  const hasDifferences = hasLayers || hasTiming || introduced.length > 0 || resolved.length > 0;

  if (!hasDifferences) {
    sections.push(paint('gray', '  no differences detected'));
  } else {
    const size = renderSizeSection(diff.deltas, paint);
    if (size) sections.push(size, '');

    const layers = renderLayersSection(diff.deltas, paint);
    if (layers) sections.push(layers, '');

    sections.push(renderFindingsSection(diff.deltas, paint), '');

    const timing = renderTimingSection(diff.deltas, paint);
    if (timing) sections.push(timing);
  }

  return sections.join('\n');
}
