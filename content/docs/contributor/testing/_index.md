---
title: "Testing"
weight: 3
description: "Comprehensive guide to ThunderDB's testing strategy -- unit tests, integration tests, ACID compliance tests, chaos tests, property-based tests, benchmarks, and CI/CD pipeline."
---

# Testing

ThunderDB maintains a rigorous testing strategy to ensure correctness, reliability, and performance across all 14 crates. This guide covers every aspect of testing: how tests are organized, how to run them, how to write new tests, and how the CI/CD pipeline enforces quality standards.

## Testing Philosophy

ThunderDB follows these testing principles:

1. **Correctness is non-negotiable.** A database must never lose data, return wrong results, or violate ACID properties. Tests verify these guarantees exhaustively.
2. **Test at multiple levels.** Unit tests verify individual functions, integration tests verify component interactions, and end-to-end tests verify the full system.
3. **Automate everything.** Every test runs in CI. Manual testing procedures are documented but not relied upon as the sole quality gate.
4. **Test failure modes.** A database must handle crashes, network partitions, disk failures, and malformed input gracefully. Chaos tests verify resilience.
5. **Benchmark continuously.** Performance regressions are caught early through automated benchmarks.

## Test Organization

Tests are organized following Rust conventions:

```
thunder-storage/
+-- src/
|   +-- wal.rs          # Contains #[cfg(test)] mod tests { ... }
|   +-- btree.rs        # Contains #[cfg(test)] mod tests { ... }
|   +-- ...
+-- tests/
|   +-- acid_compliance.rs   # Integration tests
|   +-- recovery_tests.rs    # Integration tests
+-- benches/
    +-- btree_bench.rs       # Criterion benchmarks
    +-- wal_bench.rs         # Criterion benchmarks
```

- **Unit tests** live inside each source file within a `#[cfg(test)] mod tests` block.
- **Integration tests** live in the `tests/` directory of each crate.
- **Benchmarks** live in the `benches/` directory of each crate.

## Unit Tests

Unit tests verify the correctness of individual functions, methods, and modules in isolation.

### Running Unit Tests

```bash
# Run all unit tests across the workspace
cargo test --lib

# Run unit tests for a specific crate
cargo test -p thunder-storage --lib

# Run unit tests matching a name pattern
cargo test -p thunder-storage --lib btree::tests::

# Run with output (println! and tracing output visible)
cargo test -p thunder-storage --lib -- --nocapture

# Run a single test by exact name
cargo test -p thunder-storage --lib btree::tests::test_insert_and_lookup -- --exact
```

### Unit Test Example

```rust
// thunder-storage/src/btree.rs

#[cfg(test)]
mod tests {
    use super::*;
    use crate::buffer::BufferPool;
    use tempfile::TempDir;

    /// Helper to create a B+Tree backed by a temporary directory
    fn setup_btree() -> (BTree, TempDir) {
        let dir = TempDir::new().unwrap();
        let buffer_pool = BufferPool::new(1024, dir.path());
        let btree = BTree::new(buffer_pool, KeyType::Int64);
        (btree, dir)
    }

    #[test]
    fn test_insert_and_lookup() {
        let (mut btree, _dir) = setup_btree();

        // Insert 1000 key-value pairs
        for i in 0..1000i64 {
            let key = Key::Int64(i);
            let value = Value::Int64(i * 10);
            btree.insert(&key, &value).unwrap();
        }

        // Verify all values are retrievable
        for i in 0..1000i64 {
            let key = Key::Int64(i);
            let result = btree.get(&key).unwrap();
            assert_eq!(result, Some(Value::Int64(i * 10)));
        }

        // Verify non-existent key returns None
        assert_eq!(btree.get(&Key::Int64(9999)).unwrap(), None);
    }

    #[test]
    fn test_range_scan() {
        let (mut btree, _dir) = setup_btree();

        for i in 0..100i64 {
            btree.insert(&Key::Int64(i), &Value::Int64(i)).unwrap();
        }

        // Scan range [10, 20)
        let results: Vec<_> = btree
            .range_scan(&Key::Int64(10), &Key::Int64(20))
            .unwrap()
            .collect();

        assert_eq!(results.len(), 10);
        assert_eq!(results[0].0, Key::Int64(10));
        assert_eq!(results[9].0, Key::Int64(19));
    }

    #[test]
    fn test_delete() {
        let (mut btree, _dir) = setup_btree();

        btree.insert(&Key::Int64(42), &Value::Int64(100)).unwrap();
        assert_eq!(btree.get(&Key::Int64(42)).unwrap(), Some(Value::Int64(100)));

        btree.delete(&Key::Int64(42)).unwrap();
        assert_eq!(btree.get(&Key::Int64(42)).unwrap(), None);
    }
}
```

