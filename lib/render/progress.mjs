import { formatDuration } from '../format.mjs';

const MAX_COMMAND_LENGTH = 80;
const START_INDICATOR = '→';
const DONE_INDICATOR = '✓';
const FAILED_INDICATOR = '✗';
const CACHED_MARKER = 'CACHED';
const FAILED_MARKER = 'FAILED';
const BUILD_STEP_PATTERN = /^\[\s*(?:[A-Za-z][\w.-]*\s+)?(\d+)\/(\d+)\]/;

/**
 * Creates a progress printer that streams build step updates as they arrive.
 * Handles partial lines across chunks, tracks seen vertexes by digest,
 * and emits start/done lines only for build steps (matching the [n/m] pattern).
 *
 * @param {(line: string) => void} write - callback to emit a line (no trailing newline)
 * @returns {(chunkText: string) => void} function to feed stderr chunks into
 */
export function createProgressPrinter(write) {
  let buffer = '';
  const seenDigests = new Map(); // digest -> { startEmitted: boolean, doneEmitted: boolean }

  return (chunkText) => {
    buffer += chunkText;

    // Process complete newline-terminated lines only
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete final line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        // Skip unparseable lines silently
        continue;
      }

      // Process vertexes (which carry name, started, completed, cached)
      for (const vertex of event.vertexes ?? []) {
        if (!vertex.digest || !vertex.name) continue;

        // Only report build steps (names matching the [n/m] pattern, excluding internal steps)
        if (!BUILD_STEP_PATTERN.test(vertex.name)) continue;

        const digest = vertex.digest;
        const cached = vertex.cached === true;
        let state = seenDigests.get(digest) ?? { startEmitted: false, doneEmitted: false };

        // Emit start line once when we first see 'started' (but not 'completed')
        if (vertex.started && !vertex.completed && !state.startEmitted) {
          write(`${START_INDICATOR} ${truncateCommand(vertex.name)}`);
          state.startEmitted = true;
        }

        // Emit done line once when we see 'completed' (and haven't emitted done yet)
        if (vertex.completed && !state.doneEmitted) {
          const doneLineText = formatDoneLine(vertex.name, vertex.started, vertex.completed, cached, vertex.error);
          write(doneLineText);
          state.doneEmitted = true;
        }

        seenDigests.set(digest, state);
      }
    }
  };
}

/**
 * Truncates the step name to MAX_COMMAND_LENGTH, keeping it readable.
 */
function truncateCommand(name) {
  if (name.length <= MAX_COMMAND_LENGTH) return name;
  return `${name.slice(0, MAX_COMMAND_LENGTH - 3)}...`;
}

/**
 * Formats the done line with duration, or a CACHED/FAILED marker.
 */
function formatDoneLine(name, started, completed, cached, error) {
  const truncated = truncateCommand(name);

  if (error) {
    return `${FAILED_INDICATOR} ${truncated}  ${FAILED_MARKER}`;
  }

  if (cached) {
    return `${DONE_INDICATOR} ${truncated}  ${CACHED_MARKER}`;
  }

  if (started && completed) {
    const startMs = Date.parse(started);
    const completedMs = Date.parse(completed);
    const durationMs = completedMs - startMs;
    const duration = formatDuration(durationMs);
    return `${DONE_INDICATOR} ${truncated}  ${duration}`;
  }

  return `${DONE_INDICATOR} ${truncated}`;
}
