import { PACKAGE_MANAGER_CACHE_MOUNTS, SOURCE_COPY_KEYWORDS } from '../constants.mjs';

/** All RUN instructions in a parsed Dockerfile. */
export function runInstructions(dockerfile) {
  return dockerfile.instructions.filter((instruction) => instruction.keyword === 'RUN');
}

/** Instructions belonging to a given stage index, in file order. */
export function instructionsInStage(dockerfile, stageIndex) {
  return dockerfile.instructions.filter((instruction) => instruction.stageIndex === stageIndex);
}

/** The package-manager descriptor whose command appears in the text, or null. */
export function matchPackageManager(text) {
  return PACKAGE_MANAGER_CACHE_MOUNTS.find((manager) => manager.match.test(text)) ?? null;
}

export function hasCacheMount(text) {
  return /--mount=type=cache/.test(text);
}

const FLAG = /^--/;

function copyOperands(args) {
  return args.split(/\s+/).filter((token) => token && !FLAG.test(token));
}

/**
 * True when a COPY/ADD pulls the whole build context (source `.`) into the image,
 * excluding cross-stage copies (`--from=`), which do not depend on the source context.
 */
export function isBroadSourceCopy(instruction) {
  if (!SOURCE_COPY_KEYWORDS.includes(instruction.keyword)) return false;
  if (/--from=/.test(instruction.args)) return false;
  const operands = copyOperands(instruction.args);
  if (operands.length < 2) return false;
  const sources = operands.slice(0, -1);
  return sources.some((source) => source === '.' || source === './');
}

/** Truncates a command string for compact evidence lines. */
export function truncate(text, max = 80) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
