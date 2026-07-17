import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

/**
 * Flags the deprecated MAINTAINER instruction. Docker recommends using
 * LABEL maintainer="..." instead, which is more flexible and integrates
 * with the rest of the image metadata.
 */

export default {
  id: 'maintainer-deprecated',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.LOW,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { dockerfile } = model;
    const findings = [];

    for (const instruction of dockerfile.instructions) {
      if (instruction.keyword === 'MAINTAINER') {
        findings.push(
          makeFinding({
            ruleId: 'maintainer-deprecated',
            category: CATEGORY.DOCKERFILE,
            severity: SEVERITY.LOW,
            title: 'MAINTAINER instruction is deprecated',
            detail: `MAINTAINER at line ${instruction.line} is deprecated since Docker 1.13. ` +
              'Use LABEL maintainer="..." instead, which is more flexible and integrates with image metadata.',
            location: { line: instruction.line },
            fixRisk: FIX_RISK.LOW,
            suggestedFix: 'Replace the deprecated MAINTAINER with `LABEL maintainer="..."`.',
          }),
        );
      }
    }

    return findings;
  },
};
