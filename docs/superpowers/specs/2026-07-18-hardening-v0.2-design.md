# dexplain v0.2 — hardening release design

**Date:** 2026-07-18
**Status:** approved (brainstormed section-by-section in session; execution via /goal)
**Theme:** close correctness gaps before adding surface. No new rules, no new commands,
no LLM-side features. Pure hardening: parser, context measurement, matcher breadth,
regression protection.

## Goals

1. A golden-file corpus of real-world Dockerfiles that locks in current behavior and
   makes every subsequent fix visible as a snapshot diff (Approach A: corpus-first).
2. Dockerfile parser correctness: heredocs, exec/JSON-form, escape directive, CRLF,
   ONBUILD (parse-only).
3. Context measurement accuracy: .dockerignore negation with last-match-wins,
   `**` anywhere, always-sent files, explicit symlink policy.
4. Matcher breadth: seven new package managers, with the flag-tolerance and
   allowlist lessons already learned applied uniformly.

## Non-goals

- No new rules, no `dexplain diff`, no compose/bake support, no runtime (v2) analysis.
- No evaluation of ONBUILD-triggered instructions by rules (parse-only this release).
- No character-class (`[a-z]`) glob support in .dockerignore — escaped to literals,
  which can only over-count; documented.
- No npm publish as part of the execution goal (0.2.0 publish is a separate,
  user-authenticated step).

## 1. Golden corpus harness

- Layout: `test/corpus/<slug>/Dockerfile` + `test/corpus/<slug>/findings.json`,
  plus `test/corpus/NOTICE.md` citing each file's source repo, pinned commit URL,
  and license. Only MIT/Apache/BSD sources.
- ~12 files chosen for pattern diversity: node/npm, node/pnpm or yarn monorepo,
  python/pip, python/poetry, go multi-stage, rust/cargo, ruby/bundler, java/gradle
  or maven, alpine/apk, debian/apt, a heredoc-using file, an exec-form-heavy file.
  The final list is recorded in NOTICE.md (curated at fetch time, licenses verified).
- Snapshot format: per corpus file, an array of
  `{ruleId, line, severity, fixRisk, title}` sorted by `(line, ruleId)`. Static rule
  path only (`parseDockerfile` + `runRules`), never Docker, no timings, no absolute
  paths — stable across machines.
- Runner: `test/corpus.test.mjs` under `node --test`; deep-equal against
  `findings.json` with a readable diff on mismatch. Snapshot update is explicit:
  `UPDATE_CORPUS=1 node --test test/corpus.test.mjs` rewrites snapshots. Zero new
  dependencies.
- Baseline discipline: the first corpus commit snapshots current behavior verbatim,
  including known-wrong output (e.g. exec-form files yielding zero findings). Each
  later phase updates only the snapshots it legitimately changes.

## 2. Parser correctness (`lib/collect/dockerfile-parse.mjs`)

- **`shellText` contract:** every instruction gains `shellText` — shell-form: same
  as `args`; exec-form: argv joined with spaces; heredoc: the heredoc body.
  Command-matching rules switch to `shellText`; structure-inspecting logic
  (COPY operands, ENV/ARG names, WORKDIR path, USER) stays on `args`.
  - Switch to `shellText`: cache-invalidation (matchPackageManager),
    missing-cache-mount (matchPackageManager + hasCacheMount), no-multistage,
    apt-antipattern, yum-dnf-antipattern, workdir-hygiene (leading-cd check only).
  - Stay on `args`: unpinned-base-image (uses stages), root-user, secret-in-env-arg,
    add-instead-of-copy, duplicate-lifecycle-instruction (keyword counts),
    workdir-hygiene (WORKDIR path check), context rules.
- **Heredocs:** `<<DELIM` / `<<-DELIM`, optionally quoted. Parser consumes raw lines
  until the delimiter line; stores `{delimiter, body}` on the instruction;
  `shellText` = body. Unterminated heredoc: body runs to EOF; the parser never
  throws. Multiple heredocs per instruction: first supported; documented limitation.
- **Exec-form:** args starting with `[` get a tolerant `JSON.parse`; success →
  `execForm: true`, `shellText` = argv.join(' '); failure → treated as shell-form
  (Docker's own fallback behavior).
- **Escape directive:** leading parser-directive comments (`# syntax=`, `# escape=`)
  are read before the first instruction; `escape=\`` switches the continuation
  character to backtick file-wide. Directives exposed on the parse result.
- **CRLF:** `\r` stripped explicitly during line splitting.
- **ONBUILD:** inner instruction parsed onto a `triggered` field
  (`{keyword, args, shellText}`); rules do NOT evaluate triggered instructions.

## 3. Context measurement (`lib/collect/dockerignore.mjs`, `context-size.mjs`)

- **Negation:** matcher compiles the full ordered pattern list into
  `{matcher, negated}` entries; decision per path is last-match-wins (the real
  dockerignore contract).
- **Pruning tiers:** a matched directory is pruned wholesale only when no negation
  pattern's path prefix could fall beneath it (cheap static prefix check);
  otherwise the walk descends and judges per file — mirroring Moby's matcher.
  With no negations present, today's fast pruning path is preserved.
- **Globs:** `**` supported anywhere in a pattern (crosses separators). Character
  classes stay escaped-to-literal (over-count-only), stated in the file header.
- **Always-sent files:** `Dockerfile` (the one in use) and `.dockerignore` counted
  unconditionally, matching what Docker uploads.
- **Symlinks:** never followed; counted as one file entry, zero bytes (Docker tars
  the link itself). Behavior documented, not accidental.

## 4. Matcher breadth (`lib/constants.mjs`)

New `PACKAGE_MANAGER_CACHE_MOUNTS` entries, every one with (a) flags tolerated
between command and subcommand and (b) allowlisted subcommands only:

| manager  | match (subcommands)              | cache target               |
|----------|----------------------------------|----------------------------|
| cargo    | build, install, fetch            | /usr/local/cargo/registry  |
| composer | install, require, update         | /root/.composer/cache      |
| bundler  | bundle install                   | /usr/local/bundle/cache    |
| gradle   | gradle / ./gradlew build, assemble, test | /root/.gradle/caches |
| maven    | mvn package, install, verify, deploy, compile, test | /root/.m2/repository |
| poetry   | poetry install                   | /root/.cache/pypoetry      |
| uv       | uv pip install, uv sync          | /root/.cache/uv            |

Fire/no-fire test pairs per entry (e.g. `cargo build` fires, `cargo test` does not;
`./gradlew build` fires, `gradle --version` does not). No rule-file changes —
`matchPackageManager` consumers inherit the breadth.

## 5. Execution plan and gates

Order (Approach A): corpus baseline → parser (+ heredoc/exec-form corpus deltas) →
rules-to-shellText switch → context accuracy → matcher breadth (+ corpus deltas) →
docs. Implementation by haiku subagents with file-disjoint scopes per wave;
orchestrator wires cross-cutting seams and runs gates.

Gates after every wave: full `node --test` green (166 existing + new), aislop scan
100/100 (the PostToolUse hook enforces per-edit; a full scan runs per wave).
Thematic batch commits, pushed per batch.

Docs at the end: README (managers, limitations), SKILL.md, new `CHANGELOG.md`
starting at 0.2.0 with a 0.1.0 backfill line. Version bumped to 0.2.0;
`npm publish` deferred to the user (passkey).
