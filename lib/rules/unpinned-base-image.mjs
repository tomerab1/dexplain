import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

/**
 * Flags FROM images that are not version-pinned ('latest' or no tag). Digest-pinned
 * images (@sha256:...) pass; stage references and $variables cannot be judged, so skip.
 */

const SCRATCH = 'scratch';
const SUGGESTED_FIX =
  'Pin the base image to a specific version tag (and ideally a digest: image:tag@sha256:...) so builds are reproducible.';
const REPRODUCIBILITY = 'This breaks reproducibility: rebuilds may pull a different image than the original build.';

// A ':' only denotes a tag when it appears after the last '/' — before that it is a
// registry port ("myreg.io:5000/app").
function tagOf(image) {
  const lastColon = image.lastIndexOf(':');
  if (lastColon === -1 || lastColon < image.lastIndexOf('/')) return null;
  return image.slice(lastColon + 1);
}

function isStageReference(image, stages, currentStageIndex) {
  const imageLower = image.toLowerCase();
  return stages.some(
    (stage) => stage.index < currentStageIndex && stage.name?.toLowerCase() === imageLower,
  );
}

function isJudgeable(image, stages, stageIndex) {
  return (
    image !== SCRATCH &&
    !image.startsWith('$') &&
    !image.includes('@') &&
    !isStageReference(image, stages, stageIndex)
  );
}

function toFinding(stage, title, detail) {
  return makeFinding({
    ruleId: 'unpinned-base-image',
    category: CATEGORY.DOCKERFILE,
    severity: SEVERITY.MEDIUM,
    title,
    detail: `${detail} ${REPRODUCIBILITY}`,
    location: { line: stage.line },
    evidence: { image: stage.image },
    fixRisk: FIX_RISK.MEDIUM,
    suggestedFix: SUGGESTED_FIX,
  });
}

export default {
  id: 'unpinned-base-image',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { stages } = model.dockerfile;
    const findings = [];
    for (const stage of stages) {
      if (!isJudgeable(stage.image, stages, stage.index)) continue;
      const tag = tagOf(stage.image);
      if (tag === null) {
        findings.push(
          toFinding(
            stage,
            `FROM ${stage.image} has no tag (implies :latest)`,
            `Base image at line ${stage.line} lacks a version tag, so pulls the implicit 'latest' tag.`,
          ),
        );
      } else if (tag === 'latest') {
        findings.push(
          toFinding(
            stage,
            `FROM ${stage.image} is not pinned`,
            `Base image at line ${stage.line} uses the 'latest' tag, which may change between builds.`,
          ),
        );
      }
    }
    return findings;
  },
};