### Unit Test Conventions

- **Test function names** should describe the scenario being tested: `test_insert_and_lookup`, `test_concurrent_writes_do_not_lose_data`, `test_recovery_after_crash`.
- **One assertion per logical check.** Multiple assertions are fine if they verify different aspects of the same operation.
- **Use helper functions** to reduce boilerplate. Common setup patterns should be extracted into `setup_*` functions.
- **Test edge cases:** empty inputs, maximum sizes, boundary values, concurrent access.
- **Temporary resources:** Use `tempfile::TempDir` for temporary directories and `tempfile::NamedTempFile` for temporary files. These are automatically cleaned up when dropped.

## Integration Tests

Integration tests verify that multiple components work correctly together. They live in the `tests/` directory of each crate and have access to the crate's public API (but not internal modules).

### Key Integration Test Files

#### ACID Compliance Tests

**File:** `thunder-storage/tests/acid_compliance.rs`

These tests verify that ThunderDB correctly implements ACID properties:

```rust
// thunder-storage/tests/acid_compliance.rs

/// Verify atomicity: a transaction either fully commits or fully aborts.
/// No partial results should ever be visible.
#[test]
fn test_atomicity_all_or_nothing() {
    let db = TestDatabase::new();

    // Begin a transaction that performs multiple writes
    let txn = db.begin().unwrap();
    txn.execute("INSERT INTO accounts VALUES (1, 'Alice', 1000)").unwrap();
    txn.execute("INSERT INTO accounts VALUES (2, 'Bob', 2000)").unwrap();

    // Abort the transaction
    txn.abort().unwrap();

    // Verify neither row is visible
    let result = db.query("SELECT COUNT(*) FROM accounts").unwrap();
    assert_eq!(result.rows[0].get_i64(0), 0);
}

/// Verify consistency: constraints are enforced even under concurrent access.
#[test]
fn test_consistency_constraints_enforced() {
    let db = TestDatabase::new();
    db.execute("CREATE TABLE accounts (id INT PRIMARY KEY, balance INT CHECK (balance >= 0))").unwrap();
    db.execute("INSERT INTO accounts VALUES (1, 1000)").unwrap();

    // Attempt to violate the CHECK constraint
    let result = db.execute("UPDATE accounts SET balance = -1 WHERE id = 1");
    assert!(result.is_err());

    // Verify balance is unchanged
    let row = db.query("SELECT balance FROM accounts WHERE id = 1").unwrap();
    assert_eq!(row.rows[0].get_i64(0), 1000);
}

/// Verify isolation: concurrent transactions do not see each other's uncommitted changes.
#[test]
fn test_isolation_snapshot() {
    let db = TestDatabase::new();
    db.execute("CREATE TABLE counter (id INT PRIMARY KEY, value INT)").unwrap();
    db.execute("INSERT INTO counter VALUES (1, 0)").unwrap();

    let txn1 = db.begin().unwrap();
    let txn2 = db.begin().unwrap();

    // txn1 updates the value
    txn1.execute("UPDATE counter SET value = 42 WHERE id = 1").unwrap();

    // txn2 should still see the old value (snapshot isolation)
    let result = txn2.query("SELECT value FROM counter WHERE id = 1").unwrap();
    assert_eq!(result.rows[0].get_i64(0), 0);

    txn1.commit().unwrap();
    txn2.commit().unwrap();
}

/// Verify durability: committed data survives server restart.
#[test]
fn test_durability_survives_restart() {
    let dir = TempDir::new().unwrap();

    // Write data and commit
    {
        let db = TestDatabase::with_dir(dir.path());
        db.execute("CREATE TABLE persist (id INT PRIMARY KEY, data TEXT)").unwrap();
        db.execute("INSERT INTO persist VALUES (1, 'important data')").unwrap();
        db.shutdown().unwrap();  // graceful shutdown with WAL flush
    }

    // Restart and verify data is present
    {
        let db = TestDatabase::with_dir(dir.path());
        let result = db.query("SELECT data FROM persist WHERE id = 1").unwrap();
        assert_eq!(result.rows[0].get_str(0), "important data");
    }
}
```

