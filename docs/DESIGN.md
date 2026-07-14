# dexplain — design spec

**Date:** 2026-07-14
**Status:** approved (via `/goal execute`), in implementation

## Purpose

`dexplain` is a pure-Node (ESM) CLI that surfaces Docker **build** and **image**
bottlenecks as structured, ranked findings — the "EXPLAIN" for Docker builds. It
collects Docker's own facts, runs a deterministic rule engine over them, and emits
a normalized JSON report plus a human summary. The judgment layer (which fixes are
worth it, given intent) is Claude reading the report in-session — the same loop as
`mongo explain()` → add an index.

Scope for v1: build-time + image-size. Runtime (container CPU/mem/IO) is deferred to v2.

## Non-goals

- No `claude -p` / metered LLM inside the tool. Reasoning happens in-session.
- Not a linter replacement (hadolint) or scanner (trivy); no external tools required.
- Never mutates or prunes images. Read-only apart from running the build the user asked for.

## Commands

- `dexplain build [<docker build args…>]` — injects `--progress=rawjson`, runs the
  user's build, captures per-step timing + cache hit/miss, then also analyzes the
  resulting image. Extra args pass through to `docker build` unchanged.
- `dexplain analyze <build-log.ndjson>` — ingests a previously captured rawjson stream
  (e.g. CI). Build-only unless `--image <ref>` is given.
- `dexplain image <name:tag>` — analyzes an existing image (layers/size/bloat), no build.
- `dexplain dockerfile <path>` — static-only pass: runs the rules that need just the AST.

Flags: `--json` (full report to stdout), `--json-out <path>`, `--top <n>`, `--no-color`.

## Architecture

Collectors turn Docker facts into a **normalized model**; rules read **only the model**
and know nothing about Docker. Docker's quirks stay quarantined in `collect/`; every
rule is a pure function testable against a fixture model.

```
dexplain.mjs                 entry: parse args → dispatch
lib/
  cli.mjs                    arg parse + command registry + output routing
  docker.mjs                 thin child_process wrapper (spawn/capture/exit codes)
  collect/
    build-run.mjs            spawn build w/ --progress=rawjson, tee the stream
    build-events.mjs         rawjson → BuildTrace
    image-inspect.mjs        docker history + docker inspect → ImageModel
    dockerfile-parse.mjs     Dockerfile text → instruction AST
    context-size.mjs         build-context size vs .dockerignore
  model/
    report.mjs               normalized Report shape + builder
    finding.mjs              Finding shape + severity ordering
  rules/
    index.mjs                rule REGISTRY + runner (filtered by rule.requires[])
    <one file per rule>
  render/
    human.mjs                terminal summary
    json.mjs                 canonical JSON report
  constants.mjs              severities, categories, thresholds, exit codes, size units
test/  (+ fixtures/ captured from real builds)
```

### Extensibility contract

Each rule is a module exporting:

```js
{
  id: 'cache-invalidation',
  category: CATEGORY.CACHE,
  severity: SEVERITY.HIGH,          // default; a rule may downgrade per finding
  requires: [INPUT.DOCKERFILE],     // which model parts it needs
  evaluate(model, thresholds) => Finding[]
}
```

The runner runs only rules whose `requires` are all present in the model, so the same
registry serves `dockerfile` (AST only), `image` (image only), and `build` (everything).
Adding a rule = drop a module + register it. No magic values: thresholds, severities,
categories, exit codes all live in `constants.mjs`.

## Normalized model

- **BuildTrace**: `{ steps: Step[], totalDurationMs, cachedCount, buildStepCount }`
  where `Step = { index, stageTotal, name, instruction, command, digest, durationMs,
  cached, internal, error? }`. Built by accumulating rawjson vertexes by digest.
- **ImageModel**: `{ ref, totalBytes, architecture, layers: Layer[], config }` where
  `Layer = { index, createdBy, instruction, bytes, empty }`, from `docker history`
  (human sizes parsed base-1000) + `docker inspect`.
- **DockerfileAst**: `{ path, instructions: Instruction[], stages: Stage[] }` where
  `Instruction = { line, keyword, args, raw, stageIndex }`.
- **Finding**: `{ ruleId, category, severity, title, detail, evidence, location,
  suggestedFix, estimatedImpact }`. Ranked by severity then impact.

## v1 rules

| id | requires | flags |
|----|----------|-------|
| cache-invalidation | dockerfile | source `COPY .`/`ADD` before an install `RUN` |
| missing-cache-mount | dockerfile | package-manager `RUN` without `--mount=type=cache` |
| no-multistage | dockerfile | single stage that both builds and ships |
| apt-antipattern | dockerfile | `apt-get update`/`install` split, or no cache clean |
| slow-step | buildTrace | step over a share of total build wall-time |
| uncached-expensive-step | buildTrace | cacheable-looking step that missed cache |
| fat-layer | image | layer over a byte threshold |
| dev-deps-in-final | image | build caches / dev deps shipped in final image |
| context-bloat | context | large build context / missing `.dockerignore` |

## Output

Default: ranked, severity-colored human summary grouped by category, with a footer
(total build time, cache ratio, image size, top fixes) and a hint to use `--json`.
`--json`: the full normalized Report — the machine-readable artifact Claude reasons over.

## Error handling

- Docker missing / daemon down → fail-closed message, nonzero exit.
- BuildKit disabled → detect, instruct `DOCKER_BUILDKIT=1`, or degrade with a warning.
- Build fails → emit the partial trace up to the failing step + surface the error.
- Optional signals (`docker buildx du`) absent → skip, not an error.

## Testing

`node:test`. Parsers tested against committed real fixtures (captured rawjson +
`docker history` + `inspect`). Rules tested as pure functions against fixture models.
Renderers snapshot-tested. One optional live integration build, skipped without Docker.
