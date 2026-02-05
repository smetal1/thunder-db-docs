---
title: "Contributor Guide"
weight: 5
description: "Everything you need to know to contribute to ThunderDB development -- from setting up your environment to understanding the codebase, testing, and release processes."
---

# Contributor Guide

Welcome to the ThunderDB Contributor Guide. ThunderDB is a distributed HTAP (Hybrid Transactional/Analytical Processing) database written in Rust, comprising 14 crates and approximately 75,600 lines of code. This guide provides everything you need to start contributing effectively.

## Why Contribute to ThunderDB?

ThunderDB is building the next generation of distributed databases that unify transactional and analytical workloads under a single system. By contributing, you will:

- Work on cutting-edge distributed systems problems (consensus, distributed transactions, MVCC)
- Gain deep experience with Rust systems programming at scale
- Help shape the architecture of a modern HTAP database
- Join a community passionate about performance, correctness, and reliability

## Code of Conduct

All contributors are expected to adhere to the ThunderDB Code of Conduct. We are committed to providing a welcoming and inclusive experience for everyone. Key principles:

- **Be respectful.** Treat all community members with dignity and respect, regardless of background or experience level.
- **Be constructive.** Provide helpful feedback. Critique ideas, not people.
- **Be collaborative.** Work together toward shared goals. Help newcomers get oriented.
- **Be professional.** Harassment, discrimination, and toxic behavior will not be tolerated.

Violations of the Code of Conduct should be reported to the maintainers at `conduct@thunderdb.io`. All reports will be reviewed promptly and confidentially.

## Types of Contributions

ThunderDB welcomes contributions in many forms. You do not need to be a database internals expert to make a meaningful impact.

### Code Contributions

Code contributions are the most direct way to improve ThunderDB. Areas include:

- **Bug fixes:** Investigate and fix issues reported on the issue tracker.
- **New features:** Implement new capabilities such as new SQL functions, storage optimizations, protocol support, or API endpoints.
- **Performance improvements:** Profile, benchmark, and optimize hot paths in the query executor, storage engine, or networking layer.
- **Refactoring:** Improve code clarity, reduce duplication, and modernize patterns without changing behavior.

All code contributions must include appropriate tests and pass the full CI pipeline before merging.

### Documentation Contributions

Good documentation is essential for a database system. Contributions include:

- **User-facing documentation:** Tutorials, how-to guides, configuration references, and SQL syntax documentation.
- **Developer documentation:** Architecture documents, crate-level documentation, inline code comments, and design decision records.
- **API documentation:** Rust doc comments (`///`), OpenAPI specs for REST endpoints, and protocol documentation.
- **Examples and samples:** Working code samples that demonstrate ThunderDB features and integrations.

### Test Contributions

Expanding test coverage improves reliability and catches regressions. Test contributions include:

- **Unit tests:** Fine-grained tests for individual functions and modules.
- **Integration tests:** End-to-end tests that exercise multiple components working together.
- **Property-based tests:** Tests using `proptest` to verify invariants across randomly generated inputs.
- **Chaos tests:** Tests that simulate failures (network partitions, disk errors, node crashes) to verify resilience.
- **Benchmarks:** Performance benchmarks using `criterion` to track regressions and validate optimizations.
- **Compliance tests:** Tests that verify ACID properties, SQL standard conformance, and wire protocol compatibility.

### Issue Contributions

Even without writing code, you can contribute by improving the issue tracker:

- **Bug reports:** File detailed bug reports with reproduction steps, expected behavior, actual behavior, and environment information.
- **Feature requests:** Propose new features with clear use cases and design considerations.
- **Triage:** Help categorize, reproduce, and prioritize existing issues.
- **Discussion:** Participate in design discussions on RFCs and architectural proposals.

## Contribution Workflow

The standard workflow for contributing to ThunderDB is:

1. **Find or create an issue.** Browse the issue tracker for issues labeled `good-first-issue`, `help-wanted`, or `up-for-grabs`. Alternatively, create a new issue describing what you want to work on.

2. **Fork and clone.** Fork the ThunderDB repository to your GitHub account and clone it locally.

3. **Create a branch.** Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Develop.** Make your changes, following the [Development Setup](./development-setup/) guide and the coding conventions described in the [Codebase Guide](./codebase-guide/).

5. **Test.** Run the full test suite and add new tests for your changes. See the [Testing](./testing/) guide for details.

6. **Commit.** Write clear, descriptive commit messages. Use conventional commit format:
   ```
   feat(storage): add prefix compression for B+Tree leaf pages
   fix(protocol): handle malformed MySQL handshake packets
   docs(contributor): add codebase architecture diagram
   test(txn): add property tests for MVCC snapshot isolation
   ```

7. **Push and open a pull request.** Push your branch and open a PR against `main`. Fill out the PR template completely:
   - Description of the change
   - Related issue(s)
   - Test plan
   - Performance impact (if applicable)
   - Breaking changes (if applicable)

8. **Code review.** Address review feedback. Maintainers will review for correctness, performance, code style, and test coverage.

9. **Merge.** Once approved and all CI checks pass, a maintainer will merge your PR.

## Coding Conventions

ThunderDB follows these coding conventions:

- **Formatting:** All code must be formatted with `cargo fmt` using the project `.rustfmt.toml` configuration.
- **Linting:** All code must pass `cargo clippy` with no warnings.
- **Documentation:** All public APIs must have doc comments. Complex internal functions should also be documented.
- **Error handling:** Use the project error types defined in `thunder-common/src/error.rs`. Avoid `unwrap()` and `expect()` in production code paths.
- **Naming:** Follow Rust naming conventions. Use descriptive names. Abbreviations should be well-known (e.g., `txn` for transaction, `wal` for write-ahead log).
- **Unsafe code:** Minimize use of `unsafe`. All `unsafe` blocks must include a `// SAFETY:` comment explaining why the invariants are upheld.
- **Dependencies:** New dependencies must be discussed in the PR. Prefer well-maintained, widely-used crates. All dependencies must have compatible licenses.

## Getting Help

If you need help at any point:

- **GitHub Discussions:** Ask questions in the Discussions tab of the repository.
- **Discord:** Join the ThunderDB Discord server for real-time help from maintainers and other contributors.
- **Office Hours:** Maintainers hold weekly office hours (check the community calendar) for live Q&A and pair programming.

## What's Next?

- **[Development Setup](./development-setup/):** Set up your local development environment.
- **[Codebase Guide](./codebase-guide/):** Understand the architecture and navigate the 14-crate workspace.
- **[Testing](./testing/):** Learn the testing strategy and how to write effective tests.
- **[Release Process](./release-process/):** Understand how ThunderDB versions and releases are managed.
