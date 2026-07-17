import { CATEGORY, FIX_RISK, INPUT, SEVERITY } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';

/**
 * Flags FROM images that are not version-pinned. Reproducible builds need exact
 * image versions, not 'latest' or no tag (which implies latest).
 * Digest-pinned images (@sha256:...) are acceptable. Stage references
 * (FROM <earlier-stage>) and variables ($...) cannot be judged, so are skipped.
 */

function hasTag(image) {
  // Check if a ':' exists, and if so, whether it appears after the last '/'.
  // If no '/', any ':' is a tag. If there is a '/', the ':' must come after it.
  const lastSlash = image.lastIndexOf('/');
  if (lastSlash === -1) {
    // No registry, ':' anywhere is a tag (e.g., 'node:22')
    return image.includes(':');
  }
  // Registry present, ':' must occur after the last '/' to be a tag
  const lastColon = image.lastIndexOf(':');
  return lastColon > lastSlash;
}

function extractTag(image) {
  // Assumes hasTag(image) is true. Extract the part after the last ':'.
  const lastColon = image.lastIndexOf(':');
  return image.slice(lastColon + 1);
}

function isDigestPinned(image) {
  // Digest pinning uses @sha256:... syntax
  return image.includes('@');
}

function isStageReference(image, stages, currentStageIndex) {
  // Check if image refers to an earlier stage by name (case-insensitive)
  const imageLower = image.toLowerCase();
  for (let i = 0; i < currentStageIndex; i++) {
    if (stages[i].name && stages[i].name.toLowerCase() === imageLower) {
      return true;
    }
  }
  return false;
}

function isVariable(image) {
  // Variables start with '$'
  return image.startsWith('$');
}

export default {
  id: 'unpinned-base-image',
  category: CATEGORY.DOCKERFILE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.DOCKERFILE],
  evaluate(model) {
    const { dockerfile } = model;
    const findings = [];

    for (const stage of dockerfile.stages) {
      const image = stage.image;

      // Skip special cases: scratch, earlier stage refs, variables, digest-pinned
      if (
        image === 'scratch' ||
        isVariable(image) ||
        isDigestPinned(image) ||
        isStageReference(image, dockerfile.stages, stage.index)
      ) {
        continue;
      }

      // Check if pinned to a version
      if (!hasTag(image)) {
        findings.push(
          makeFinding({
            ruleId: 'unpinned-base-image',
            category: CATEGORY.DOCKERFILE,
            severity: SEVERITY.MEDIUM,
            title: `FROM ${image} has no tag (implies :latest)`,
            detail: `Base image at line ${stage.line} lacks a version tag, so pulls the implicit 'latest' tag. ` +
              'This breaks reproducibility: rebuilds may pull a different image than the original build.',
            location: { line: stage.line },
            evidence: { image },
            fixRisk: FIX_RISK.MEDIUM,
            suggestedFix: 'Pin the base image to a specific version tag (and ideally a digest: image:tag@sha256:...) so builds are reproducible.',
          }),
        );
      } else {
        const tag = extractTag(image);
        if (tag === 'latest') {
          findings.push(
            makeFinding({
              ruleId: 'unpinned-base-image',
              category: CATEGORY.DOCKERFILE,
              severity: SEVERITY.MEDIUM,
              title: `FROM ${image} is not pinned`,
              detail: `Base image at line ${stage.line} uses the 'latest' tag, which may change between builds. ` +
                'This breaks reproducibility: rebuilds may pull a different image.',
              location: { line: stage.line },
              evidence: { image },
              fixRisk: FIX_RISK.MEDIUM,
              suggestedFix: 'Pin the base image to a specific version tag (and ideally a digest: image:tag@sha256:...) so builds are reproducible.',
            }),
          );
        }
      }
    }

    return findings;
  },
};