#### API Integration Tests

**File:** `thunder-api/tests/integration_test.rs`

Tests the full API stack from HTTP request to response:

```rust
// thunder-api/tests/integration_test.rs

use reqwest::Client;
use thunder_server::TestServer;

#[tokio::test]
async fn test_rest_api_crud() {
    let server = TestServer::start().await;
    let client = Client::new();
    let base_url = server.rest_url();

    // Create a table
    let resp = client.post(format!("{}/api/v1/execute", base_url))
        .json(&json!({
            "sql": "CREATE TABLE users (id INT PRIMARY KEY, name TEXT, email TEXT)"
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    // Insert a row
    let resp = client.post(format!("{}/api/v1/execute", base_url))
        .json(&json!({
            "sql": "INSERT INTO users VALUES (1, 'Alice', 'alice@example.com')"
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    // Query the row
    let resp = client.post(format!("{}/api/v1/query", base_url))
        .json(&json!({ "sql": "SELECT * FROM users WHERE id = 1" }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["rows"][0]["name"], "Alice");
}

#[tokio::test]
async fn test_grpc_api_query() {
    let server = TestServer::start().await;
    let mut client = ThunderGrpcClient::connect(server.grpc_url()).await.unwrap();

    let response = client.execute_query(QueryRequest {
        sql: "SELECT 1 + 1 AS result".to_string(),
        ..Default::default()
    }).await.unwrap();

    assert_eq!(response.rows[0].values[0], Value::Int64(2));
}

#[tokio::test]
async fn test_postgres_wire_protocol() {
    let server = TestServer::start().await;

    // Connect using the tokio-postgres client
    let (client, connection) = tokio_postgres::connect(
        &format!("host=localhost port={} user=admin dbname=thunderdb", server.pg_port()),
        tokio_postgres::NoTls,
    ).await.unwrap();

    tokio::spawn(connection);

    let rows = client.query("SELECT 42 AS answer", &[]).await.unwrap();
    assert_eq!(rows[0].get::<_, i32>(0), 42);
}
```

#### Chaos Tests

**File:** `thunder-server/tests/chaos_tests.rs`

Tests that verify ThunderDB handles failure conditions correctly:

