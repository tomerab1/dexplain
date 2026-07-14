---
name: dexplain
description: EXPLAIN for Docker builds and images. Wraps `docker build` (or ingests a rawjson log / existing image / Dockerfile), collects per-step timing, cache hit/miss, and layer sizes, runs a deterministic rule engine, and emits ranked findings plus a machine-readable JSON report for Claude to reason over. Use to answer "why is this Docker build slow / this image fat / this layer huge", find cache-busting Dockerfile antipatterns, or triage a build before optimizing. Pure-Node, read-only, no external tools required.
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
`--top <n>`, `--no-color`.

## How to use it with Claude

1. Run the relevant command with `--json` (or `--json-out report.json`).
2. Hand the JSON to Claude. Each finding carries `ruleId`, `severity`, `location`,
   `evidence`, `suggestedFix`, and a best-effort `estimatedImpact`.
3. Claude weighs which fixes are worth it given intent, and can propose the concrete
   Dockerfile edits.

Capture a build log for later analysis with:
`DOCKER_BUILDKIT=1 docker build --progress=rawjson -t app . 2> build.ndjson`

## What it checks (v1)

Build/cache: cache-invalidation (`COPY . .` before install), missing cache mount,
slow steps, uncached expensive steps. Image: fat layers, dev/build artifacts in the
final image, single-stage builds that ship the toolchain. Dockerfile: apt antipatterns.
Context: oversized build context / missing `.dockerignore`.

## Design

Collectors turn Docker facts into a normalized model; rules read only the model and are
pure, registry-based functions (add one by dropping a file in `lib/rules/` and listing
it in `lib/rules/index.mjs`). Thresholds/severities/categories live in `lib/constants.mjs`.
Scope is build + image; runtime (container CPU/mem/IO) is a planned v2. See
`docs/DESIGN.md`.

## Tests

`cd ~/.claude/skills/dexplain && node --test`. Parsers are tested against real captured
fixtures (rawjson + `docker history` + `inspect`); rules are tested as pure functions.
