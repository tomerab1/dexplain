import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DEFAULT_DOCKERFILE, EXIT, SEVERITY } from './constants.mjs';
import { dockerStatus, buildxStatus } from './docker.mjs';
import { runInstrumentedBuild } from './collect/build-run.mjs';
import { parseBuildTrace } from './collect/build-events.mjs';
import { parseDockerfile } from './collect/dockerfile-parse.mjs';
import { measureContext, resolveDockerfilePath } from './collect/context-size.mjs';
import { collectImage } from './collect/image-collect.mjs';
import { runRules } from './rules/index.mjs';
import { buildReport, hasFindingsAtOrAbove } from './model/report.mjs';
import { renderHuman } from './render/human.mjs';
import { renderJson } from './render/json.mjs';
import { createProgressPrinter } from './render/progress.mjs';

const USAGE = `dexplain — EXPLAIN for Docker builds and images

Usage:
  dexplain build [docker build args...]   run the build (rawjson) and analyze build + image
  dexplain analyze <build-log.ndjson>     analyze a previously captured rawjson stream
  dexplain image <name:tag>               analyze an existing image's layers/size
  dexplain dockerfile [path]              static-only analysis of a Dockerfile

Options:
  --json              print the full machine-readable report
  --json-out <path>   also write the full report to a file
  --image <ref>       (analyze) also analyze this image
  --top <n>           limit the human summary to the top n findings
  --fail-on <sev>     exit ${EXIT.FINDINGS} if findings at/above this severity (high|medium|low)
  --timeline          always show the build timeline (--no-timeline hides it)
  --no-color          disable ANSI colour`;

const VALUE_OWN_FLAGS = new Set(['--json-out', '--top', '--image', '--fail-on']);
const BOOLEAN_OWN_FLAGS = new Set(['--json', '--no-color', '--timeline', '--no-timeline']);

function assignFlag(options, flag, value) {
  if (flag === '--json') options.json = true;
  else if (flag === '--no-color') options.noColor = true;
  else if (flag === '--timeline') options.timeline = true;
  else if (flag === '--no-timeline') options.timeline = false;
  else if (flag === '--json-out') options.jsonOut = value;
  else if (flag === '--image') options.image = value;
  else if (flag === '--top') options.top = Number(value);
  else if (flag === '--fail-on') options.failOn = value;
}

export function parseCliArgs(argv) {
  const options = { json: false, noColor: false, jsonOut: null, image: null, top: null, failOn: null, timeline: null };
  const remaining = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const eq = token.indexOf('=');
    const flag = token.startsWith('--') && eq !== -1 ? token.slice(0, eq) : token;
    if (VALUE_OWN_FLAGS.has(flag) && eq !== -1) assignFlag(options, flag, token.slice(eq + 1));
    else if (VALUE_OWN_FLAGS.has(flag)) assignFlag(options, flag, argv[(i += 1)]);
    else if (BOOLEAN_OWN_FLAGS.has(flag)) assignFlag(options, flag);
    else remaining.push(token);
  }
  return { command: remaining[0] ?? null, rest: remaining.slice(1), options };
}

async function collectBuild(rest, options, io) {
  io.err('→ docker build (live progress; full report follows)');
  const progressPrinter = createProgressPrinter((line) => io.err(line));
  const result = await runInstrumentedBuild(rest, { onStatus: progressPrinter });
  if (result.spawnError) return { fatal: { reason: result.message, code: EXIT.BUILD_FAILED } };
  const warnings = [];
  const model = { buildTrace: parseBuildTrace(result.rawjson) };
  const dockerfilePath = resolveDockerfilePath(result.meta.file, result.meta.contextDir);
  if (existsSync(dockerfilePath)) model.dockerfile = parseDockerfile(readFileSync(dockerfilePath, 'utf8'), dockerfilePath);
  else warnings.push(`Dockerfile not found at ${dockerfilePath}; skipped Dockerfile rules`);
  model.context = measureContext(result.meta.contextDir);
  await attachBuiltImage(result, model, warnings);
  if (result.code !== 0) warnings.push(`docker build exited ${result.code}; analyzed the partial trace`);
  return { command: 'build', model, warnings, exitCode: result.code === 0 ? EXIT.OK : EXIT.BUILD_FAILED };
}