```rust
// thunder-server/tests/chaos_tests.rs

/// Test that the database recovers correctly after a simulated crash
/// (process killed without graceful shutdown).
#[test]
fn test_crash_recovery() {
    let dir = TempDir::new().unwrap();

    // Phase 1: Write data, then simulate a crash
    {
        let db = TestDatabase::with_dir(dir.path());
        db.execute("CREATE TABLE crash_test (id INT PRIMARY KEY, value INT)").unwrap();

        for i in 0..1000 {
            db.execute(&format!("INSERT INTO crash_test VALUES ({}, {})", i, i * 10)).unwrap();
        }

        // Simulate crash: drop without graceful shutdown
        // The WAL has been written but the data files may be inconsistent
        db.simulate_crash();
    }

    // Phase 2: Restart and verify ARIES recovery
    {
        let db = TestDatabase::with_dir(dir.path());
        let result = db.query("SELECT COUNT(*) FROM crash_test").unwrap();
        assert_eq!(result.rows[0].get_i64(0), 1000);

        // Verify all values are correct
        for i in 0..1000 {
            let result = db.query(&format!(
                "SELECT value FROM crash_test WHERE id = {}", i
            )).unwrap();
            assert_eq!(result.rows[0].get_i64(0), i * 10);
        }
    }
}

/// Test that the cluster handles node failure and re-joining correctly.
#[test]
fn test_node_failure_and_rejoin() {
    let cluster = TestCluster::new(3);  // 3-node cluster

    // Write data
    cluster.node(0).execute("CREATE TABLE replicated (id INT PRIMARY KEY, value TEXT)").unwrap();
    cluster.node(0).execute("INSERT INTO replicated VALUES (1, 'hello')").unwrap();

    // Wait for replication
    cluster.wait_for_replication().unwrap();

    // Kill node 2
    cluster.kill_node(2);

    // Verify reads still work on remaining nodes
    let result = cluster.node(0).query("SELECT value FROM replicated WHERE id = 1").unwrap();
    assert_eq!(result.rows[0].get_str(0), "hello");

    // Write more data with node 2 down
    cluster.node(0).execute("INSERT INTO replicated VALUES (2, 'world')").unwrap();

    // Restart node 2
    cluster.restart_node(2);
    cluster.wait_for_replication().unwrap();

    // Verify node 2 has caught up with all data
    let result = cluster.node(2).query("SELECT COUNT(*) FROM replicated").unwrap();
    assert_eq!(result.rows[0].get_i64(0), 2);
}

/// Test behavior under network partition.
#[test]
fn test_network_partition() {
    let cluster = TestCluster::new(5);  // 5-node cluster

    cluster.node(0).execute("CREATE TABLE partition_test (id INT PRIMARY KEY)").unwrap();

    // Partition: nodes [0,1] cannot communicate with nodes [2,3,4]
    cluster.create_partition(&[0, 1], &[2, 3, 4]);

    // The minority partition (nodes 0,1) should not be able to commit writes
    let result = cluster.node(0).execute("INSERT INTO partition_test VALUES (1)");
    assert!(result.is_err()); // Should fail or timeout

    // The majority partition (nodes 2,3,4) should elect a new leader and accept writes
    cluster.node(2).execute("INSERT INTO partition_test VALUES (2)").unwrap();

    // Heal the partition
    cluster.heal_partition();
    cluster.wait_for_replication().unwrap();

    // All nodes should converge on the same state
    for i in 0..5 {
        let result = cluster.node(i).query("SELECT COUNT(*) FROM partition_test").unwrap();
        assert_eq!(result.rows[0].get_i64(0), 1); // Only the majority write succeeded
    }
}

/// Test behavior under disk full conditions.
#[test]
fn test_disk_full() {
    let dir = TempDir::new().unwrap();
    let db = TestDatabase::with_dir(dir.path());

    db.execute("CREATE TABLE disk_test (id INT PRIMARY KEY, data TEXT)").unwrap();

    // Simulate disk full by setting a size limit on the test directory
    db.set_disk_limit(1024 * 1024); // 1MB limit

    // Insert data until disk is full
    let mut succeeded = 0;
    for i in 0..100_000 {
        match db.execute(&format!(
            "INSERT INTO disk_test VALUES ({}, '{}')", i, "x".repeat(1000)
        )) {
            Ok(_) => succeeded += 1,
            Err(e) => {
                // Should get a clear "disk full" error, not corruption
                assert!(e.to_string().contains("disk full") ||
                        e.to_string().contains("no space"));
                break;
            }
        }
    }

    // Verify that successfully committed data is still readable
    let result = db.query("SELECT COUNT(*) FROM disk_test").unwrap();
    assert_eq!(result.rows[0].get_i64(0), succeeded);
}
```

### Running Integration Tests

```bash
# Run all integration tests
cargo test --test '*'

# Run integration tests for a specific crate
cargo test -p thunder-storage --test acid_compliance

# Run a specific integration test function
cargo test -p thunder-server --test chaos_tests test_crash_recovery

# Run with verbose output
cargo test -p thunder-api --test integration_test -- --nocapture
```

## Property-Based Tests

ThunderDB uses the `proptest` crate for property-based testing. Instead of testing specific examples, property-based tests verify that invariants hold across randomly generated inputs.

### Example: B+Tree Property Tests

