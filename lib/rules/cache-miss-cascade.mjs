import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatDuration } from '../format.mjs';
import { truncate } from './helpers.mjs';

/**
 * Flags the first uncached step in a stage that has uncached successors,
 * provided the stage contains at least one cached step before it. Quantifies the
 * cascade: how many downstream steps rebuilt due to this miss, and how long they
 * took. A noise guard prevents first-ever builds (all uncached) from triggering.
 */
const CASCADE_THRESHOLD_MS = 30000;

function groupByStage(steps) {
  const groups = new Map();
  for (const step of steps) {
    if (step.internal) continue;
    const stage = step.stage ?? 'default';
    if (!groups.has(stage)) {
      groups.set(stage, []);
    }
    groups.get(stage).push(step);
  }
  return groups;
}

function findCascadeInGroup(group) {
  let cachedBefore = false;
  for (let i = 0; i < group.length; i++) {
    const step = group[i];
    if (step.cached) {
      cachedBefore = true;
      continue;
    }
    // Found the first uncached step.
    if (!cachedBefore) {
      // No cached predecessors — not a cascade story.
      return null;
    }
    // Count uncached steps after this one.
    const downstream = group.slice(i + 1).filter((s) => !s.cached);
    if (downstream.length === 0) {
      // No uncached successors — no cascade.
      return null;
    }
    // Found a cascade.
    const downstreamMs = downstream.reduce((sum, s) => sum + s.durationMs, 0);
    return { missStep: step, downstreamSteps: downstream, downstreamMs };
  }
  return null;
}

function toFinding(cascade, stage) {
  const { missStep, downstreamSteps, downstreamMs } = cascade;
  return makeFinding({
    ruleId: 'cache-miss-cascade',
    category: CATEGORY.CACHE,
    severity: downstreamMs >= CASCADE_THRESHOLD_MS ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    title:
      `\`${truncate(missStep.command)}\` (step ${missStep.index}) broke the cache: ` +
      `${downstreamSteps.length} downstream steps rebuilt (${formatDuration(downstreamMs)})`,
    detail:
      `Because this step did not use the cache, every subsequent instruction in the ` +
      `stage had to rebuild, even if their inputs had not changed.`,
    location: { step: missStep.index },
    evidence: {
      stage,
      downstreamCount: downstreamSteps.length,
      downstreamMs,
    },
    estimatedImpact: { milliseconds: downstreamMs },
    suggestedFix:
      'Reorder the Dockerfile to copy stable inputs (dependency manifests) before volatile ' +
      'ones (source code), or use a narrower COPY pattern (e.g., COPY package.json instead of ' +
      'COPY . .) to minimize what invalidates the cache.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'cache-miss-cascade',
  category: CATEGORY.CACHE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.BUILD_TRACE],
  evaluate(model) {
    const groups = groupByStage(model.buildTrace.steps);
    const findings = [];
    for (const [stage, group] of groups) {
      const cascade = findCascadeInGroup(group);
      if (cascade) {
        findings.push(toFinding(cascade, stage === 'default' ? null : stage));
      }
    }
    return findings;
  },
};
