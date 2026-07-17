/**
 * Central constants for dexplain. Every threshold, category name, severity, and exit
 * code lives here so rules and renderers never carry inline magic values, and tuning
 * behaviour is a one-line change.
 */

export const SEVERITY = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
});

/** Higher number = more severe; used to rank findings. */
export const SEVERITY_RANK = Object.freeze({
  [SEVERITY.HIGH]: 3,
  [SEVERITY.MEDIUM]: 2,
  [SEVERITY.LOW]: 1,
});

export const CATEGORY = Object.freeze({
  CACHE: 'cache',
  BUILD_TIME: 'build-time',
  IMAGE_SIZE: 'image-size',
  DOCKERFILE: 'dockerfile',
  CONTEXT: 'context',
  SECURITY: 'security',
});

/** The model parts a rule may depend on; the runner skips rules whose inputs are absent. */
export const INPUT = Object.freeze({
  DOCKERFILE: 'dockerfile',
  BUILD_TRACE: 'buildTrace',
  IMAGE: 'image',
  CONTEXT: 'context',
});

/**
 * How likely applying a finding's suggestedFix is to change build/runtime behavior.
 * low = cache/metadata only; medium = changes layer contents in bounded ways;
 * high = can alter what the image does at runtime — verify after applying.
 */
export const FIX_RISK = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

export const EXIT = Object.freeze({
  OK: 0,
  FINDINGS: 5,
  USAGE: 2,
  DOCKER_UNAVAILABLE: 3,
  BUILD_FAILED: 4,
  RUNTIME_ERROR: 1,
});

/**
 * Docker humanizes sizes with base-1000 units (kB, MB, GB), matching
 * docker/go-units HumanSize. Parsed back to bytes with these multipliers.
 */
export const SIZE_UNIT_BYTES = Object.freeze({
  b: 1,
  kb: 1000,
  mb: 1000 ** 2,
  gb: 1000 ** 3,
  tb: 1000 ** 4,
});

/** Tunable thresholds for the rule engine. */
export const THRESHOLDS = Object.freeze({
  slowStepShareOfBuild: 0.25,
  slowStepMinDurationMs: 3000,
  fatLayerBytes: 50 * SIZE_UNIT_BYTES.mb,
  fatLayerReportLimit: 6,
  fatLayerSevereMultiplier: 3,
  devArtifactMinBytes: 10 * SIZE_UNIT_BYTES.mb,
  contextBloatBytes: 20 * SIZE_UNIT_BYTES.mb,
  missingIgnoreMinBytes: 1 * SIZE_UNIT_BYTES.mb,
  expensiveStepMinDurationMs: 5000,
  exportShareOfBuild: 0.25,
  exportMinDurationMs: 5000,
});

/** Package managers whose install/download steps benefit from a BuildKit cache mount. */
export const PACKAGE_MANAGER_CACHE_MOUNTS = Object.freeze([
  { name: 'npm', match: /\bnpm\s+(ci|install|i)\b/, target: '/root/.npm' },
  // `yarn install`/`yarn add` anywhere, or command-position bare `yarn` (yarn v1 implicit
  // install), optionally with flags — but never `yarn <subcommand>`.
  { name: 'yarn', match: /\byarn\s+(install|add)\b|(?:^|&&|;|\|)\s*yarn(\s+--\S+)*\s*(?:$|&&|;|\|)/, target: '/usr/local/share/.cache/yarn' },
  { name: 'pnpm', match: /\bpnpm\s+(install|i|add)\b/, target: '/root/.local/share/pnpm/store' },
  { name: 'pip', match: /\b(?:pip3?|python3?\s+-m\s+pip)\s+install\b/, target: '/root/.cache/pip' },
  // Flags may sit between the command and subcommand ("apt-get -y install").
  { name: 'apt', match: /\bapt(-get)?\s+(?:-{1,2}\S+\s+)*install\b/, target: '/var/cache/apt' },
  { name: 'apk', match: /\bapk\s+add\b(?![^]*--no-cache)/, target: '/var/cache/apk' },
  { name: 'go', match: /\bgo\s+(mod\s+download|build|install)\b/, target: '/root/.cache/go-build' },
]);

/** Instruction keywords that copy source/context into the image. */
export const SOURCE_COPY_KEYWORDS = Object.freeze(['COPY', 'ADD']);

/** Default Dockerfile name when `-f` is not supplied. */
export const DEFAULT_DOCKERFILE = 'Dockerfile';

/** Minimum Buildx version required for --progress=rawjson (introduced early 2024). */
export const MIN_BUILDX = Object.freeze({ major: 0, minor: 13 });

/** Safety cap on files walked while measuring a build context. */
export const CONTEXT_SCAN_MAX_ENTRIES = 500_000;

/** Commands that indicate a stage is compiling/building artifacts (a build stage). */
export const BUILD_COMMAND = /\b(npm|yarn|pnpm)\s+run\s+build\b|\bgo\s+build\b|\bmake\b|\bmvn\b|\bgradle\b|\bcargo\s+build\b|\btsc\b|\bwebpack\b|\bvite\s+build\b/;

/** apt cleanup that keeps package lists out of the final layer. */
export const APT_LIST_CLEANUP = /rm\s+-rf\s+\/var\/lib\/apt\/lists/;

/** Paths whose presence in a final image layer suggests shipped build/dev artifacts. */
export const DEV_ARTIFACT_HINTS = Object.freeze([
  'node_modules',
  '.npm',
  '.cache',
  '.git',
  '/root/.cache',
  'yarn.lock',
]);

/** Maximum number of process output lines to keep per failed build step. */
export const LOG_TAIL_MAX_LINES = 20;
