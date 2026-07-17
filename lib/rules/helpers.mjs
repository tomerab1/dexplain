import { PACKAGE_MANAGER_CACHE_MOUNTS, SOURCE_COPY_KEYWORDS } from '../constants.mjs';

/** Returns the command text: shell-form args, exec-form joined argv, or heredoc body. */
export function commandTextOf(instruction) {
  return instruction.shellText ?? instruction.args;
}

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

// Options may precede type= ("--mount=target=/root/.cache,type=cache").
const CACHE_MOUNT = /--mount=\S*\btype=cache\b/;

export function hasCacheMount(text) {
  return CACHE_MOUNT.test(text);
}

/**
 * Cache-mount flags live on the instruction line (args), while heredoc command text
 * lives in the body — so mount detection must look at both.
 */
export function instructionHasCacheMount(instruction) {
  return hasCacheMount(instruction.args) || hasCacheMount(commandTextOf(instruction));
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
