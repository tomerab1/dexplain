import { THRESHOLDS } from '../constants.mjs';
import cacheInvalidation from './cache-invalidation.mjs';
import missingCacheMount from './missing-cache-mount.mjs';
import noMultistage from './no-multistage.mjs';
import aptAntipattern from './apt-antipattern.mjs';
import yumDnfAntipattern from './yum-dnf-antipattern.mjs';
import slowStep from './slow-step.mjs';
import uncachedExpensiveStep from './uncached-expensive-step.mjs';
import slowExport from './slow-export.mjs';
import fatLayer from './fat-layer.mjs';
import devDepsInFinal from './dev-deps-in-final.mjs';
import contextBloat from './context-bloat.mjs';
import unpinnedBaseImage from './unpinned-base-image.mjs';
import rootUser from './root-user.mjs';
import secretInEnvArg from './secret-in-env-arg.mjs';
import addInsteadOfCopy from './add-instead-of-copy.mjs';
import duplicateLifecycleInstruction from './duplicate-lifecycle-instruction.mjs';
import workdirHygiene from './workdir-hygiene.mjs';
import maintainerDeprecated from './maintainer-deprecated.mjs';

/** The ordered rule registry. Adding a rule is a matter of importing and listing it here. */
export const REGISTRY = [
  cacheInvalidation,
  missingCacheMount,
  noMultistage,
  aptAntipattern,
  yumDnfAntipattern,
  slowStep,
  uncachedExpensiveStep,
  slowExport,
  fatLayer,
  devDepsInFinal,
  contextBloat,
  unpinnedBaseImage,
  rootUser,
  secretInEnvArg,
  addInsteadOfCopy,
  duplicateLifecycleInstruction,
  workdirHygiene,
  maintainerDeprecated,
];

/** A rule runs only when every model part it declares in `requires` is present. */
function isRunnable(rule, model) {
  return rule.requires.every((input) => model[input] != null);
}

/**
 * Runs every applicable rule over the model, isolating failures so one broken rule
 * cannot sink the report. Returns the collected findings plus any per-rule warnings.
 */
export function runRules(model, { thresholds = THRESHOLDS, registry = REGISTRY } = {}) {
  const findings = [];
  const warnings = [];
  for (const rule of registry) {
    if (!isRunnable(rule, model)) continue;
    try {
      findings.push(...rule.evaluate(model, thresholds));
    } catch (error) {
      warnings.push(`rule ${rule.id} failed: ${error.message}`);
    }
  }
  return { findings, warnings };
}
