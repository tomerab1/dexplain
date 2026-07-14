import { SIZE_UNIT_BYTES } from '../constants.mjs';

const HUMAN_SIZE = /^([\d.]+)\s*([a-z]+)?$/i;

/**
 * Parses a docker-humanized size string ("4.1kB", "113MB", "0B", "0") back to bytes.
 * Docker uses base-1000 units, so this mirrors that rather than 1024-based math.
 * Returns 0 for unparseable or empty input.
 */
export function parseHumanSize(text) {
  if (typeof text !== 'string') return 0;
  const match = text.trim().match(HUMAN_SIZE);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = (match[2] || 'b').toLowerCase();
  const multiplier = SIZE_UNIT_BYTES[unit];
  if (!multiplier) return 0;
  return Math.round(value * multiplier);
}

const HUMAN_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

/** Formats a byte count as a compact human size for display. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), HUMAN_UNITS.length - 1);
  const scaled = bytes / 1000 ** exponent;
  const rounded = scaled >= 100 || exponent === 0 ? Math.round(scaled) : scaled.toFixed(1);
  return `${rounded}${HUMAN_UNITS[exponent]}`;
}
