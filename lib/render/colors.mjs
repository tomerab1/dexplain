const CODES = Object.freeze({
  red: '31',
  yellow: '33',
  gray: '90',
  cyan: '36',
  bold: '1',
  dim: '2',
});

const RESET = '\x1b[0m';

/**
 * Returns a paint(name, text) function. When color is disabled it is the identity, so
 * callers never branch on the flag themselves.
 */
export function colorizer(enabled) {
  return (name, text) => (enabled && CODES[name] ? `\x1b[${CODES[name]}m${text}${RESET}` : text);
}
