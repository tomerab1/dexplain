# dexplain

[![test](https://github.com/tomerab1/dexplain/actions/workflows/test.yml/badge.svg)](https://github.com/tomerab1/dexplain/actions/workflows/test.yml)

**`EXPLAIN` for Docker builds and images.**

![dexplain build demo: live step progress, then ranked findings across security, cache, build-time, image-size, and dockerfile categories](https://raw.githubusercontent.com/tomerab1/dexplain/main/docs/demo.gif)

`dexplain` is to a slow `docker build` what `EXPLAIN` is to a slow SQL query: it turns the
build into structured facts and a ranked list of findings, so the bottleneck is obvious
and the fix is concrete. It wraps your build (or ingests a log / an existing image / a
Dockerfile), collects per-step timing, cache hit/miss, and layer sizes, runs a
deterministic rule engine, and prints a summary — plus a machine-readable JSON report you
can hand to an LLM to reason over.

Pure Node, zero dependencies, read-only. No `dive`/`hadolint`/`trivy` required — it works
off built-in Docker commands.

## Why

Docker has no query planner that tells you "this step is the bottleneck, here's why."
The signals exist — BuildKit's `--progress=rawjson` stream, `docker history`,
`docker inspect` — but they're scattered and unstructured. `dexplain` unifies them into
one normalized report and applies rules for the well-known slow patterns (cache-busting
layer order, missing cache mounts, single-stage builds that ship the toolchain, fat
layers, oversized build context).

## Install

Requires **Node ≥ 20.11** and **Docker** (with BuildKit, the default on modern Docker).

```bash
npm install -g @tomerab1/dexplain
dexplain --help
```

Or straight from source (zero dependencies):

```bash
git clone https://github.com/tomerab1/dexplain.git
cd dexplain
node dexplain.mjs --help
# optional: make `dexplain` available on your PATH
npm link
```

## Usage

```bash
dexplain build [docker build args...]   # run the build (rawjson) + analyze build & image
dexplain analyze <build-log.ndjson>     # ingest a previously captured rawjson stream
dexplain image <name:tag>               # analyze an existing image's layers/size
dexplain dockerfile [path]              # static-only analysis of a Dockerfile
```

Flags: `--json` (full report to stdout), `--json-out <path>`, `--image <ref>` (with
`analyze`), `--top <n>`, `--fail-on <sev>` (CI gate), `--no-color`.

### Example

```
$ dexplain build -t myapp .
dexplain build · built in 186.4s · cache 0/18 steps · image 3.6GB

  CACHE
  ● medium missing-cache-mount  Dockerfile:16
      npm install has no build cache mount
      → Add `RUN --mount=type=cache,target=/root/.npm` to persist the npm cache across builds.

  IMAGE SIZE
  ● high   fat-layer  layer 18
      Layer 18 adds 2.0GB
      → Shrink what this layer adds: clean caches in the same RUN, copy fewer files, or move the artifact out of the final stage.
  ● medium no-multistage  Dockerfile:1
      Single-stage build ships the build toolchain
      → Split into a build stage that compiles and a slim runtime stage that copies only the built output with `COPY --from=build`.

  ... run with --json for the full machine-readable report
```

### Capturing a build log for `analyze`

```bash
DOCKER_BUILDKIT=1 docker build --progress=rawjson -t myapp . 2> build.ndjson
dexplain analyze build.ndjson
```

### Using it with an LLM

Run any command with `--json` (or `--json-out report.json`) and hand the report to your
assistant. Each finding carries `ruleId`, `severity`, `location`, `evidence`,
`suggestedFix`, and a best-effort `estimatedImpact`. The tool reports *facts*; the model
decides which fixes are worth it given intent — the same division of labour as reading a
query plan and choosing an index.

## What it checks

| Rule | Category | Flags |
|------|----------|-------|
| `cache-invalidation` | cache | `COPY . .` before a dependency install, busting the install cache |
| `missing-cache-mount` | cache | a package-manager `RUN` without a cache mount (npm/yarn/pnpm/pip/uv/poetry/apt/apk/go/cargo/composer/bundler/gradle/maven) |
| `slow-step` | build-time | a step that dominates build wall-time |
| `uncached-expensive-step` | cache | an expensive `RUN` that missed cache this build |
| `slow-export` | build-time | the image-export phase dominating the build — the tell of a fat final image |
| `no-multistage` | image-size | a single stage that both builds and ships |
| `fat-layer` | image-size | a layer over a size threshold |
| `dev-deps-in-final` | image-size | build/dev artifacts shipped in the final image |
| `apt-antipattern` | image-size | split `apt-get update`/`install`, lists not cleaned, or recommends pulled in |
| `yum-dnf-antipattern` | image-size | yum/dnf/microdnf installs leaving package cache in the layer |
| `context-bloat` | context | oversized build context / missing `.dockerignore` |
| `unpinned-base-image` | dockerfile | `FROM` without a tag, or `:latest` |
| `root-user` | security | final stage runs as root (no `USER`, or explicit `USER root`) |
| `secret-in-env-arg` | security | secret-looking `ENV`/`ARG` names or hardcoded AWS keys baked into the image |
| `add-instead-of-copy` | dockerfile | `ADD` used for plain local files where `COPY` suffices |
| `duplicate-lifecycle-instruction` | dockerfile | shadowed `CMD`/`ENTRYPOINT`/`HEALTHCHECK` (only the last one wins) |
| `workdir-hygiene` | dockerfile | `RUN cd …` instead of `WORKDIR`, or a relative `WORKDIR` |
| `maintainer-deprecated` | dockerfile | the deprecated `MAINTAINER` instruction |

## Correctness of suggested fixes

`dexplain` **never edits your Dockerfile** — it reports findings; you (or your assistant)
apply them. Because some fixes can change behavior, every finding carries a `fixRisk`
grade, shown as a ⚠ caution in the summary and as a field in the JSON:

- **low** — cache/metadata only (cache mounts, `.dockerignore`, cleaning package lists,
  deleting a shadowed `CMD`): safe to apply mechanically.
- **medium** — changes layer contents in bounded ways (pinning a base tag, merging
  `update`/`install`): rebuild and confirm the build still passes.
- **high** — can change what the image does at runtime (reordering `COPY` before an
  install changes which files postinstall scripts see; `--no-install-recommends` can drop
  packages you implicitly relied on; switching off root changes file permissions): apply,
  rebuild, and run your smoke tests before trusting it.

## How it works

Collectors turn Docker's output into a normalized model; rules read **only** the model
and know nothing about Docker, so they are pure functions you test against fixtures. Rules
live in a registry and each declares the model parts it needs (`dockerfile`,
`buildTrace`, `image`, `context`), so the runner runs only the applicable ones per
command. Adding a rule is: drop a module in `lib/rules/` and list it in
`lib/rules/index.mjs`. Thresholds, severities, and categories live in `lib/constants.mjs`.

Scope today is **build + image**. Runtime analysis (container CPU/memory/IO) is a planned
v2. See [`docs/DESIGN.md`](docs/DESIGN.md).

## Tests

```bash
node --test
```

Parsers are tested against **real captured fixtures** (BuildKit rawjson + `docker history`
+ `docker inspect`); rules are tested as pure functions against fixture models.

## Requirements & notes

- BuildKit emits the rawjson status stream on **stderr**; `dexplain build` captures it.
- Image total is computed as the **sum of layer sizes** (what `docker images` reports),
  which stays consistent with the per-layer findings.
- `docker buildx history` is not required (and isn't in older buildx); everything comes
  from `docker build`, `docker history`, and `docker inspect`.

## License

MIT — see [LICENSE](LICENSE).

---

Also usable as a [Claude Code](https://claude.com/claude-code) skill: the repo ships a
`SKILL.md`, so dropping it in `~/.claude/skills/` exposes it to the assistant directly.