```rust
// thunder-storage/src/btree.rs (within #[cfg(test)] block)

use proptest::prelude::*;

proptest! {
    /// Property: Every key that is inserted can be retrieved.
    #[test]
    fn prop_insert_then_get(
        keys in prop::collection::vec(any::<i64>(), 1..1000)
    ) {
        let (mut btree, _dir) = setup_btree();
        let unique_keys: Vec<_> = keys.into_iter().collect::<std::collections::HashSet<_>>()
            .into_iter().collect();

        for &key in &unique_keys {
            btree.insert(&Key::Int64(key), &Value::Int64(key * 2)).unwrap();
        }

        for &key in &unique_keys {
            let result = btree.get(&Key::Int64(key)).unwrap();
            prop_assert_eq!(result, Some(Value::Int64(key * 2)));
        }
    }

    /// Property: The tree is always sorted (range scan returns keys in order).
    #[test]
    fn prop_sorted_order(
        keys in prop::collection::vec(any::<i64>(), 1..500)
    ) {
        let (mut btree, _dir) = setup_btree();

        for &key in &keys {
            let _ = btree.insert(&Key::Int64(key), &Value::Int64(key));
        }

        let results: Vec<_> = btree.full_scan().unwrap().collect();
        for window in results.windows(2) {
            prop_assert!(window[0].0 <= window[1].0, "Keys must be sorted");
        }
    }

    /// Property: Deleting a key makes it unretrievable.
    #[test]
    fn prop_delete_removes_key(
        keys in prop::collection::vec(any::<i64>(), 1..200),
        delete_idx in any::<prop::sample::Index>(),
    ) {
        let (mut btree, _dir) = setup_btree();
        let unique_keys: Vec<_> = keys.into_iter().collect::<std::collections::HashSet<_>>()
            .into_iter().collect();

        if unique_keys.is_empty() {
            return Ok(());
        }

        for &key in &unique_keys {
            btree.insert(&Key::Int64(key), &Value::Int64(key)).unwrap();
        }

        let delete_key = unique_keys[delete_idx.index(unique_keys.len())];
        btree.delete(&Key::Int64(delete_key)).unwrap();

        prop_assert_eq!(btree.get(&Key::Int64(delete_key)).unwrap(), None);
    }
}
```

### Running Property-Based Tests

Property-based tests are part of the regular test suite and run with `cargo test`. They use a default of 256 test cases per property. For more thorough testing:

```bash
# Run with more test cases
PROPTEST_CASES=10000 cargo test -p thunder-storage -- prop_

# Run with a specific seed (for reproducing failures)
PROPTEST_SEED=12345 cargo test -p thunder-storage -- prop_insert_then_get
```

When a property test fails, `proptest` automatically shrinks the failing input to the smallest reproduction case and prints the seed for deterministic replay.

## Load Tests

**File:** `thunder-api/tests/load_test.rs`

Load tests measure throughput and latency under sustained workloads:

