---
title: "Development Setup"
weight: 1
description: "How to set up your local development environment for ThunderDB, including prerequisites, building, testing, IDE configuration, and development workflows."
---

# Development Setup

This guide walks you through setting up a complete development environment for ThunderDB. By the end, you will be able to build the project, run tests, and start a local development server.

## Prerequisites

Before you begin, ensure the following tools are installed on your system.

### Required

| Tool | Version | Purpose |
|------|---------|---------|
| **Rust** | 1.75+ (pinned in `rust-toolchain.toml`) | Compiler and standard library |
| **Cargo** | Included with Rust | Build system and package manager |
| **Git** | 2.30+ | Version control |
| **Protobuf Compiler** (`protoc`) | 3.15+ | Compiling `.proto` files for gRPC services |
| **C/C++ Compiler** | GCC 9+ or Clang 12+ | Building native dependencies (RocksDB, etc.) |
| **CMake** | 3.16+ | Build system for native dependencies |
| **pkg-config** | Any recent version | Locating system libraries |

### Optional

| Tool | Version | Purpose |
|------|---------|---------|
| **Docker** | 20.10+ | Containerized development and testing |
| **Docker Compose** | 2.0+ | Multi-container dev environment |
| **cargo-watch** | Latest | Auto-rebuild on file changes |
| **cargo-nextest** | Latest | Faster test runner |
| **cargo-tarpaulin** | Latest | Code coverage |
| **cargo-criterion** | Latest | Benchmark runner |
| **cargo-udeps** | Latest | Detect unused dependencies |

### Installing Prerequisites

**macOS (Homebrew):**
```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install system dependencies
brew install protobuf cmake pkg-config

# Optional: Docker Desktop
brew install --cask docker
```

**Ubuntu / Debian:**
```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install system dependencies
sudo apt update
sudo apt install -y protobuf-compiler libprotobuf-dev cmake pkg-config \
    build-essential libssl-dev libclang-dev

# Optional: Docker
sudo apt install -y docker.io docker-compose-v2
```

**Arch Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo pacman -S protobuf cmake pkg-config base-devel openssl clang
```

**Windows (WSL2 recommended):**
```bash
# Use WSL2 with Ubuntu, then follow the Ubuntu instructions above.
# Native Windows builds are not officially supported but may work.
```

## Cloning the Repository

```bash
# Clone the main repository
git clone https://github.com/smetal1/thunder-db.git
cd thunderdb

# The rust-toolchain.toml file will automatically configure the correct
# Rust version when you run any cargo command.
```

Verify your setup:
```bash
rustc --version    # Should show 1.75.0 or later
cargo --version    # Should match the Rust version
protoc --version   # Should show libprotoc 3.15 or later
```

## Building ThunderDB

### Debug Build

The debug build compiles quickly and includes debug symbols, but runs slower due to lack of optimizations:

```bash
cargo build
```

This builds all 14 crates in the workspace. The resulting binary is located at `target/debug/thunder-server`.

Build times for a clean debug build on typical hardware:
- Apple M2 Pro (12 cores, 32GB RAM): ~2-3 minutes
- Intel i7-12700K (12 cores, 32GB RAM): ~3-4 minutes
- GitHub Actions runner: ~5-7 minutes

### Release Build

The release build enables full optimizations as defined in the workspace `Cargo.toml`:

```bash
cargo build --release
```

The release profile is configured with:
- `opt-level = 3` -- Maximum optimization
- `lto = "thin"` -- Thin link-time optimization for better codegen with reasonable build times
- `codegen-units = 1` -- Single codegen unit for maximum optimization
- `panic = "abort"` -- Abort on panic (smaller binary, no unwinding overhead)

The resulting binary is at `target/release/thunder-server`. Release builds take significantly longer (10-20 minutes) but produce binaries suitable for benchmarking and deployment.

### Building Individual Crates

To build a specific crate without building the entire workspace:

```bash
# Build only the storage engine
cargo build -p thunder-storage

# Build only the SQL layer
cargo build -p thunder-sql

