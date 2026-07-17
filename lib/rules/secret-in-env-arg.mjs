import { CATEGORY, SEVERITY, INPUT, FIX_RISK } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

const SECRET_NAME_PATTERN = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?|AUTH)/i;
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;

/**
 * Detects potential secrets embedded in ENV and ARG instructions.
 * ENV values are baked into the image config; ARG values persist in image history.
 * Both are visible to anyone who can pull or inspect the image.
 */
export default {
  id: 'secret-in-env-arg',
  category: CATEGORY.SECURITY,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { dockerfile } = model;
    const findings = [];

    for (const instruction of dockerfile.instructions) {
      if (instruction.keyword !== 'ENV' && instruction.keyword !== 'ARG') continue;

      // Extract variable names
      let names = [];

      if (instruction.keyword === 'ENV') {
        // Handle both forms: ENV KEY=value and ENV KEY value
        const tokens = instruction.args.split(/\s+/);
        if (tokens.length === 0) continue;

        // Check if we have KEY=value format (any token with =)
        const hasEquals = tokens.some((t) => t.includes('='));

        if (hasEquals) {
          // ENV KEY=value [KEY2=value2 ...]
          // Extract everything before = from each token with =
          names = tokens.filter((t) => t.includes('=')).map((t) => t.split('=')[0]);
        } else {
          // ENV KEY value (legacy)
          names = [tokens[0]];
        }
      } else if (instruction.keyword === 'ARG') {
        // ARG KEY or ARG KEY=default
        const firstToken = instruction.args.split(/\s+/)[0];
        if (firstToken) {
          names = [firstToken.split('=')[0]];
        }
      }

      // Check names first (name-match wins for deduplication)
      let foundNameMatch = false;
      for (const name of names) {
        if (SECRET_NAME_PATTERN.test(name)) {
          const isArg = instruction.keyword === 'ARG';
          findings.push(
            makeFinding({
              ruleId: 'secret-in-env-arg',
              category: CATEGORY.SECURITY,
              severity: SEVERITY.HIGH,
              title: `\`${instruction.keyword} ${name}\` may embed a secret in the image`,
              detail:
                `The variable \`${name}\` suggests it may contain a secret (password, token, key, etc.). ` +
                `${instruction.keyword} values are baked into the image config${isArg ? ' and persist in build history' : ''}, ` +
                'exposing them to anyone who can pull the image.',
              location: { line: instruction.line },
              evidence: { name, keyword: instruction.keyword },
              fixRisk: FIX_RISK.MEDIUM,
              suggestedFix:
                'Pass secrets with BuildKit secret mounts (`RUN --mount=type=secret,id=...`) or at runtime — never via ENV/ARG.',
            }),
          );
          foundNameMatch = true;
          break;
        }
      }

      // Check for AWS access key pattern only if no name match was found
      if (!foundNameMatch && AWS_ACCESS_KEY_PATTERN.test(instruction.args)) {
        findings.push(
          makeFinding({
            ruleId: 'secret-in-env-arg',
            category: CATEGORY.SECURITY,
            severity: SEVERITY.HIGH,
            title: 'Hardcoded AWS access key id detected',
            detail:
              `An AWS access key id (AKIA...) is hardcoded in this ${instruction.keyword} instruction. ` +
              'AWS credentials must never be embedded in image layers or history.',
            location: { line: instruction.line },
            evidence: { keyword: instruction.keyword, pattern: 'AWS access key id' },
            fixRisk: FIX_RISK.MEDIUM,
            suggestedFix: 'Pass secrets with BuildKit secret mounts (`RUN --mount=type=secret,id=...`) or at runtime — never via ENV/ARG.',
          }),
        );
      }
    }

    return findings;
  },
};