```rust
// thunder-api/tests/load_test.rs

/// Test sustained query throughput under concurrent load.
#[tokio::test]
#[ignore] // Run only when explicitly requested: cargo test -- --ignored
async fn test_concurrent_query_throughput() {
    let server = TestServer::start().await;

    // Setup: create table and populate with data
    setup_test_data(&server, 100_000).await;

    let num_clients = 50;
    let queries_per_client = 1000;
    let start = Instant::now();

    let handles: Vec<_> = (0..num_clients).map(|_| {
        let url = server.rest_url();
        tokio::spawn(async move {
            let client = Client::new();
            for _ in 0..queries_per_client {
                let id = rand::random::<u64>() % 100_000;
                let resp = client.post(format!("{}/api/v1/query", url))
                    .json(&json!({
                        "sql": format!("SELECT * FROM load_test WHERE id = {}", id)
                    }))
                    .send().await.unwrap();
                assert_eq!(resp.status(), 200);
            }
        })
    }).collect();

    for handle in handles {
        handle.await.unwrap();
    }

    let elapsed = start.elapsed();
    let total_queries = num_clients * queries_per_client;
    let qps = total_queries as f64 / elapsed.as_secs_f64();

    println!("Load test results:");
    println!("  Total queries: {}", total_queries);
    println!("  Duration: {:?}", elapsed);
    println!("  Throughput: {:.0} queries/sec", qps);
    println!("  Avg latency: {:.2}ms", elapsed.as_millis() as f64 / total_queries as f64);

    // Assert minimum performance thresholds
    assert!(qps > 1000.0, "Expected at least 1000 QPS, got {:.0}", qps);
}

/// Test write throughput under concurrent load.
#[tokio::test]
#[ignore]
async fn test_concurrent_write_throughput() {
    let server = TestServer::start().await;
    server.execute("CREATE TABLE write_test (id INT PRIMARY KEY, value TEXT)").await.unwrap();

    let num_writers = 20;
    let writes_per_writer = 5000;
    let start = Instant::now();

    let handles: Vec<_> = (0..num_writers).map(|writer_id| {
        let url = server.rest_url();
        tokio::spawn(async move {
            let client = Client::new();
            for i in 0..writes_per_writer {
                let id = writer_id * writes_per_writer + i;
                let resp = client.post(format!("{}/api/v1/execute", url))
                    .json(&json!({
                        "sql": format!("INSERT INTO write_test VALUES ({}, 'data_{}')", id, id)
                    }))
                    .send().await.unwrap();
                assert_eq!(resp.status(), 200);
            }
        })
    }).collect();

    for handle in handles {
        handle.await.unwrap();
    }

    let elapsed = start.elapsed();
    let total_writes = num_writers * writes_per_writer;
    let wps = total_writes as f64 / elapsed.as_secs_f64();

    println!("Write throughput: {:.0} writes/sec", wps);
    assert!(wps > 500.0, "Expected at least 500 writes/sec, got {:.0}", wps);
}
```

### Running Load Tests

Load tests are marked with `#[ignore]` so they do not run during normal `cargo test`. Run them explicitly:

```bash
# Run all load tests
cargo test -p thunder-api --test load_test -- --ignored --nocapture

# Run a specific load test
cargo test -p thunder-api --test load_test test_concurrent_query_throughput -- --ignored --nocapture
```

## Benchmarks

ThunderDB uses the `criterion` crate for statistically rigorous micro-benchmarks. Benchmarks live in the `benches/` directory of each crate.

### Example Benchmark

```rust
// thunder-storage/benches/btree_bench.rs

use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId, BatchSize};
use thunder_storage::btree::{BTree, Key, Value};

fn bench_btree_insert(c: &mut Criterion) {
    let mut group = c.benchmark_group("btree_insert");

    for size in [100, 1_000, 10_000, 100_000] {
        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &size,
            |b, &size| {
                b.iter_batched(
                    || setup_btree(),  // setup
                    |(mut btree, _dir)| {
                        for i in 0..size {
                            btree.insert(&Key::Int64(i), &Value::Int64(i)).unwrap();
                        }
                    },
                    BatchSize::SmallInput,
                );
            },
        );
    }
    group.finish();
}

fn bench_btree_point_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("btree_point_lookup");

    for size in [1_000, 10_000, 100_000] {
        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &size,
            |b, &size| {
                let (mut btree, _dir) = setup_btree();
                for i in 0..size {
                    btree.insert(&Key::Int64(i), &Value::Int64(i)).unwrap();
                }

                let mut rng = rand::thread_rng();
                b.iter(|| {
                    let key = Key::Int64(rng.gen_range(0..size));
                    btree.get(&key).unwrap()
                });
            },
        );
    }
    group.finish();
}

fn bench_btree_range_scan(c: &mut Criterion) {
    let mut group = c.benchmark_group("btree_range_scan");

    let (mut btree, _dir) = setup_btree();
    for i in 0..100_000i64 {
        btree.insert(&Key::Int64(i), &Value::Int64(i)).unwrap();
    }

    for range_size in [10, 100, 1_000, 10_000] {
        group.bench_with_input(
            BenchmarkId::from_parameter(range_size),
            &range_size,
            |b, &range_size| {
                b.iter(|| {
                    let start = Key::Int64(50_000);
                    let end = Key::Int64(50_000 + range_size);
                    let _results: Vec<_> = btree.range_scan(&start, &end).unwrap().collect();
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_btree_insert, bench_btree_point_lookup, bench_btree_range_scan);
criterion_main!(benches);
```