async function attachBuiltImage(result, model, warnings) {
  if (!result.meta.tag) {
    warnings.push('no image tag (-t) given; skipped image analysis');
    return;
  }
  if (result.code !== 0) return;
  const image = await collectImage(result.meta.tag);
  if (image.image) model.image = image.image;
  else warnings.push(image.error);
}

async function collectAnalyze(rest, options) {
  const path = rest[0];
  if (!path) return { fatal: { reason: 'usage: dexplain analyze <build-log.ndjson>', code: EXIT.USAGE } };
  if (!existsSync(path)) return { fatal: { reason: `file not found: ${path}`, code: EXIT.RUNTIME_ERROR } };
  const warnings = [];
  const model = { buildTrace: parseBuildTrace(readFileSync(path, 'utf8')) };
  if (options.image) {
    const image = await collectImage(options.image);
    if (image.image) model.image = image.image;
    else warnings.push(image.error);
  }
  return { command: 'analyze', model, warnings, exitCode: EXIT.OK };
}

async function collectImageCommand(rest) {
  const ref = rest[0];
  if (!ref) return { fatal: { reason: 'usage: dexplain image <name:tag>', code: EXIT.USAGE } };
  const image = await collectImage(ref);
  if (image.error) return { fatal: { reason: image.error, code: EXIT.RUNTIME_ERROR } };
  return { command: 'image', model: { image: image.image }, warnings: [], exitCode: EXIT.OK };
}

function collectDockerfile(rest) {
  const path = rest[0] ?? DEFAULT_DOCKERFILE;
  if (!existsSync(path)) return { fatal: { reason: `Dockerfile not found: ${path}`, code: EXIT.RUNTIME_ERROR } };
  return {
    command: 'dockerfile',
    model: { dockerfile: parseDockerfile(readFileSync(path, 'utf8'), path) },
    warnings: [],
    exitCode: EXIT.OK,
  };
}

const COMMANDS = { build: collectBuild, analyze: collectAnalyze, image: collectImageCommand, dockerfile: collectDockerfile };
const NEEDS_DOCKER = new Set(['build', 'image']);
const NEEDS_BUILDX = new Set(['build']);

function emit(report, options, io) {
  const full = renderJson(report);
  if (options.json) io.out(full);
  else {
    const forDisplay = options.top ? { ...report, findings: report.findings.slice(0, options.top) } : report;
    io.out(renderHuman(forDisplay, { color: options.color, timeline: options.timeline, width: io.width }));
  }
  if (options.jsonOut) {
    writeFileSync(options.jsonOut, full);
    io.err(`report written to ${options.jsonOut}`);
  }
}

function defaultIo() {
  return {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
    isTTY: process.stdout.isTTY ?? false,
    width: process.stdout.columns ?? null,
  };
}

export async function main(argv, io = defaultIo()) {
  const { command, rest, options } = parseCliArgs(argv);
  options.color = !options.noColor && io.isTTY;
  if (!command || command === 'help' || command === '--help') {
    io.out(USAGE);
    return EXIT.OK;
  }
  if (!COMMANDS[command]) {
    io.err(`unknown command: ${command}`);
    io.out(USAGE);
    return EXIT.USAGE;
  }
  if (options.failOn && !SEVERITY[options.failOn.toUpperCase()]) {
    io.err(`dexplain: invalid --fail-on value: ${options.failOn}`);
    io.out(USAGE);
    return EXIT.USAGE;
  }
  if (NEEDS_DOCKER.has(command)) {
    const status = await dockerStatus();
    if (!status.ok) {
      io.err(`dexplain: ${status.reason}`);
      return EXIT.DOCKER_UNAVAILABLE;
    }
  }
  if (NEEDS_BUILDX.has(command)) {
    const status = await buildxStatus();
    if (!status.ok) {
      io.err(`dexplain: ${status.reason}`);
      return EXIT.DOCKER_UNAVAILABLE;
    }
  }
  const collected = await COMMANDS[command](rest, options, io);
  if (collected.fatal) {
    io.err(`dexplain: ${collected.fatal.reason}`);
    return collected.fatal.code;
  }
  const { findings, warnings: ruleWarnings } = runRules(collected.model);
  const report = buildReport({
    command: collected.command,
    ...collected.model,
    findings,
    warnings: [...collected.warnings, ...ruleWarnings],
  });
  emit(report, options, io);
  if (options.failOn && collected.exitCode === EXIT.OK && hasFindingsAtOrAbove(report, options.failOn)) {
    return EXIT.FINDINGS;
  }
  return collected.exitCode;
}