# Build only the protocol layer
cargo build -p thunder-protocol
```

This is useful during development when you are working on a single crate and want fast iteration.

### Common Build Issues

| Issue | Solution |
|-------|----------|
| `protoc` not found | Install `protobuf-compiler` or set `PROTOC` env var |
| RocksDB compilation fails | Ensure C++ compiler and CMake are installed |
| Out of memory during linking | Use `lto = "thin"` instead of `"fat"`, or increase swap |
| Linker errors on macOS | Run `xcode-select --install` to install command line tools |
| OpenSSL not found | Install `libssl-dev` (Ubuntu) or `openssl` (Homebrew) |

## Running Tests

### Full Test Suite

Run the entire test suite across all crates:

```bash
cargo test
```

Or use the project test script, which sets up any required test infrastructure:

```bash
./scripts/run_tests.sh
```

### Running Tests for a Specific Crate

```bash
# Test only the storage engine
cargo test -p thunder-storage

# Test only the transaction manager
cargo test -p thunder-txn

# Test only the query engine
cargo test -p thunder-query
```

### Running a Specific Test

```bash
# Run a test by name (partial match)
cargo test test_btree_insert

# Run a specific test in a specific crate
cargo test -p thunder-storage test_wal_recovery

# Run tests matching a pattern
cargo test -p thunder-sql parser::
```

### Using cargo-nextest (Recommended)

`cargo-nextest` provides faster test execution through better parallelism and clearer output:

```bash
# Install
cargo install cargo-nextest

# Run all tests
cargo nextest run

# Run tests for a specific crate
cargo nextest run -p thunder-storage
```

### Test Categories

ThunderDB has several categories of tests with different execution characteristics:

```bash
# Unit tests (fast, no external dependencies)
cargo test --lib

# Integration tests (may require running server)
cargo test --test '*'

# Documentation tests
cargo test --doc

# Ignored tests (long-running, require special setup)
cargo test -- --ignored
```

See the [Testing](../testing/) guide for comprehensive details.

## Running the Development Server

### Using the Dev Script

The simplest way to start a development server:

```bash
./scripts/dev.sh
```

This script:
- Builds ThunderDB in debug mode
- Starts a single-node instance with default development configuration
- Enables verbose logging
- Exposes all protocol endpoints on localhost

### Manual Start

You can also start the server directly:

```bash
# Build and run in one step
cargo run -- --config config/dev.toml

# Or run the built binary
cargo build
./target/debug/thunder-server --config config/dev.toml
```

### Default Development Ports

| Service | Port | Protocol |
|---------|------|----------|
| PostgreSQL wire protocol | 5432 | TCP |
| MySQL wire protocol | 3306 | TCP |
| Redis RESP protocol | 6379 | TCP |
| REST API | 8080 | HTTP |
| gRPC API | 50051 | HTTP/2 |
| GraphQL API | 8081 | HTTP |
| WebSocket API | 8082 | WS |
| Admin Dashboard | 9090 | HTTP |

### Connecting to the Dev Server

```bash
# PostgreSQL client
psql -h localhost -p 5432 -U admin -d thunderdb

# MySQL client
mysql -h 127.0.0.1 -P 3306 -u admin -p thunderdb

# Redis client
redis-cli -h localhost -p 6379

# REST API
curl http://localhost:8080/api/v1/health