### Running Benchmarks

```bash
# Run all benchmarks
cargo bench

# Run benchmarks for a specific crate
cargo bench -p thunder-storage

# Run a specific benchmark
cargo bench -p thunder-storage -- btree_point_lookup

# Generate HTML reports (criterion automatically creates these in target/criterion/)
cargo bench -p thunder-storage
open target/criterion/report/index.html
```

### Benchmark Files

| Crate | Benchmark File | What It Measures |
|-------|---------------|-----------------|
| `thunder-storage` | `benches/btree_bench.rs` | B+Tree insert, lookup, range scan throughput |
| `thunder-storage` | `benches/wal_bench.rs` | WAL write throughput, group commit latency |
| `thunder-storage` | `benches/compression_bench.rs` | Compression/decompression speed and ratios |
| `thunder-query` | `benches/executor_bench.rs` | Query execution throughput for various query types |
| `thunder-query` | `benches/vectorized_bench.rs` | Vectorized vs. row-at-a-time execution |
| `thunder-protocol` | `benches/protocol_bench.rs` | Protocol encoding/decoding throughput |
| `thunder-sql` | `benches/parser_bench.rs` | SQL parsing throughput |
| `thunder-sql` | `benches/optimizer_bench.rs` | Query optimization time for various plan shapes |

## Test Coverage

### Measuring Coverage

Use `cargo-tarpaulin` to measure test coverage:

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Run coverage for the entire workspace
cargo tarpaulin --workspace --out Html

# Run coverage for a specific crate
cargo tarpaulin -p thunder-storage --out Html

# Generate Lcov output for CI integration
cargo tarpaulin --workspace --out Lcov --output-dir coverage/

# View the HTML report
open tarpaulin-report.html
```

### Coverage Targets

ThunderDB aims for the following coverage targets:

| Category | Target | Rationale |
|----------|--------|-----------|
| `thunder-common` | 90%+ | Foundational types must be thoroughly tested |
| `thunder-storage` | 85%+ | Storage correctness is critical for data integrity |
| `thunder-txn` | 85%+ | Transaction correctness ensures ACID properties |
| `thunder-sql` | 80%+ | SQL parsing and optimization have many edge cases |
| `thunder-query` | 80%+ | Query execution correctness ensures correct results |
| `thunder-protocol` | 75%+ | Protocol compatibility requires testing many message types |
| `thunder-api` | 70%+ | API tests cover handler logic and serialization |
| Overall workspace | 80%+ | Comprehensive coverage across all crates |

Coverage numbers are tracked in CI and reported on each pull request.

## Writing New Tests

### Test File Placement

- **Unit test:** Add a `#[test]` function inside the `#[cfg(test)] mod tests` block in the relevant source file.
- **Integration test:** Create or add to a file in the `tests/` directory of the relevant crate.
- **Benchmark:** Create or add to a file in the `benches/` directory of the relevant crate.

### Test Fixtures and Utilities

ThunderDB provides shared test utilities in several locations:

```rust
// thunder-common/src/test_utils.rs (compiled only in test mode)
#[cfg(test)]
pub mod test_utils {
    /// Create a temporary database for testing
    pub fn create_test_db() -> TestDatabase { /* ... */ }

    /// Generate random rows for testing
    pub fn random_rows(count: usize, schema: &Schema) -> Vec<Row> { /* ... */ }

    /// Assert that two result sets are equivalent (order-independent)
    pub fn assert_result_sets_equal(a: &[Row], b: &[Row]) { /* ... */ }
}
```

### Assertions

Use these assertion patterns:

```rust
// Standard assertions
assert_eq!(actual, expected);
assert_ne!(actual, unexpected);
assert!(condition, "descriptive message: {}", context);

// Result assertions
assert!(result.is_ok(), "Expected Ok, got {:?}", result);
assert!(result.is_err(), "Expected Err, got {:?}", result);

// For proptest
prop_assert_eq!(actual, expected);
prop_assert!(condition);

// Custom assertion for approximate floating-point comparison
assert!((actual - expected).abs() < 1e-6, "Values differ: {} vs {}", actual, expected);
```

