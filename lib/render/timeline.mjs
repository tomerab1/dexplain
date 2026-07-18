/**
 * Renders a terminal Gantt chart of build steps with timing and cache status.
 * Visualizes parallelism and cache hits/misses via a linear timeline overlay.
 */

import { formatDuration } from '../format.mjs';

// Glyphs for bar representation
const BAR_UNCACHED = '█';
const BAR_CACHED = '░';
const BAR_ZERO_DURATION = '▏';

// Labels and markers
const MARKER_CACHED = 'CACHED';

// Layout constants
const LABEL_WIDTH = 38;
const BAR_AREA_MAX_WIDTH = 42;

/**
 * Determines if a build trace should display the timeline.
 * Returns true when totalDurationMs >= threshold AND non-internal step count >= threshold.
 */
export function shouldShowTimeline(buildTrace, thresholds) {
  if (!buildTrace || !thresholds) return false;
  const nonInternalSteps = buildTrace.steps.filter(s => !s.internal);
  return (
    buildTrace.totalDurationMs >= thresholds.timelineMinDurationMs &&
    nonInternalSteps.length >= thresholds.timelineMinSteps
  );
}

/**
 * Renders a terminal Gantt chart of build steps.
 * Returns an array of formatted lines (one per step plus axis, no trailing newlines).
 * Each line scales bars linearly over the build's total wall-clock time.
 */
export function renderTimeline(buildTrace, { paint, width = 80 } = {}) {
  if (!buildTrace || !buildTrace.steps || buildTrace.steps.length === 0) {
    return [];
  }

  const paint_ = paint || ((name, s) => s);

  // Collect steps with timing data, sorted by start time
  const stepsWithTiming = buildTrace.steps
    .filter(s => s.startedMs !== null)
    .sort((a, b) => a.startedMs - b.startedMs);

  if (stepsWithTiming.length === 0) {
    return [];
  }

  // Compute timeline bounds
  const minStart = Math.min(...stepsWithTiming.map(s => s.startedMs));
  const maxEnd = Math.max(...stepsWithTiming.map(s => s.startedMs + s.durationMs));
  const timelineSpanMs = maxEnd - minStart;

  const durationReserve = 10;
  const barAreaWidth = Math.min(width - LABEL_WIDTH - 1 - 2 - durationReserve, BAR_AREA_MAX_WIDTH);

  const rows = [];
  for (const step of stepsWithTiming) {
    const label = formatLabel(step);
    const barRow = formatBarRow(step, minStart, timelineSpanMs, barAreaWidth, paint_);
    const paddedLabel = label.slice(0, LABEL_WIDTH).padEnd(LABEL_WIDTH);
    const line = `${paddedLabel} ${barRow}`;
    rows.push(line.slice(0, width));
  }

  // Axis line at the bottom
  const axisLabel = ''.padEnd(LABEL_WIDTH);
  const axisRow = formatAxisLine(timelineSpanMs, barAreaWidth);
  const axisLine = `${axisLabel} ${axisRow}`;
  rows.push(axisLine.slice(0, width));

  return rows;
}

function formatLabel(step) {
  if (step.internal) {
    return step.name;
  }
  // Non-internal: "[n/m] command"
  const count = `[${step.index}/${step.stageTotal}]`;
  const label = `${count} ${step.command}`;
  // Truncate with …
  if (label.length > LABEL_WIDTH) {
    return label.slice(0, LABEL_WIDTH - 1) + '…';
  }
  return label;
}

function formatBarRow(step, minStart, timelineSpanMs, barAreaWidth, paint_) {
  // Offset: character position where the bar starts
  const offsetFromMin = step.startedMs - minStart;
  const offsetChars = Math.round((offsetFromMin / timelineSpanMs) * barAreaWidth);

  // Bar length in characters
  const barLength = computeBarLength(step.durationMs, timelineSpanMs, barAreaWidth);

  // Bar glyph and rendering
  let barStr;
  if (step.cached) {
    const barLength_ = Math.max(1, barLength);
    barStr = paint_('dim', BAR_CACHED.repeat(barLength_));
  } else if (barLength === 0) {
    barStr = BAR_ZERO_DURATION;
  } else {
    barStr = BAR_UNCACHED.repeat(barLength);
  }

  // Duration or cached label
  const durationStr = step.cached ? MARKER_CACHED : formatDuration(step.durationMs);

  // Assemble: offset spaces + bar + padding + duration
  const offset = ' '.repeat(Math.max(0, offsetChars));
  return `${offset}${barStr}  ${durationStr}`;
}

function computeBarLength(durationMs, timelineSpanMs, barAreaWidth) {
  if (durationMs === 0) return 0;
  if (timelineSpanMs === 0) return 1;
  return Math.max(1, Math.round((durationMs / timelineSpanMs) * barAreaWidth));
}

function formatAxisLine(timelineSpanMs, barAreaWidth) {
  const left = '0s';
  const right = formatDuration(Math.round(timelineSpanMs));
  const totalLen = barAreaWidth;

  if (left.length + right.length >= totalLen) {
    // Fallback: truncate if text is too long
    return left.slice(0, Math.max(1, totalLen - 1)) + right.slice(-(Math.max(1, totalLen - left.length)));
  }

  const spacesNeeded = totalLen - left.length - right.length;
  return left + ' '.repeat(spacesNeeded) + right;
}
