import { CATEGORY, FIX_RISK, INPUT, SEVERITY, THRESHOLDS } from '../constants.mjs';
import { makeFinding } from '../model/finding.mjs';
import { formatBytes } from '../format.mjs';
import { truncate } from './helpers.mjs';

/**
 * Flags image layers larger than a byte threshold, largest first, so the biggest
 * contributors to image size are obvious. Names the instruction that created each.
 */
function severityFor(bytes, thresholds) {
  return bytes >= thresholds.fatLayerBytes * thresholds.fatLayerSevereMultiplier
    ? SEVERITY.HIGH
    : SEVERITY.MEDIUM;
}

function toFinding(layer, thresholds) {
  return makeFinding({
    ruleId: 'fat-layer',
    category: CATEGORY.IMAGE_SIZE,
    severity: severityFor(layer.bytes, thresholds),
    title: `Layer ${layer.index} adds ${formatBytes(layer.bytes)}`,
    detail: `\`${truncate(layer.createdBy)}\` is one of the largest layers in the image.`,
    location: { layer: layer.index },
    evidence: { bytes: layer.bytes, createdBy: layer.createdBy },
    estimatedImpact: { bytes: layer.bytes },
    suggestedFix:
      'Shrink what this layer adds: clean caches in the same RUN, copy fewer files, or move the ' +
      'artifact out of the final stage.',
    fixRisk: FIX_RISK.MEDIUM,
  });
}

export default {
  id: 'fat-layer',
  category: CATEGORY.IMAGE_SIZE,
  severity: SEVERITY.MEDIUM,
  requires: [INPUT.IMAGE],
  evaluate(model, thresholds = THRESHOLDS) {
    return model.image.layers
      .filter((layer) => layer.bytes >= thresholds.fatLayerBytes)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, thresholds.fatLayerReportLimit)
      .map((layer) => toFinding(layer, thresholds));
  },
};