### Async Test Pattern

For async tests, use the `#[tokio::test]` attribute:

```rust
#[tokio::test]
async fn test_async_operation() {
    let server = TestServer::start().await;
    let result = server.query("SELECT 1").await.unwrap();
    assert_eq!(result.rows[0].get_i64(0), 1);
}

// For tests that need a multi-threaded runtime
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn test_concurrent_operations() {
    // ...
}
```

### Test Naming Conventions

Follow these naming patterns:

```
test_{operation}                        # Basic operation test
test_{operation}_{condition}            # Operation under specific condition
test_{operation}_{expected_outcome}     # Operation with expected outcome
test_{component}_{scenario}             # Component-specific scenario

# Examples:
test_insert_single_row
test_insert_duplicate_key_returns_error
test_btree_split_at_capacity
test_wal_recovery_after_crash
test_mvcc_snapshot_isolation
test_postgres_protocol_ssl_handshake
```

## CI/CD Pipeline

ThunderDB uses a comprehensive CI/CD pipeline that runs on every push and pull request.

### Pipeline Stages

```
+-- Stage 1: Format & Lint (parallel) --------+
|  cargo fmt -- --check                        |
|  cargo clippy --all-targets -- -D warnings   |
+----------------------------------------------+
                     |
+-- Stage 2: Build (sequential) ---------------+
|  cargo build --all-targets                    |
+----------------------------------------------+
                     |
+-- Stage 3: Test (parallel) ------------------+
|  cargo test --lib          (unit tests)      |
|  cargo test --test '*'     (integration)     |
|  cargo test --doc          (doc tests)       |
+----------------------------------------------+
                     |
+-- Stage 4: Coverage (sequential) ------------+
|  cargo tarpaulin --workspace                 |
|  Upload coverage report                      |
+----------------------------------------------+
                     |
+-- Stage 5: Benchmark (on main only) ---------+
|  cargo bench                                 |
|  Compare with baseline                       |
|  Alert on regressions                        |
+----------------------------------------------+
```

### CI Configuration

The pipeline is defined in `.github/workflows/ci.yml`:

- **Trigger:** Runs on every push to `main` and on every pull request.
- **Matrix:** Tests on Linux (Ubuntu latest), macOS (latest), with the minimum supported Rust version (MSRV) and the latest stable Rust.
- **Caching:** Cargo registry and target directories are cached for faster builds.
- **Timeout:** Individual jobs have a 30-minute timeout.

### Required Checks

The following checks must pass before a pull request can be merged:

1. `cargo fmt -- --check` -- Code is properly formatted
2. `cargo clippy --all-targets --all-features -- -D warnings` -- No clippy warnings
3. `cargo test` -- All tests pass
4. `cargo test --doc` -- All doc tests pass
5. Coverage does not decrease below thresholds
6. No performance regressions detected in benchmarks (main branch only)

### Running the Full CI Locally

Before pushing, you can run the same checks that CI will execute:

```bash
# Run all CI checks locally
cargo fmt -- --check && \
cargo clippy --all-targets --all-features -- -D warnings && \
cargo test && \
cargo test --doc

# Or use the test script which does all of the above
./scripts/run_tests.sh
```

## Debugging Test Failures

### Viewing Test Output

By default, Rust captures stdout/stderr from passing tests. To see all output:

```bash
cargo test -- --nocapture
```

### Enabling Trace Logging in Tests

```bash
# Enable debug logging for a specific module
RUST_LOG=thunder_storage::wal=debug cargo test -p thunder-storage

# Enable trace logging for everything
RUST_LOG=trace cargo test -p thunder-storage -- --nocapture
```

### Reproducing Flaky Tests

If a test fails intermittently:

```bash
# Run the test repeatedly to reproduce
for i in $(seq 1 100); do
    cargo test -p thunder-storage test_concurrent_writes || break
done
```

### Using a Debugger

```bash
# Build tests without running them
cargo test -p thunder-storage --no-run

# Find the test binary
ls target/debug/deps/thunder_storage-*

# Run under a debugger
lldb target/debug/deps/thunder_storage-abc123 -- test_name
```
