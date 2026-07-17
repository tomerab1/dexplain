import { CATEGORY, SEVERITY, INPUT, FIX_RISK } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

/**
 * Flags ENV/ARG values that look like secrets. ENV persists in the image config and
 * ARG in build history, so both are visible to anyone who can pull the image.
 */

const SECRET_NAME_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?|AUTH)/i;
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;
const SUGGESTED_FIX =
  'Pass secrets with BuildKit secret mounts (`RUN --mount=type=secret,id=...`) or at runtime — never via ENV/ARG.';

// ENV accepts `KEY=value [KEY2=value2 ...]` and the legacy `KEY value`; ARG accepts
// `KEY` or `KEY=default`.
function variableNames(instruction) {
  const tokens = instruction.args.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  if (instruction.keyword === 'ARG') return [tokens[0].split('=')[0]];
  const assignments = tokens.filter((token) => token.includes('='));
  if (assignments.length) return assignments.map((token) => token.split('=')[0]);
  return [tokens[0]];
}

function secretFinding(instruction, title, detail) {
  return makeFinding({
    ruleId: 'secret-in-env-arg',
    category: CATEGORY.SECURITY,
    severity: SEVERITY.HIGH,
    title,
    detail,
    location: { line: instruction.line },
    evidence: { keyword: instruction.keyword },
    fixRisk: FIX_RISK.MEDIUM,
    suggestedFix: SUGGESTED_FIX,
  });
}

function nameFinding(instruction, name) {
  const persistence =
    instruction.keyword === 'ARG'
      ? 'ARG values persist in build history'
      : 'ENV values are baked into the image config';
  const finding = secretFinding(
    instruction,
    `\`${instruction.keyword} ${name}\` may embed a secret in the image`,
    `The variable \`${name}\` suggests it may contain a secret (password, token, key, etc.). ` +
      `${persistence}, exposing them to anyone who can pull the image.`,
  );
  finding.evidence.name = name;
  return finding;
}

function awsKeyFinding(instruction) {
  return secretFinding(
    instruction,
    'Hardcoded AWS access key id detected',
    `An AWS access key id (AKIA...) is hardcoded in this ${instruction.keyword} instruction. ` +
      'AWS credentials must never be embedded in image layers or history.',
  );
}

// A line yields at most one finding; a secret-looking name wins over the value scan.
function evaluateInstruction(instruction) {
  const secretName = variableNames(instruction).find((name) => SECRET_NAME_PATTERN.test(name));
  if (secretName) return nameFinding(instruction, secretName);
  if (AWS_ACCESS_KEY_PATTERN.test(instruction.args)) return awsKeyFinding(instruction);
  return null;
}

export default {
  id: 'secret-in-env-arg',
  category: CATEGORY.SECURITY,
  severity: SEVERITY.HIGH,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    return model.dockerfile.instructions
      .filter((instruction) => instruction.keyword === 'ENV' || instruction.keyword === 'ARG')
      .map(evaluateInstruction)
      .filter(Boolean);
  },
};
