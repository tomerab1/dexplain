---
name: dexplain
description: EXPLAIN for Docker builds and images. Wraps `docker build` (or ingests a rawjson log / existing image / Dockerfile), collects per-step timing, cache hit/miss, and layer sizes, runs an 18-rule deterministic engine (cache, build-time, image-size, security — root user, secrets in ENV/ARG — and Dockerfile hygiene), and emits ranked findings with fixRisk grades plus a machine-readable JSON report for Claude to reason over. Use to answer "why is this Docker build slow / this image fat / this layer huge", "is this Dockerfile safe/well-written", find cache-busting antipatterns, or gate CI with --fail-on. Pure-Node, read-only, no external tools required.
---

# dexplain

`dexplain` is the Docker analogue of `mongo explain()`: it turns a build/image into
structured facts and ranked findings, then Claude reasons over the JSON to prescribe
fixes (reorder layers, add a cache mount, go multi-stage) — the same loop as reading a
query plan and adding an index.

Entry point: `node ~/.claude/skills/dexplain/dexplain.mjs <command>`.

## Commands

```
dexplain build [docker build args...]   # run the build (rawjson) + analyze build & image
dexplain analyze <build-log.ndjson>     # ingest a previously captured rawjson stream
dexplain image <name:tag>               # analyze an existing image's layers/size
dexplain dockerfile [path]              # static-only analysis of a Dockerfile
```

Flags: `--json` (full report to stdout), `--json-out <path>`, `--image <ref>` (analyze),
`--top <n>`, `--fail-on <sev>` (CI gate), `--no-color`.

## How to use it with Claude

1. Run the relevant command with `--json` (or `--json-out report.json`).
2. Hand the JSON to Claude. Each finding carries `ruleId`, `severity`, `location`,
   `evidence`, `suggestedFix`, a best-effort `estimatedImpact`, and `fixRisk`
   (low/medium/high — how likely the fix is to change build/runtime behavior).
3. Claude weighs which fixes are worth it given intent and risk, proposes the concrete
   Dockerfile edits, and for high-risk fixes should rebuild and verify behavior.

Capture a build log for later analysis with:
`DOCKER_BUILDKIT=1 docker build --progress=rawjson -t app . 2> build.ndjson`

## What it checks (18 rules)

Build/cache: cache-invalidation (`COPY . .` before install), missing cache mount
(npm/yarn/pnpm/pip/apt/apk/go), slow steps, uncached expensive steps, slow image export
(fat-image tell). Image: fat layers, dev/build artifacts in the final image, single-stage
builds that ship the toolchain, apt/yum/dnf hygiene. Security: root user in the final
stage, secrets in ENV/ARG. Dockerfile: unpinned base images, ADD-vs-COPY, shadowed
CMD/ENTRYPOINT/HEALTHCHECK, cd-in-RUN / relative WORKDIR, deprecated MAINTAINER.
Context: oversized build context / missing `.dockerignore`.

Every finding carries `fixRisk` (low/medium/high) — how likely applying the suggested fix
is to change behavior. dexplain never edits the Dockerfile; treat high-risk fixes as
"apply, rebuild, run smoke tests".

## Design

Collectors turn Docker facts into a normalized model; rules read only the model and are
pure, registry-based functions (add one by dropping a file in `lib/rules/` and listing
it in `lib/rules/index.mjs`). Thresholds/severities/categories live in `lib/constants.mjs`.
Scope is build + image; runtime (container CPU/mem/IO) is a planned v2. See
`docs/DESIGN.md`.

## Tests

`cd ~/.claude/skills/dexplain && node --test`. Parsers are tested against real captured
fixtures (rawjson + `docker history` + `inspect`); rules are tested as pure functions.
