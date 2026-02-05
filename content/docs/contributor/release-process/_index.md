---
title: "Release Process"
weight: 4
description: "How ThunderDB versions, builds, packages, and publishes releases -- covering version numbering, release checklists, binary builds, Docker images, Debian packages, changelogs, and post-release verification."
---

# Release Process

This guide documents the end-to-end release process for ThunderDB. It covers version numbering conventions, the release checklist, building release artifacts, changelog management, and post-release verification.

## Version Numbering

ThunderDB follows [Semantic Versioning 2.0.0](https://semver.org/) (SemVer):

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
```

| Component | When to Increment | Example |
|-----------|-------------------|---------|
| **MAJOR** | Breaking changes to the public API, wire protocol incompatibilities, data format changes requiring migration | `1.0.0` -> `2.0.0` |
| **MINOR** | New features, new SQL functions, new API endpoints, new configuration options (backward compatible) | `1.2.0` -> `1.3.0` |
| **PATCH** | Bug fixes, performance improvements, documentation updates (backward compatible, no new features) | `1.2.3` -> `1.2.4` |

### Pre-Release Versions

Pre-release versions are used for testing before a stable release:

| Tag | Purpose | Example |
|-----|---------|---------|
| `-alpha.N` | Early development, API may change significantly | `1.3.0-alpha.1` |
| `-beta.N` | Feature-complete, testing and stabilization | `1.3.0-beta.1` |
| `-rc.N` | Release candidate, final validation | `1.3.0-rc.1` |

### Compatibility Guarantees

- **Wire protocol compatibility:** PostgreSQL, MySQL, and Redis wire protocol compatibility is maintained across MINOR versions. Breaking protocol changes require a MAJOR version bump.
- **Data format compatibility:** On-disk data format changes that require migration are only allowed in MAJOR versions. Minor versions must be able to read data written by previous minor versions of the same major version.
- **Configuration compatibility:** New configuration options may be added in MINOR versions with sensible defaults. Removing or renaming configuration options requires a MAJOR version bump with a migration guide.
- **Client library compatibility:** The `thunder-client` crate follows the same versioning as the server. Client version `X.Y.*` is compatible with server version `X.Y.*`.

## Release Checklist

The following checklist must be completed for every release. Each step is detailed in the sections below.

### Pre-Release

- [ ] All CI checks pass on the `main` branch
- [ ] All planned features for this release are merged
- [ ] All known release-blocking bugs are fixed
- [ ] Version numbers are updated in all `Cargo.toml` files
- [ ] `CHANGELOG.md` is updated with all changes since the last release
- [ ] Release notes are drafted
- [ ] Documentation is updated for new features and changes
- [ ] Upgrade/migration guide is written (for MAJOR versions)
- [ ] Performance benchmarks show no unexpected regressions

### Build and Test

- [ ] Release binary builds successfully: `cargo build --release`
- [ ] Full test suite passes against the release binary
- [ ] ACID compliance tests pass
- [ ] Chaos tests pass
- [ ] Load tests meet minimum performance thresholds
- [ ] Docker image builds successfully
- [ ] Docker image smoke test passes
- [ ] Debian package builds successfully (if applicable)
- [ ] Cross-platform builds succeed (Linux x86_64, Linux aarch64, macOS x86_64, macOS aarch64)

### Release

- [ ] Git tag is created and pushed
- [ ] Release artifacts are uploaded to GitHub Releases
- [ ] Docker image is pushed to container registry
- [ ] Debian package is published to package repository (if applicable)
- [ ] Crates are published to crates.io (if applicable)
- [ ] Release announcement is published

### Post-Release

- [ ] Download and verify release artifacts
- [ ] Smoke test release artifacts on a clean machine
- [ ] Verify Docker image works with `docker run`
- [ ] Monitor issue tracker for release-related bug reports
- [ ] Update version numbers on `main` to next development version

## Updating Version Numbers

Version numbers must be updated in all `Cargo.toml` files in the workspace. Use a script or do it manually:

```bash
# The version update script updates all Cargo.toml files consistently
./scripts/bump-version.sh 1.3.0

# Or manually update each Cargo.toml:
# 1. Root Cargo.toml (workspace.package.version)
# 2. Each crate's Cargo.toml (package.version)
# 3. Inter-crate dependency versions
```

### Files to Update

| File | Field |
|------|-------|
| `Cargo.toml` (root) | `workspace.package.version` |
| `thunder-common/Cargo.toml` | `package.version` |
| `thunder-storage/Cargo.toml` | `package.version`, dependency versions |
| `thunder-txn/Cargo.toml` | `package.version`, dependency versions |
| `thunder-sql/Cargo.toml` | `package.version`, dependency versions |
| `thunder-query/Cargo.toml` | `package.version`, dependency versions |
| `thunder-cluster/Cargo.toml` | `package.version`, dependency versions |
| `thunder-protocol/Cargo.toml` | `package.version`, dependency versions |
| `thunder-vector/Cargo.toml` | `package.version`, dependency versions |
| `thunder-api/Cargo.toml` | `package.version`, dependency versions |
| `thunder-cdc/Cargo.toml` | `package.version`, dependency versions |
| `thunder-fdw/Cargo.toml` | `package.version`, dependency versions |
| `thunder-server/Cargo.toml` | `package.version`, dependency versions |
| `thunder-client/Cargo.toml` | `package.version`, dependency versions |

After updating, verify that the workspace builds:

```bash
cargo build --release
cargo test
```

## Building Release Binaries

### Standard Release Build

```bash
cargo build --release
```

This produces the `thunder-server` binary at `target/release/thunder-server` with the release profile settings:

| Setting | Value | Effect |
|---------|-------|--------|
| `opt-level` | `3` | Maximum optimization for best runtime performance |
| `lto` | `"thin"` | Thin link-time optimization enables cross-crate inlining |
| `codegen-units` | `1` | Single codegen unit allows maximum LLVM optimization |
| `panic` | `"abort"` | Abort on panic produces smaller binaries with no unwinding overhead |

### Cross-Platform Builds

ThunderDB supports the following target platforms:

| Platform | Target Triple | Build Command |
|----------|--------------|---------------|
| Linux x86_64 | `x86_64-unknown-linux-gnu` | `cargo build --release --target x86_64-unknown-linux-gnu` |
| Linux aarch64 | `aarch64-unknown-linux-gnu` | `cross build --release --target aarch64-unknown-linux-gnu` |
| macOS x86_64 | `x86_64-apple-darwin` | `cargo build --release --target x86_64-apple-darwin` |
| macOS aarch64 | `aarch64-apple-darwin` | `cargo build --release --target aarch64-apple-darwin` |

For cross-compilation, use the [cross](https://github.com/cross-rs/cross) tool:

```bash
# Install cross
cargo install cross

# Build for Linux aarch64 from a Linux x86_64 or macOS host
cross build --release --target aarch64-unknown-linux-gnu
```

### Static Linking (Linux)

For maximum portability on Linux, build a statically linked binary using musl:

```bash
# Add the musl target
rustup target add x86_64-unknown-linux-musl

# Build statically linked binary
cargo build --release --target x86_64-unknown-linux-musl
```

The resulting binary has no dynamic library dependencies and runs on any Linux distribution.

### Release Binary Verification

After building, verify the release binary:

```bash
# Check the binary exists and is the expected type
file target/release/thunder-server

# Check the binary size (should be 30-80MB depending on features)
ls -lh target/release/thunder-server

# Verify the version string is correct
./target/release/thunder-server --version

# Run a quick smoke test
./target/release/thunder-server --config config/test.toml &
sleep 2
curl http://localhost:8080/api/v1/health
kill %1

# Strip debug symbols for smaller production binary (optional)
strip target/release/thunder-server
```

## Building Docker Images

### Production Docker Image

```bash
# Build the production image
docker build -t thunderdb:1.3.0 .

# Also tag as latest
docker tag thunderdb:1.3.0 thunderdb:latest
```

The `Dockerfile` uses a multi-stage build for minimal image size:

```dockerfile
# Stage 1: Build
FROM rust:1.75 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/thunder-server /usr/local/bin/
COPY config/prod.toml /etc/thunderdb/config.toml

EXPOSE 5432 3306 6379 8080 50051 8081 8082 9090

ENTRYPOINT ["thunder-server"]
CMD ["--config", "/etc/thunderdb/config.toml"]
```

### Docker Image Verification

```bash
# Verify the image was built correctly
docker images thunderdb:1.3.0

# Run a smoke test
docker run -d --name thunder-test -p 5432:5432 -p 8080:8080 thunderdb:1.3.0
sleep 3

# Health check
curl http://localhost:8080/api/v1/health

# Connect with psql
psql -h localhost -p 5432 -U admin -d thunderdb -c "SELECT version();"

# Clean up
docker stop thunder-test && docker rm thunder-test
```

### Pushing to Container Registry

```bash
# Tag for registry
docker tag thunderdb:1.3.0 ghcr.io/thunderdb/thunderdb:1.3.0
docker tag thunderdb:1.3.0 ghcr.io/thunderdb/thunderdb:latest

# Push
docker push ghcr.io/thunderdb/thunderdb:1.3.0
docker push ghcr.io/thunderdb/thunderdb:latest
```

### Multi-Architecture Docker Images

For ARM64 support (Apple Silicon, AWS Graviton, etc.):

```bash
# Create a multi-architecture builder
docker buildx create --name thunder-builder --use

# Build and push multi-arch image
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t ghcr.io/thunderdb/thunderdb:1.3.0 \
    -t ghcr.io/thunderdb/thunderdb:latest \
    --push .
```

## Building Debian Packages

### Using the Build Script

```bash
./scripts/build-deb.sh
```

This script:
1. Builds the release binary
2. Creates the Debian package directory structure
3. Writes the control file with package metadata
4. Includes the binary, default configuration, systemd service file, and man pages
5. Runs `dpkg-deb` to produce the `.deb` file

### Package Contents

The Debian package installs the following files:

| Path | Content |
|------|---------|
| `/usr/bin/thunder-server` | Server binary |
| `/etc/thunderdb/config.toml` | Default configuration file |
| `/lib/systemd/system/thunderdb.service` | systemd service unit |
| `/var/lib/thunderdb/` | Data directory (created on install) |
| `/var/log/thunderdb/` | Log directory (created on install) |
| `/usr/share/man/man1/thunder-server.1.gz` | Man page |

### Package Metadata

```
Package: thunderdb
Version: 1.3.0
Architecture: amd64
Maintainer: ThunderDB Team <team@thunderdb.io>
Description: ThunderDB - Distributed HTAP Database
 A high-performance distributed database that unifies transactional
 and analytical workloads with multi-protocol support.
Depends: libc6 (>= 2.31), libssl3
```

### Installing the Package

```bash
# Install
sudo dpkg -i thunderdb_1.3.0_amd64.deb

# Start the service
sudo systemctl start thunderdb
sudo systemctl enable thunderdb

# Check status
sudo systemctl status thunderdb

# View logs
sudo journalctl -u thunderdb -f
```

### Verifying the Package

```bash
# List package contents
dpkg -c thunderdb_1.3.0_amd64.deb

# Verify package metadata
dpkg -I thunderdb_1.3.0_amd64.deb

# Install and verify
sudo dpkg -i thunderdb_1.3.0_amd64.deb
thunder-server --version
```

## Changelog Management

ThunderDB maintains a `CHANGELOG.md` file in the repository root following the [Keep a Changelog](https://keepachangelog.com/) format.

### Changelog Format

```markdown
# Changelog

All notable changes to ThunderDB are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Vector search support with HNSW and IVF indexes (#234)
- GraphQL API endpoint (#256)

### Changed
- Improved B+Tree prefix compression reduces index size by 15% (#245)

### Fixed
- Fixed deadlock in concurrent DDL operations (#267)

## [1.2.0] - 2025-12-15

### Added
- MySQL wire protocol support (#189)
- Change Data Capture (CDC) with Kafka output (#195)
- WebSocket API for live query subscriptions (#201)

### Changed
- Upgraded Tokio runtime to 1.35 (#210)
- WAL group commit batch size is now configurable (#215)

### Fixed
- Fixed memory leak in buffer pool eviction under high concurrency (#220)
- Fixed incorrect NULL handling in outer joins (#225)

### Security
- Fixed timing side-channel in password authentication (#230)

## [1.1.0] - 2025-09-01
...
```

### Changelog Categories

| Category | Description |
|----------|-------------|
| **Added** | New features |
| **Changed** | Changes to existing functionality |
| **Deprecated** | Features that will be removed in a future version |
| **Removed** | Features removed in this version |
| **Fixed** | Bug fixes |
| **Security** | Security-related fixes |

### Updating the Changelog

When preparing a release:

1. Review all merged pull requests since the last release:
   ```bash
   git log v1.2.0..HEAD --oneline --merges
   ```

2. Categorize each change into the appropriate changelog section.

3. Move items from `[Unreleased]` to the new version section with the release date.

4. Include issue/PR numbers for each entry for traceability.

## Git Tagging

### Creating a Release Tag

```bash
# Ensure you are on the main branch and it is up to date
git checkout main
git pull origin main

# Verify all tests pass
cargo test

# Create an annotated tag
git tag -a v1.3.0 -m "ThunderDB v1.3.0

Highlights:
- Vector search support with HNSW indexes
- GraphQL API endpoint
- 15% reduction in index size through improved prefix compression

See CHANGELOG.md for the complete list of changes."

# Push the tag
git push origin v1.3.0
```

### Tag Naming Convention

Tags follow the format `v{MAJOR}.{MINOR}.{PATCH}[-PRERELEASE]`:
- `v1.3.0` -- Stable release
- `v1.3.0-alpha.1` -- Alpha pre-release
- `v1.3.0-beta.1` -- Beta pre-release
- `v1.3.0-rc.1` -- Release candidate

### Listing Tags

```bash
# List all tags
git tag -l

# List tags matching a pattern
git tag -l 'v1.3.*'

# Show tag details
git show v1.3.0
```

## Release Notes

Release notes are published on GitHub Releases and provide a user-friendly summary of the release.

### Release Notes Structure

```markdown
# ThunderDB v1.3.0

**Release date:** 2026-01-15

## Highlights

- **Vector Search:** ThunderDB now supports vector similarity search with
  HNSW and IVF indexes, enabling AI/ML workloads directly in the database.
- **GraphQL API:** A new GraphQL endpoint auto-generates a schema from your
  database tables, supporting queries, mutations, and subscriptions.
- **Smaller Indexes:** Improved B+Tree prefix compression reduces index storage
  by approximately 15%.

## What's New

### Vector Search (#234)

Store and search high-dimensional vectors directly in ThunderDB:

```sql
CREATE TABLE embeddings (
    id INT PRIMARY KEY,
    content TEXT,
    embedding VECTOR(1536)
);

CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);

SELECT * FROM embeddings
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

### GraphQL API (#256)

Access your data through a fully-featured GraphQL endpoint at `/graphql`:

```graphql
query {
  users(where: { age: { gt: 21 } }, limit: 10) {
    id
    name
    email
  }
}
```

## Breaking Changes

None in this release.

## Upgrade Guide

This is a backward-compatible release. Simply replace the binary and restart:

```bash
sudo systemctl stop thunderdb
sudo dpkg -i thunderdb_1.3.0_amd64.deb
sudo systemctl start thunderdb
```

## Download

| Platform | Architecture | Download |
|----------|-------------|----------|
| Linux | x86_64 | [thunderdb-1.3.0-linux-amd64.tar.gz](link) |
| Linux | aarch64 | [thunderdb-1.3.0-linux-arm64.tar.gz](link) |
| macOS | x86_64 | [thunderdb-1.3.0-darwin-amd64.tar.gz](link) |
| macOS | aarch64 | [thunderdb-1.3.0-darwin-arm64.tar.gz](link) |
| Docker | multi-arch | `docker pull ghcr.io/thunderdb/thunderdb:1.3.0` |
| Debian | amd64 | [thunderdb_1.3.0_amd64.deb](link) |

## Checksums

```
sha256  abc123...  thunderdb-1.3.0-linux-amd64.tar.gz
sha256  def456...  thunderdb-1.3.0-linux-arm64.tar.gz
sha256  ghi789...  thunderdb-1.3.0-darwin-amd64.tar.gz
sha256  jkl012...  thunderdb-1.3.0-darwin-arm64.tar.gz
sha256  mno345...  thunderdb_1.3.0_amd64.deb
```

## Full Changelog

See [CHANGELOG.md](link) for the complete list of changes.
```

### Creating a GitHub Release

```bash
# Create a GitHub release from the tag
gh release create v1.3.0 \
    --title "ThunderDB v1.3.0" \
    --notes-file release-notes-1.3.0.md \
    target/release-artifacts/thunderdb-1.3.0-linux-amd64.tar.gz \
    target/release-artifacts/thunderdb-1.3.0-linux-arm64.tar.gz \
    target/release-artifacts/thunderdb-1.3.0-darwin-amd64.tar.gz \
    target/release-artifacts/thunderdb-1.3.0-darwin-arm64.tar.gz \
    target/release-artifacts/thunderdb_1.3.0_amd64.deb \
    target/release-artifacts/SHA256SUMS

# For pre-release versions
gh release create v1.3.0-beta.1 \
    --title "ThunderDB v1.3.0-beta.1" \
    --prerelease \
    --notes-file release-notes-1.3.0-beta.1.md \
    target/release-artifacts/*
```

## Publishing Crates

If ThunderDB publishes individual crates to [crates.io](https://crates.io/), they must be published in dependency order (leaf crates first):

```bash
# 1. Publish the leaf crate first
cargo publish -p thunder-common

# 2. Publish crates that depend only on thunder-common
cargo publish -p thunder-storage
cargo publish -p thunder-sql
cargo publish -p thunder-client

# 3. Continue up the dependency graph
cargo publish -p thunder-txn
cargo publish -p thunder-cluster
cargo publish -p thunder-cdc
cargo publish -p thunder-vector
cargo publish -p thunder-fdw

# 4. Publish crates with many dependencies
cargo publish -p thunder-query
cargo publish -p thunder-protocol
cargo publish -p thunder-api

# 5. Publish the top-level binary last
cargo publish -p thunder-server
```

### Pre-Publish Verification

Before publishing to crates.io:

```bash
# Dry run: verify the crate can be packaged
cargo publish -p thunder-common --dry-run

# Check what files will be included in the package
cargo package -p thunder-common --list
```

### Important Notes

- Once published to crates.io, a version **cannot be unpublished** (only yanked).
- Ensure all `Cargo.toml` metadata is correct: `license`, `repository`, `description`, `readme`, `keywords`, `categories`.
- All public APIs should have documentation (`///` doc comments).
- Run `cargo doc --no-deps` to verify documentation builds without warnings.

## Release Automation

The release process is partially automated through GitHub Actions:

### Release Workflow (`.github/workflows/release.yml`)

Triggered when a tag matching `v*` is pushed:

```
v* tag pushed
    |
    +-- Build release binaries (parallel matrix)
    |       +-- Linux x86_64
    |       +-- Linux aarch64
    |       +-- macOS x86_64
    |       +-- macOS aarch64
    |
    +-- Run full test suite against release binaries
    |
    +-- Build Docker image (multi-arch)
    |
    +-- Build Debian package
    |
    +-- Create GitHub Release with artifacts
    |
    +-- Push Docker image to registry
    |
    +-- Publish crates to crates.io (manual approval)
```

### Manual Steps

Even with automation, some steps require manual action:

1. **Version bump and changelog update** must be done manually before tagging.
2. **Release notes** should be reviewed and edited by a maintainer.
3. **crates.io publishing** requires manual approval in the CI pipeline.
4. **Release announcement** (blog post, social media, mailing list) is done manually.

## Post-Release Verification

After a release is published, verify that all artifacts work correctly:

### Binary Verification

```bash
# Download the release binary on a clean machine
curl -LO https://github.com/smetal1/thunder-db/releases/download/v1.3.0/thunderdb-1.3.0-linux-amd64.tar.gz

# Verify checksum
sha256sum -c SHA256SUMS

# Extract and run
tar xzf thunderdb-1.3.0-linux-amd64.tar.gz
./thunder-server --version
./thunder-server --config config/prod.toml &

# Verify health
curl http://localhost:8080/api/v1/health

# Run basic queries
psql -h localhost -p 5432 -U admin -d thunderdb -c "
    CREATE TABLE test (id INT PRIMARY KEY, name TEXT);
    INSERT INTO test VALUES (1, 'hello');
    SELECT * FROM test;
    DROP TABLE test;
"
```

### Docker Verification

```bash
# Pull and run the released Docker image
docker pull ghcr.io/thunderdb/thunderdb:1.3.0
docker run -d --name thunder-verify -p 5432:5432 ghcr.io/thunderdb/thunderdb:1.3.0

# Verify
docker logs thunder-verify
psql -h localhost -p 5432 -U admin -d thunderdb -c "SELECT version();"

# Clean up
docker stop thunder-verify && docker rm thunder-verify
```

### Debian Package Verification

```bash
# Install on a clean Ubuntu/Debian system
sudo dpkg -i thunderdb_1.3.0_amd64.deb

# Verify service starts
sudo systemctl start thunderdb
sudo systemctl status thunderdb

# Verify connectivity
psql -h localhost -p 5432 -U admin -d thunderdb -c "SELECT version();"

# Uninstall
sudo dpkg -r thunderdb
```

### Upgrade Path Verification

For MINOR and PATCH releases, verify the upgrade path:

```bash
# Start the previous version with data
docker run -d --name thunder-old -v thunder-data:/var/lib/thunderdb \
    ghcr.io/thunderdb/thunderdb:1.2.0

# Load test data
psql -h localhost -p 5432 -U admin -d thunderdb -c "
    CREATE TABLE upgrade_test (id INT PRIMARY KEY, data TEXT);
    INSERT INTO upgrade_test SELECT generate_series(1, 10000), 'data';
"

# Stop the old version
docker stop thunder-old && docker rm thunder-old

# Start the new version with the same data volume
docker run -d --name thunder-new -v thunder-data:/var/lib/thunderdb \
    ghcr.io/thunderdb/thunderdb:1.3.0

# Verify data is intact
psql -h localhost -p 5432 -U admin -d thunderdb -c "
    SELECT COUNT(*) FROM upgrade_test;
"
# Expected: 10000
```

## Hotfix Process

For critical bugs that need to be fixed immediately:

1. **Create a release branch** from the last release tag:
   ```bash
   git checkout -b release/1.2.1 v1.2.0
   ```

2. **Cherry-pick the fix** from `main`:
   ```bash
   git cherry-pick <commit-hash>
   ```

3. **Update version and changelog** on the release branch.

4. **Tag and release** following the standard process.

5. **Merge the release branch back to `main`** to ensure the fix is included:
   ```bash
   git checkout main
   git merge release/1.2.1
   ```

## Release Schedule

ThunderDB follows a time-based release cadence:

| Release Type | Frequency | Description |
|-------------|-----------|-------------|
| MAJOR | Annually (approximately) | Breaking changes, major new features |
| MINOR | Quarterly | New features, improvements |
| PATCH | As needed | Bug fixes, security patches |

The release schedule is approximate. Releases may be delayed if critical bugs are discovered during the release candidate phase, or accelerated for security patches.

## Roles and Responsibilities

| Role | Responsibility |
|------|---------------|
| **Release Manager** | Coordinates the release process, manages the checklist, creates the tag |
| **Build Engineer** | Builds and verifies release artifacts, manages CI/CD pipeline |
| **Documentation Lead** | Updates documentation, writes release notes |
| **QA Lead** | Runs the full test suite, performs manual verification |
| **Security Lead** | Reviews security-related changes, verifies security fixes |

The Release Manager role rotates among senior maintainers for each release.
