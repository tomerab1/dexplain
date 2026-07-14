export { formatBytes } from './collect/size.mjs';

const MS_PER_SECOND = 1000;

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms';
  if (ms < MS_PER_SECOND) return `${Math.round(ms)}ms`;
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

export function formatPercent(fraction) {
  if (!Number.isFinite(fraction)) return '0%';
  return `${Math.round(fraction * 100)}%`;
}
