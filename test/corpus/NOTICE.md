# Vendored Dockerfiles

This directory contains vendored Dockerfiles from permissively-licensed open-source projects, used as test fixtures for dexplain's rule engine. All sources are licensed under MIT, Apache-2.0, or BSD-2/3-Clause. Original licenses apply to the vendored content.

## next-js
- Source: https://github.com/vercel/next.js
- File: examples/with-docker/Dockerfile
- Commit: 20f58093200d0d696f61f6ab72bad59139e05c16
- License: MIT
- Raw URL: https://raw.githubusercontent.com/vercel/next.js/20f58093200d0d696f61f6ab72bad59139e05c16/examples/with-docker/Dockerfile
- Patterns: node/npm multi-stage, cache mounts, yarn/pnpm support

## gitea
- Source: https://github.com/go-gitea/gitea
- File: Dockerfile
- Commit: ba7c84673b439465289d7bf27adfde0ff25d8d94
- License: MIT
- Raw URL: https://raw.githubusercontent.com/go-gitea/gitea/ba7c84673b439465289d7bf27adfde0ff25d8d94/Dockerfile
- Patterns: go multi-stage, alpine/apk, platform-specific build, pnpm

## airflow
- Source: https://github.com/apache/airflow
- File: Dockerfile
- Commit: b628e46a2a855a5c75aeb7939ec99fc843286e2a
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/apache/airflow/b628e46a2a855a5c75aeb7939ec99fc843286e2a/Dockerfile
- Patterns: python/pip, debian/apt-heavy, large multi-stage build, pip cache, constraint files

## kafka
- Source: https://github.com/apache/kafka
- File: docker/jvm/Dockerfile
- Commit: 678c0e07e4733c5a592e52046dc2c4e1625587f1
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/apache/kafka/678c0e07e4733c5a592e52046dc2c4e1625587f1/docker/jvm/Dockerfile
- Patterns: java/jre, alpine, eclipse-temurin, multi-stage

## fastapi-template
- Source: https://github.com/tiangolo/full-stack-fastapi-template
- File: backend/Dockerfile
- Commit: 4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8
- License: MIT
- Raw URL: https://raw.githubusercontent.com/tiangolo/full-stack-fastapi-template/4d3d5e92c1ea6b3fa0fab02c41124844ec45bca8/backend/Dockerfile
- Patterns: python/uv, cache mounts, venv setup, COPY --from ghcr.io

## buildkit
- Source: https://github.com/moby/buildkit
- File: Dockerfile
- Commit: 6dd06999d5d369a217c3f3259a420f507e2db2c7
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/moby/buildkit/6dd06999d5d369a217c3f3259a420f507e2db2c7/Dockerfile
- Patterns: complex multi-stage alpine, many ARGs, conditional stages, nested COPY --from

## docker-cli
- Source: https://github.com/docker/cli
- File: Dockerfile
- Commit: 617d772fcc15c73adef8af8983339388fa60a838
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/docker/cli/617d772fcc15c73adef8af8983339388fa60a838/Dockerfile
- Patterns: go multi-stage, alpine, conditional base, platform detection

## grype
- Source: https://github.com/anchore/grype
- File: Dockerfile
- Commit: 5917fe588250b59ebe4ee2fc5ebe03b8757f0dcb
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/anchore/grype/5917fe588250b59ebe4ee2fc5ebe03b8757f0dcb/Dockerfile
- Patterns: distroless, scratch, minimal, certificates, labels

## postgres
- Source: https://github.com/docker-library/postgres
- File: 16/bookworm/Dockerfile
- Commit: 62a714f93cc32220de46fd12235c9d509e3b1ad6
- License: MIT
- Raw URL: https://raw.githubusercontent.com/docker-library/postgres/62a714f93cc32220de46fd12235c9d509e3b1ad6/16/bookworm/Dockerfile
- Patterns: debian/apt-heavy, user/group setup, gosu, entrypoint scripts

## ruby
- Source: https://github.com/docker-library/ruby
- File: 3.3/bookworm/Dockerfile
- Commit: 31475ec8e3682c1b3d3d78e222f264f564657b25
- License: BSD-2-Clause
- Raw URL: https://raw.githubusercontent.com/docker-library/ruby/31475ec8e3682c1b3d3d78e222f264f564657b25/3.3/bookworm/Dockerfile
- Patterns: ruby/bundler, debian, complex build, rustup, arc-specific conditionals

## buildx
- Source: https://github.com/docker/buildx
- File: Dockerfile
- Commit: 8035347c81e6a4de50c6f1eac318daa8444449e5
- License: Apache-2.0
- Raw URL: https://raw.githubusercontent.com/docker/buildx/8035347c81e6a4de50c6f1eac318daa8444449e5/Dockerfile
- Patterns: go multi-stage, alpine, platform-specific, many COPY --from stages

## traefik
- Source: https://github.com/traefik/traefik
- File: Dockerfile
- Commit: 14bc52dd1f1d1c08cedd1da531a527fc04d79c19
- License: MIT
- Raw URL: https://raw.githubusercontent.com/traefik/traefik/14bc52dd1f1d1c08cedd1da531a527fc04d79c19/Dockerfile
- Patterns: alpine, minimal, ca-certificates, EXPOSE, VOLUME, ENTRYPOINT

## Coverage Summary

**Pattern Coverage:**
- Node.js (npm/yarn/pnpm): ✓ next-js
- Go multi-stage: ✓ gitea, docker-cli, buildx
- Python (pip): ✓ airflow
- Python (uv): ✓ fastapi-template
- Java (JRE): ✓ kafka
- Alpine/apk-heavy: ✓ gitea, buildkit, docker-cli, buildx, traefik
- Debian/apt-heavy: ✓ airflow, postgres, ruby
- Distroless/scratch: ✓ grype
- Ruby/bundler: ✓ ruby
- Cache mounts: ✓ next-js, airflow, fastapi-template
- Multi-stage builds: ✓ all except grype and traefik
- Labels and metadata: ✓ grype

**Gaps:** No explicit heredoc (RUN <<EOF), Rust/cargo, or Java Maven/Gradle examples. These can be added in future updates.

**Notes:**
- All Dockerfiles verified with license checks via `gh api`.
- All content fetched at pinned commits (SHAs).
- Synthetic test examples (synthetic-exec-form, synthetic-heredoc) are excluded from this inventory.
