# Changelog

## 0.3.0 — 2026-07-18

### Added

- `dexplain diff <a> <b>` — compare two images and/or rawjson build traces:
  size and layer deltas (matched by creating instruction), findings resolved
  vs introduced, and timing deltas with cache-lost/gained transitions.
  `--fail-on` on a diff exits 5 only for *introduced* findings, closing the
  fixRisk verify loop in CI. `--trace-a`/`--trace-b` attach timing to image
  sides.
- Build timeline: a terminal Gantt after the headline for non-trivial builds
  (`--timeline` / `--no-timeline` to force) — parallel stages, cached steps,
  and the export tail made visible.
- `cache-miss-cascade` rule: names the step that broke the cache and bills it
  for every downstream rebuild it caused.
- GitHub Action: [`tomerab1/dexplain-action`](https://github.com/tomerab1/dexplain-action)
  — gate PRs with `--fail-on` and render findings into the job summary.

## 0.2.0 — 2026-07-18

Hardening release: no new rules or commands — parser correctness, context
accuracy, matcher breadth, and a real-world regression corpus.

### Fixed

- Heredocs (`RUN <<EOF`) are parsed correctly: bodies are visible to command
  rules and no longer misread as instructions (a Python script embedded in
  apache/airflow's Dockerfile previously produced five bogus
  `unpinned-base-image` findings).
- Exec-form instructions (`RUN ["npm","ci"]`) are matched by command rules via
  the new `shellText` field — previously invisible to every package-manager
  check.
- Cache-mount detection sees flags on the heredoc opener line and tolerates
  option order (`--mount=target=...,type=cache`), removing false positives on
  buildkit-style Dockerfiles.
- `.dockerignore` negation (`!`) is honored with last-match-wins semantics;
  `**` works anywhere in a pattern; symlinks and the always-uploaded
  Dockerfile/.dockerignore are counted correctly.
- Parser directives (`# escape=`, `# syntax=`) and CRLF line endings are
  handled; ONBUILD inner instructions are parsed (not yet evaluated by rules).

### Added

- Cache-mount advice for seven more package managers: cargo, composer,
  bundler, gradle (incl. `./gradlew`), maven, poetry, uv.
- Golden corpus: 12 real-world Dockerfiles (MIT/Apache/BSD, vendored with
  pinned commits and licenses in `test/corpus/NOTICE.md`) plus 2 synthetic
  fixtures, snapshot-tested so every behavior change is a reviewable diff.

## 0.1.0 — 2026-07-17

Initial release: `build` / `analyze` / `image` / `dockerfile` commands,
18-rule engine with fixRisk grading, live build progress, failure rendering,
`--fail-on` CI gate, Buildx >= 0.13 guard. Published as `@tomerab1/dexplain`.
