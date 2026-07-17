import { CATEGORY, SEVERITY, INPUT, FIX_RISK } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { instructionsInStage } from './helpers.mjs';

/**
 * Detects when the final stage does not set a USER instruction or sets it to root/0.
 * The USER instruction does not carry across stages — only the final stage's USER matters.
 */
export default {
  id: 'root-user',
  category: CATEGORY.SECURITY,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { dockerfile } = model;
    if (dockerfile.stages.length === 0) return [];

    const finalStageIndex = dockerfile.stages.length - 1;
    const finalStageInstructions = instructionsInStage(dockerfile, finalStageIndex);

    // Find all USER instructions in the final stage
    const userInstructions = finalStageInstructions.filter((i) => i.keyword === 'USER');

    // No USER instruction in final stage
    if (userInstructions.length === 0) {
      const fromInstruction = dockerfile.instructions.find(
        (i) => i.keyword === 'FROM' && i.stageIndex === finalStageIndex,
      );
      return [
        makeFinding({
          ruleId: 'root-user',
          category: CATEGORY.SECURITY,
          severity: SEVERITY.LOW,
          title: "Final stage sets no USER (container runs as the base image's default, usually root)",
          detail:
            'The USER instruction does not carry across stages. Without an explicit USER in the final stage, ' +
            'the container will run as whatever user the base image sets by default — typically root.',
          location: fromInstruction ? { line: fromInstruction.line } : null,
          fixRisk: FIX_RISK.HIGH,
          suggestedFix:
            'Create a dedicated user with an explicit UID and switch to it (`USER app`) in the final stage; ' +
            'verify file ownership afterwards.',
        }),
      ];
    }

    // Check the last USER instruction in the final stage
    const lastUserInstruction = userInstructions[userInstructions.length - 1];
    const userArg = lastUserInstruction.args.split(/\s+/)[0];

    // Extract just the user part (before :group if present)
    const username = userArg.split(':')[0];

    if (username === 'root' || username === '0') {
      return [
        makeFinding({
          ruleId: 'root-user',
          category: CATEGORY.SECURITY,
          severity: SEVERITY.MEDIUM,
          title: 'Final stage explicitly runs as root',
          detail: 'The USER instruction in the final stage is set to root or 0, meaning the container will run with root privileges.',
          location: { line: lastUserInstruction.line },
          fixRisk: FIX_RISK.HIGH,
          suggestedFix:
            'Create a dedicated user with an explicit UID and switch to it (`USER app`) in the final stage; ' +
            'verify file ownership afterwards.',
        }),
      ];
    }

    return [];
  },
};
