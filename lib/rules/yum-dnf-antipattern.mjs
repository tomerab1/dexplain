import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { commandTextOf, instructionHasCacheMount, runInstructions } from './helpers.mjs';

// Flags may sit between the command and subcommand ("dnf -y install").
const RPM_INSTALL = /\b(yum|dnf|microdnf)\s+(?:-\S+\s+)*install\b/;
const YUM_CLEAN = /\byum\s+clean\s+all\b/;
const DNF_CLEAN = /\bdnf\s+clean\s+all\b/;
const MICRODNF_CLEAN = /\bmicrodnf\s+clean\s+all\b/;

function getManager(text) {
  const match = text.match(/\b(yum|dnf|microdnf)\b/);
  return match ? match[1] : null;
}

function hasCleanup(text, manager) {
  if (manager === 'yum') return YUM_CLEAN.test(text);
  if (manager === 'dnf') return DNF_CLEAN.test(text);
  if (manager === 'microdnf') return MICRODNF_CLEAN.test(text);
  return false;
}

function noCacheCleanupFinding(instruction, manager) {
  return makeFinding({
    ruleId: 'yum-dnf-antipattern',
    category: CATEGORY.IMAGE_SIZE,
    severity: SEVERITY.LOW,
    title: `${manager} install leaves package cache in the layer`,
    detail: `\`${manager} install\` at line ${instruction.line} does not run \`${manager} clean all\`, leaving cache in the layer.`,
    location: { line: instruction.line },
    evidence: { manager },
    suggestedFix: `Append \`&& ${manager} clean all\` in the same RUN, or use a cache mount for /var/cache/${manager}.`,
    fixRisk: FIX_RISK.LOW,
  });
}

export default {
  id: 'yum-dnf-antipattern',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.LOW,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const runs = runInstructions(model.dockerfile);
    const findings = [];
    for (const run of runs) {
      const text = commandTextOf(run);
      if (!RPM_INSTALL.test(text)) continue;
      const manager = getManager(text);
      if (!manager) continue;
      if (!hasCleanup(text, manager) && !instructionHasCacheMount(run)) {
        findings.push(noCacheCleanupFinding(run, manager));
      }
    }
    return findings;
  },
};
