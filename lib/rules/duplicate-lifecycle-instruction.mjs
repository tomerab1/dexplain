/**
 * Flags shadowed CMD, ENTRYPOINT, and HEALTHCHECK instructions within a stage.
 * Only the last one in a stage takes effect; earlier ones mislead readers.
 * Hadolint flavor: DL4003 (duplicate ENTRYPOINT), DL4004 (duplicate CMD), DL3012 (duplicate HEALTHCHECK).
 */

import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

const LIFECYCLE_KEYWORDS = new Set(['CMD', 'ENTRYPOINT', 'HEALTHCHECK']);

/**
 * Group instructions by stageIndex, then by keyword.
 * Returns { stageIndex: { keyword: [instructions] } }.
 */
function groupByStageAndKeyword(instructions) {
  const grouped = {};
  for (const instruction of instructions) {
    if (!LIFECYCLE_KEYWORDS.has(instruction.keyword)) continue;

    const stageKey = instruction.stageIndex;
    if (!grouped[stageKey]) grouped[stageKey] = {};
    if (!grouped[stageKey][instruction.keyword]) {
      grouped[stageKey][instruction.keyword] = [];
    }
    grouped[stageKey][instruction.keyword].push(instruction);
  }
  return grouped;
}

/**
 * For each keyword that appears more than once in a stage,
 * create findings for all but the last occurrence.
 */
function shadowing(instruction, keyword, winningLine) {
  return makeFinding({
    ruleId: 'duplicate-lifecycle-instruction',
    category: CATEGORY.DOCKERFILE,
    severity: SEVERITY.LOW,
    title: `\`${keyword}\` at line ${instruction.line} is ignored — a later one at line ${winningLine} wins`,
    detail:
      `Only the last \`${keyword}\` in a stage takes effect. ` +
      `The \`${keyword}\` at line ${instruction.line} is shadowed by line ${winningLine} and will be ignored.`,
    location: { line: instruction.line },
    evidence: { keyword, winningLine },
    fixRisk: FIX_RISK.LOW,
    suggestedFix:
      `Remove the shadowed \`${keyword}\` (only the last one in a stage takes effect).`,
  });
}

export default {
  id: 'duplicate-lifecycle-instruction',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.LOW,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const findings = [];
    const grouped = groupByStageAndKeyword(model.dockerfile.instructions);

    // For each stage and keyword, flag all but the last occurrence
    for (const stageKey in grouped) {
      for (const keyword in grouped[stageKey]) {
        const instructionsForKeyword = grouped[stageKey][keyword];
        if (instructionsForKeyword.length <= 1) continue;

        // Last instruction wins; all earlier ones are shadowed
        const winningLine = instructionsForKeyword[instructionsForKeyword.length - 1].line;
        for (let i = 0; i < instructionsForKeyword.length - 1; i++) {
          findings.push(shadowing(instructionsForKeyword[i], keyword, winningLine));
        }
      }
    }

    return findings;
  },
};