# Admin Dashboard
open http://localhost:9090
```

## IDE Setup

### VS Code (Recommended)

VS Code with `rust-analyzer` provides the best development experience for Rust projects.

**Required Extensions:**
- **rust-analyzer** -- Rust language support (code completion, go-to-definition, inline errors, refactoring)
- **CodeLLDB** -- Debugger support for Rust

**Recommended Extensions:**
- **Even Better TOML** -- Syntax highlighting for `Cargo.toml` and other TOML files
- **Error Lens** -- Inline error display
- **crates** -- Dependency version management in `Cargo.toml`
- **GitLens** -- Enhanced Git integration

**Workspace Settings (`.vscode/settings.json`):**
```json
{
    "rust-analyzer.cargo.features": "all",
    "rust-analyzer.check.command": "clippy",
    "rust-analyzer.check.extraArgs": ["--all-targets"],
    "rust-analyzer.procMacro.enable": true,
    "rust-analyzer.cargo.buildScripts.enable": true,
    "rust-analyzer.inlayHints.parameterHints.enable": true,
    "rust-analyzer.inlayHints.typeHints.enable": true,
    "rust-analyzer.lens.run.enable": true,
    "rust-analyzer.lens.debug.enable": true,
    "editor.formatOnSave": true,
    "[rust]": {
        "editor.defaultFormatter": "rust-lang.rust-analyzer"
    }
}
```

**Debugging in VS Code:**

Create a `.vscode/launch.json` for debugging the server:
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "lldb",
            "request": "launch",
            "name": "Debug thunder-server",
            "cargo": {
                "args": ["build", "--bin=thunder-server", "--package=thunder-server"],
                "filter": {
                    "name": "thunder-server",
                    "kind": "bin"
                }
            },
            "args": ["--config", "config/dev.toml"],
            "cwd": "${workspaceFolder}"
        },
        {
            "type": "lldb",
            "request": "launch",
            "name": "Debug Unit Tests",
            "cargo": {
                "args": ["test", "--no-run", "--lib", "--package=${input:crate}"],
                "filter": {
                    "kind": "lib"
                }
            },
            "cwd": "${workspaceFolder}"
        }
    ],
    "inputs": [
        {
            "id": "crate",
            "type": "pickString",
            "description": "Select crate to debug",
            "options": [
                "thunder-common",
                "thunder-storage",
                "thunder-txn",
                "thunder-sql",
                "thunder-query",
                "thunder-protocol",
                "thunder-api",
                "thunder-server"
            ]
        }
    ]
}
```

### IntelliJ IDEA / CLion

JetBrains IDEs provide excellent Rust support through the Rust plugin.

**Setup:**
1. Install IntelliJ IDEA (Ultimate or Community) or CLion.
2. Install the **Rust** plugin from the JetBrains Marketplace.
3. Open the ThunderDB root directory as a project.
4. IntelliJ will detect the `Cargo.toml` workspace and index all crates.

**Recommended Settings:**
- Enable "Expand macros" for proc-macro support
- Set "Cargo check" to use `clippy` for enhanced linting
- Enable "External linter" with `cargo clippy`
- Configure run configurations for `thunder-server` with dev config

### Neovim

For Neovim users, the following setup provides a productive Rust development experience:
- **nvim-lspconfig** with rust-analyzer
- **nvim-cmp** for completion
- **nvim-dap** with CodeLLDB for debugging
- **rust-tools.nvim** for enhanced Rust integration

## Docker-Based Development

For contributors who prefer containerized development or need to test multi-node clusters, Docker Compose provides a complete environment.

### Starting the Dev Environment

```bash
docker-compose up
```

This starts:
- A ThunderDB build container with all prerequisites
- A three-node ThunderDB cluster for integration testing
- Supporting services (monitoring, log aggregation)

### Development Inside Docker

```bash
# Enter the build container
docker-compose exec dev bash

# Build inside the container
cargo build

# Run tests inside the container
cargo test
```

### Multi-Node Cluster Testing

```bash
# Start a three-node cluster
docker-compose --profile cluster up

# Connect to node 1
psql -h localhost -p 5432 -U admin -d thunderdb

# Connect to node 2
psql -h localhost -p 5433 -U admin -d thunderdb

# Connect to node 3
psql -h localhost -p 5434 -U admin -d thunderdb
```

## Code Formatting

ThunderDB uses `cargo fmt` with a custom `.rustfmt.toml` configuration to enforce consistent code style across the entire codebase.

### Running the Formatter

```bash
# Format all code
cargo fmt

# Check formatting without modifying files
cargo fmt -- --check
```

The `.rustfmt.toml` configuration defines the project's formatting rules. All code must be formatted before committing. The CI pipeline will reject PRs with formatting violations.

### Key Formatting Rules

- Maximum line width: 100 characters
- Use block indentation for function arguments
- Trailing commas in multi-line constructs
- Group imports by standard library, external crates, and internal crates

## Linting

ThunderDB uses `cargo clippy` for static analysis and linting.

### Running Clippy

