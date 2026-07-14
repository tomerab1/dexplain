import { BUILD_COMMAND, CATEGORY, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { matchPackageManager, runInstructions } from './helpers.mjs';

/**
 * Flags a single-stage build that both compiles artifacts and ships them: the build
 * toolchain and intermediate files end up in the final image. A multi-stage build keeps
 * only the runtime output.
 */
function buildsArtifacts(dockerfile) {
  return runInstructions(dockerfile).some(
    (instruction) => BUILD_COMMAND.test(instruction.args) || matchPackageManager(instruction.args),
  );
}

export default {
  id: 'no-multistage',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { dockerfile } = model;
    if (dockerfile.stages.length > 1 || !buildsArtifacts(dockerfile)) return [];
    const firstFrom = dockerfile.instructions.find((instruction) => instruction.keyword === 'FROM');
    return [
      makeFinding({
        ruleId: 'no-multistage',
        category: CATEGORY.IMAGE_SIZE,
        severity: SEVERITY.MEDIUM,
        title: 'Single-stage build ships the build toolchain',
        detail:
          'This Dockerfile builds artifacts and ships them from one stage, so compilers, ' +
          'dev dependencies, and intermediate files remain in the final image.',
        location: firstFrom ? { line: firstFrom.line } : null,
        suggestedFix:
          'Split into a build stage that compiles and a slim runtime stage that copies only the ' +
          'built output with `COPY --from=build`.',
      }),
    ];
  },
};
