import { CATEGORY, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatBytes } from '../format.mjs';

/**
 * Flags a heavy build context, which is uploaded to the daemon on every build and slows
 * the initial phase. A missing .dockerignore is called out because it is the usual cause.
 */
function toFinding(context) {
  const noIgnore = context.hasDockerignore === false;
  return makeFinding({
    ruleId: 'context-bloat',
    category: CATEGORY.CONTEXT,
    severity: noIgnore ? SEVERITY.MEDIUM : SEVERITY.LOW,
    title: `Build context is ${formatBytes(context.totalBytes)}${noIgnore ? ' with no .dockerignore' : ''}`,
    detail:
      'The whole context is sent to the daemon before the build starts; a large context slows ' +
      'every build and can pull unwanted files into COPY.',
    evidence: { bytes: context.totalBytes, hasDockerignore: context.hasDockerignore },
    suggestedFix: noIgnore
      ? 'Add a .dockerignore excluding node_modules, .git, build output, and local caches.'
      : 'Trim the context or tighten .dockerignore so only what the build needs is uploaded.',
  });
}

export default {
  id: 'context-bloat',
  category: CATEGORY.CONTEXT,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.CONTEXT],
  evaluate(model, thresholds = THRESHOLDS) {
    const { context } = model;
    const tooBig = context.totalBytes >= thresholds.contextBloatBytes;
    const missingIgnore = context.hasDockerignore === false && context.totalBytes > 0;
    return tooBig || missingIgnore ? [toFinding(context)] : [];
  },
};
