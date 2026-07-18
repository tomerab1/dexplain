/**
 * Diffs two build traces by timing, matching non-internal steps by command text
 * as a multiset. Returns wall-clock and step-level deltas, plus cache transitions.
 */

function matchStepsByCommand(stepsA, stepsB) {
  const aNonInternal = stepsA.filter((s) => !s.internal);
  const bNonInternal = stepsB.filter((s) => !s.internal);

  const aByCommand = new Map();
  const bByCommand = new Map();

  for (let i = 0; i < aNonInternal.length; i++) {
    const cmd = aNonInternal[i].command;
    if (!aByCommand.has(cmd)) aByCommand.set(cmd, []);
    aByCommand.get(cmd).push({ index: i, step: aNonInternal[i] });
  }

  for (let i = 0; i < bNonInternal.length; i++) {
    const cmd = bNonInternal[i].command;
    if (!bByCommand.has(cmd)) bByCommand.set(cmd, []);
    bByCommand.get(cmd).push({ index: i, step: bNonInternal[i] });
  }

  const steps = [];
  const cacheLost = [];
  const cacheGained = [];

  // Match pairs in order for each command
  for (const [command, aList] of aByCommand) {
    const bList = bByCommand.get(command) ?? [];
    const pairCount = Math.min(aList.length, bList.length);

    for (let i = 0; i < pairCount; i++) {
      const aItem = aList[i];
      const bItem = bList[i];
      const deltaMs = bItem.step.durationMs - aItem.step.durationMs;
      const cacheA = aItem.step.cached ?? false;
      const cacheB = bItem.step.cached ?? false;

      steps.push({
        command,
        durationA: aItem.step.durationMs,
        durationB: bItem.step.durationMs,
        deltaMs,
        cacheA,
        cacheB,
      });

      // Track cache transitions
      if (cacheA && !cacheB) {
        cacheLost.push({ command, cost: bItem.step.durationMs });
      } else if (!cacheA && cacheB) {
        cacheGained.push({ command, savings: aItem.step.durationMs });
      }
    }
  }

  // Sort steps by absolute delta descending
  steps.sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs));

  return { steps, cacheLost, cacheGained };
}

/**
 * Diffs two build traces by timing metrics.
 * @param {Object} traceA - BuildTrace from build A with {totalDurationMs, steps:[...]}
 * @param {Object} traceB - BuildTrace from build B with {totalDurationMs, steps:[...]}
 * @returns {{wallDeltaMs, steps, cacheLost, cacheGained}} Timing deltas
 */
export function diffTiming(traceA, traceB) {
  const { steps, cacheLost, cacheGained } = matchStepsByCommand(traceA.steps, traceB.steps);
  return {
    wallDeltaMs: traceB.totalDurationMs - traceA.totalDurationMs,
    steps,
    cacheLost,
    cacheGained,
  };
}
