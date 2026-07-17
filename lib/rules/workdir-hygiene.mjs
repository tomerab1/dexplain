import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

/** Instructions by keyword type. */
function instructionsByKeyword(dockerfile, keyword) {
  return dockerfile.instructions.filter((instruction) => instruction.keyword === keyword);
}

function runStartsWithCdFinding(instruction) {
  return makeFinding({
    ruleId: 'workdir-hygiene',
    category: CATEGORY.DOCKERFILE,
    severity: SEVERITY.LOW,
    title: 'RUN starts with `cd` — use WORKDIR instead',
    detail:
      `RUN at line ${instruction.line} starts with \`cd\`; a cd only affects the current RUN ` +
      'and hides the real working directory from subsequent instructions.',
    location: { line: instruction.line },
    suggestedFix: 'Set `WORKDIR <dir>` before this RUN; WORKDIR persists for all subsequent instructions.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

function relativeWorkdirFinding(instruction) {
  return makeFinding({
    ruleId: 'workdir-hygiene',
    category: CATEGORY.DOCKERFILE,
    severity: SEVERITY.LOW,
    title: 'WORKDIR uses a relative path',
    detail:
      `WORKDIR at line ${instruction.line} uses a relative path; relative WORKDIRs accumulate, ` +
      'and the effective directory depends on earlier WORKDIRs.',
    location: { line: instruction.line },
    suggestedFix: 'Use an absolute WORKDIR (e.g. /app) so the effective directory doesn\'t depend on earlier WORKDIRs.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'workdir-hygiene',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.LOW,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const findings = [];

    const runs = instructionsByKeyword(model.dockerfile, 'RUN');
    for (const run of runs) {
      const trimmed = run.args.trim();
      if (/^cd\s+/.test(trimmed) || trimmed === 'cd') {
        findings.push(runStartsWithCdFinding(run));
      }
    }

    const workdirs = instructionsByKeyword(model.dockerfile, 'WORKDIR');
    for (const workdir of workdirs) {
      const trimmed = workdir.args.trim();
      const firstToken = trimmed.split(/\s+/)[0];
      if (firstToken && !firstToken.startsWith('/') && !firstToken.startsWith('$')) {
        findings.push(relativeWorkdirFinding(workdir));
      }
    }

    return findings;
  },
};