```bash
# Run clippy on all crates
cargo clippy --all-targets --all-features

# Run clippy on a specific crate
cargo clippy -p thunder-storage

# Run clippy and treat warnings as errors (same as CI)
cargo clippy --all-targets --all-features -- -D warnings
```

Clippy warnings must be resolved before merging. If a warning is a false positive, it may be suppressed with an `#[allow(...)]` attribute and an explanatory comment.

## Pre-Commit Hooks

ThunderDB provides Git pre-commit hooks to catch common issues before they reach CI.

### Installing Hooks

```bash
# Install the pre-commit hooks
./scripts/install-hooks.sh
```

The pre-commit hook runs:
1. `cargo fmt -- --check` -- Verify formatting
2. `cargo clippy --all-targets -- -D warnings` -- Check for lint violations
3. `cargo test --lib` -- Run unit tests

If any check fails, the commit is rejected with a message explaining what needs to be fixed.

### Bypassing Hooks (Emergency Only)

In rare cases, you may need to bypass hooks:

```bash
git commit --no-verify -m "WIP: work in progress"
```

This should only be used for work-in-progress commits on feature branches. The CI pipeline enforces the same checks, so any violations will still be caught.

## Running Individual Crates

During development, you often want to work on and test a single crate in isolation:

```bash
# Build a single crate
cargo build -p thunder-storage

# Test a single crate
cargo test -p thunder-storage

# Test a single crate with output
cargo test -p thunder-storage -- --nocapture

# Run clippy on a single crate
cargo clippy -p thunder-storage

# Check a single crate (faster than build, no codegen)
cargo check -p thunder-storage

# Generate documentation for a single crate
cargo doc -p thunder-storage --open
```

### Crate Build Order

Due to the dependency graph, crates build in a specific order. The leaf crate `thunder-common` builds first, followed by crates that depend on it. Understanding this helps you predict build times when modifying specific crates:

```
thunder-common (leaf, builds first)
  |
  +-- thunder-storage
  |     +-- thunder-txn
  |     +-- thunder-cluster
  |     +-- thunder-cdc
  |
  +-- thunder-sql
  |     +-- thunder-query (also depends on storage, txn)
  |     +-- thunder-fdw
  |
  +-- thunder-protocol (depends on sql, query, txn)
  +-- thunder-vector (depends on storage)
  +-- thunder-client
  +-- thunder-api (depends on sql, query, protocol, cluster)
  +-- thunder-server (depends on all, builds last)
```

Changes to `thunder-common` trigger a rebuild of the entire workspace. Changes to `thunder-server` only require rebuilding that single crate.

## Environment Variables

ThunderDB uses several environment variables for development:

| Variable | Default | Purpose |
|----------|---------|---------|
| `THUNDER_LOG` | `info` | Log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `THUNDER_CONFIG` | `config/dev.toml` | Path to configuration file |
| `THUNDER_DATA_DIR` | `./data` | Data directory for development |
| `RUST_BACKTRACE` | `0` | Set to `1` for backtraces on panic |
| `RUST_LOG` | (unset) | Fine-grained logging control (e.g., `thunder_storage=debug`) |

## Troubleshooting

### Build Fails with "No Space Left on Device"

The `target/` directory can grow very large. Clean it periodically:
```bash
cargo clean
```

### rust-analyzer Is Slow or Consuming Too Much Memory

For large workspaces, configure rust-analyzer to check fewer targets:
```json
{
    "rust-analyzer.cargo.features": [],
    "rust-analyzer.check.extraArgs": ["--target-dir", "target/ra"]
}
```

Using a separate `target-dir` for rust-analyzer prevents it from invalidating your build cache.

### Tests Fail with "Address Already in Use"

If a previous test run did not clean up properly, ports may still be in use:
```bash
# Find processes using ThunderDB ports
lsof -i :5432 -i :3306 -i :6379 -i :8080

# Kill orphaned processes
kill $(lsof -t -i :5432)
```

### Protobuf Generation Fails

Ensure `protoc` is on your PATH and the version is 3.15+:
```bash
protoc --version
which protoc
```

If you installed protoc via Homebrew on macOS with Apple Silicon, you may need:
```bash
export PROTOC=$(which protoc)
```
