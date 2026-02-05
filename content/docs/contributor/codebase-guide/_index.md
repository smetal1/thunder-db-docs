---
title: "Codebase Guide"
weight: 2
description: "A detailed walkthrough of the ThunderDB codebase -- workspace structure, crate dependency graph, key source files, external dependencies, and design patterns used throughout the project."
---

# Codebase Guide

This guide provides a comprehensive tour of the ThunderDB codebase. ThunderDB is organized as a Cargo workspace with 14 crates totaling approximately 75,600 lines of Rust code. Understanding the structure, dependencies, and patterns used throughout the codebase is essential for effective contribution.

## Workspace Structure

ThunderDB uses a single Cargo workspace defined in the root `Cargo.toml`. All crates live in the workspace and share a common `Cargo.lock` file, ensuring consistent dependency versions across the project.

### Root Cargo.toml

The root `Cargo.toml` defines the workspace members, shared dependency versions, and build profiles:

```toml
[workspace]
members = [
    "thunder-common",
    "thunder-storage",
    "thunder-txn",
    "thunder-sql",
    "thunder-query",
    "thunder-cluster",
    "thunder-protocol",
    "thunder-vector",
    "thunder-api",
    "thunder-cdc",
    "thunder-fdw",
    "thunder-server",
    "thunder-client",
]
resolver = "2"

[workspace.dependencies]
# Shared dependency versions are defined here and inherited by crates
tokio = { version = "1.35", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
tracing = "0.1"
# ... additional shared dependencies

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
panic = "abort"

[profile.dev]
opt-level = 0
debug = true
```

### Build Profiles

ThunderDB defines two primary build profiles:

**Development Profile (`cargo build`):**
| Setting | Value | Rationale |
|---------|-------|-----------|
| `opt-level` | `0` | No optimization -- fastest compilation |
| `debug` | `true` | Full debug information -- enables debugger use |

**Release Profile (`cargo build --release`):**
| Setting | Value | Rationale |
|---------|-------|-----------|
| `opt-level` | `3` | Maximum optimization -- best runtime performance |
| `lto` | `"thin"` | Thin link-time optimization -- cross-crate inlining with reasonable build times |
| `codegen-units` | `1` | Single codegen unit -- enables maximum optimization at the cost of parallelism |
| `panic` | `"abort"` | Abort on panic -- smaller binary, no stack unwinding overhead, better for server software |

The release profile produces binaries suitable for production deployment and accurate benchmarking. Development builds are optimized for fast iteration.

### Directory Layout

```
thunderdb/
+-- Cargo.toml              # Workspace root
+-- Cargo.lock              # Locked dependency versions
+-- rust-toolchain.toml     # Rust version (1.75+)
+-- .rustfmt.toml           # Formatting configuration
+-- .clippy.toml            # Clippy configuration
+-- config/
|   +-- dev.toml            # Development configuration
|   +-- test.toml           # Test configuration
|   +-- prod.toml           # Production configuration template
+-- scripts/
|   +-- dev.sh              # Start development server
|   +-- run_tests.sh        # Run full test suite
|   +-- build-deb.sh        # Build Debian package
|   +-- install-hooks.sh    # Install git hooks
+-- docker/
|   +-- Dockerfile          # Production container image
|   +-- Dockerfile.dev      # Development container image
+-- docker-compose.yml      # Multi-container dev environment
+-- thunder-common/         # Shared types, errors, utilities
+-- thunder-storage/        # Storage engine (WAL, B+Tree, buffer pool)
+-- thunder-txn/            # Transaction management (MVCC, 2PC)
+-- thunder-sql/            # SQL parsing, analysis, optimization
+-- thunder-query/          # Query execution engine
+-- thunder-cluster/        # Distributed cluster management
+-- thunder-protocol/       # Wire protocols (PostgreSQL, MySQL, Redis)
+-- thunder-vector/         # Vector search and embeddings
+-- thunder-api/            # REST, gRPC, GraphQL, WebSocket APIs
+-- thunder-cdc/            # Change data capture
+-- thunder-fdw/            # Foreign data wrappers
+-- thunder-server/         # Main server binary
+-- thunder-client/         # Client library
```

## Crate Dependency Graph

Understanding the dependency relationships between crates is critical for navigating the codebase and understanding the impact of changes. The crates form a directed acyclic graph (DAG) with `thunder-common` at the base and `thunder-server` at the top.

### Visual Dependency Graph

```
                         thunder-server
                        /   |   |   |   \
                       /    |   |   |    \
                      /     |   |   |     \
               thunder-api  |   |   |  thunder-cdc
              / |  |  \     |   |   |      |
             /  |  |   \    |   |   |      |
            /   |  |    \   |   |   |      |
  t-protocol  t-cluster |  |  t-vector  t-fdw
   / | | \      |       |  |    |        / |
  /  | |  \     |       |  |    |       /  |
 /   | |   \    |       |  |    |      /   |
t-sql t-query t-txn     |  |    |   t-sql  |
  |   /|\      / \      |  |    |          |
  |  / | \    /   \     |  |    |          |
  | /  |  \  /     \    |  |    |          |
  |/   |   \/       \   |  |    |          |
  t-storage  t-sql   |  |  |    |          |
       |       |     |  |  |    |          |
       |       |     |  |  |    |          |
       +-------+-----+--+--+----+----------+
                     |
               thunder-common
```

### Crate Dependency Details

Each crate's internal dependencies are listed below, along with its role in the system:

#### thunder-common (Leaf Crate)
**Internal dependencies:** None

This is the foundational crate with zero internal dependencies. It defines the core types, error types, configuration structures, and shared utilities used throughout the entire system. Changes to this crate trigger a rebuild of every other crate in the workspace.

#### thunder-storage
**Internal dependencies:** `thunder-common`

The storage engine layer. Manages persistent data through the write-ahead log (WAL), B+Tree indexes, buffer pool, row-oriented and columnar storage formats, system catalog, and compression.

#### thunder-txn
**Internal dependencies:** `thunder-common`, `thunder-storage`

The transaction management layer. Implements multi-version concurrency control (MVCC), optimistic concurrency control, distributed transaction coordination via two-phase commit (2PC), lock management, and deadlock detection.

#### thunder-sql
**Internal dependencies:** `thunder-common`

The SQL processing layer. Handles SQL parsing, semantic analysis, query optimization, and query plan generation. Also includes dialect support for multiple SQL dialects, natural language processing, LLM integration, ML operations, and user-defined functions.

#### thunder-query
**Internal dependencies:** `thunder-common`, `thunder-sql`, `thunder-storage`, `thunder-txn`

The query execution engine. Takes optimized query plans from `thunder-sql` and executes them against the storage engine within transaction contexts. Implements physical operators, vectorized batch processing, and parallel multi-threaded execution.

#### thunder-cluster
**Internal dependencies:** `thunder-common`, `thunder-storage`

The distributed cluster management layer. Handles node discovery, Raft consensus, data partitioning, replication, and cluster membership changes.

#### thunder-protocol
**Internal dependencies:** `thunder-common`, `thunder-sql`, `thunder-query`, `thunder-txn`

The wire protocol layer. Implements compatibility with existing database clients through the PostgreSQL v3 wire protocol, MySQL wire protocol, and Redis RESP protocol. Also manages sessions, authentication, and TLS.

#### thunder-vector
**Internal dependencies:** `thunder-common`, `thunder-storage`

The vector search engine. Provides vector indexing (HNSW, IVF), similarity search, and embedding storage for AI/ML workloads.

#### thunder-api
**Internal dependencies:** `thunder-common`, `thunder-sql`, `thunder-query`, `thunder-protocol`, `thunder-cluster`

The API gateway layer. Exposes ThunderDB through REST, gRPC, GraphQL, and WebSocket APIs. Includes the web admin dashboard, request handlers, authentication, and rate limiting.

#### thunder-cdc
**Internal dependencies:** `thunder-common`, `thunder-storage`

Change data capture. Reads the WAL to produce a stream of data change events for downstream consumers, enabling real-time data replication and event-driven architectures.

#### thunder-fdw
**Internal dependencies:** `thunder-common`, `thunder-sql`

Foreign data wrappers. Enables ThunderDB to query external data sources (PostgreSQL, MySQL, CSV, Parquet, S3) as if they were local tables.

#### thunder-client
**Internal dependencies:** `thunder-common`

The official Rust client library for connecting to ThunderDB. Provides a type-safe API for executing queries, managing transactions, and subscribing to change streams.

#### thunder-server (Top-Level Binary)
**Internal dependencies:** All crates

The main server binary that wires everything together. Parses CLI arguments, loads configuration, initializes all subsystems, and starts the server. This is the only crate that produces an executable binary.

## Key Source Files

This section documents the most important source files in each crate, describing their purpose, size, and key abstractions.

### thunder-common

The shared foundation crate containing types, errors, and utilities used across the entire system.

#### `types.rs` -- Core Type Definitions

This file defines the fundamental identifier types and data representations used throughout ThunderDB:

**Identifier Types:**
```rust
// Each ID type is a newtype wrapper for type safety
pub struct DatabaseId(pub u64);
pub struct TableId(pub u64);
pub struct ColumnId(pub u32);
pub struct IndexId(pub u64);
pub struct RowId(pub u64);
pub struct PageId(pub u64);
pub struct TxnId(pub u64);
pub struct RegionId(pub u32);
pub struct NodeId(pub u64);
pub struct Lsn(pub u64);  // Log Sequence Number
```

**Data Types:**
```rust
pub enum DataType {
    Boolean,
    Int8, Int16, Int32, Int64,
    UInt8, UInt16, UInt32, UInt64,
    Float32, Float64,
    Decimal(u8, u8),  // precision, scale
    Varchar(usize),
    Text,
    Blob,
    Date, Time, Timestamp, TimestampTz,
    Interval,
    Uuid,
    Json, Jsonb,
    Vector(usize),  // dimensionality
    Array(Box<DataType>),
}
```

**Value Representation:**
```rust
pub enum Value {
    Null,
    Boolean(bool),
    Int64(i64),
    Float64(f64),
    Decimal(rust_decimal::Decimal),
    String(String),
    Bytes(Vec<u8>),
    Date(chrono::NaiveDate),
    Timestamp(chrono::NaiveDateTime),
    Uuid(uuid::Uuid),
    Json(serde_json::Value),
    Vector(Vec<f32>),
    Array(Vec<Value>),
}
```

**Core Structures:**
```rust
pub struct Row {
    pub id: RowId,
    pub values: Vec<Value>,
}

pub struct Schema {
    pub columns: Vec<ColumnDef>,
    pub primary_key: Vec<ColumnId>,
    pub indexes: Vec<IndexDef>,
}
```

#### `config.rs` -- Configuration Parsing

Handles loading and validating configuration from TOML files and environment variables. Defines the hierarchical configuration structure covering storage, networking, cluster, security, and logging settings. Uses `serde` for deserialization with default values.

#### `error.rs` -- Error Types

Defines the unified error hierarchy for the entire system:

```rust
pub enum ThunderError {
    Sql(SqlError),
    Storage(StorageError),
    Transaction(TransactionError),
    Io(std::io::Error),
    Config(ConfigError),
    Cluster(ClusterError),
    Protocol(ProtocolError),
    Internal(String),
}
```

Each variant has a corresponding detailed error enum. All errors implement `std::error::Error` and `Display`. Error propagation uses the `?` operator with `From` trait implementations.

#### `rbac.rs` -- Role-Based Access Control

Defines roles, permissions, and access control policies. Supports hierarchical roles with privilege inheritance and fine-grained permissions at database, table, and column levels.

#### `audit.rs` -- Audit Logging

Structured audit logging for security-relevant events (authentication, authorization decisions, DDL operations, data access). Events are serialized and written to a dedicated audit log.

#### `metrics.rs` -- Prometheus Metrics

Defines and registers Prometheus metrics for monitoring. Includes counters, gauges, and histograms for query latency, throughput, storage utilization, connection counts, and more.

---

### thunder-storage

The storage engine crate, responsible for all persistent data management.

#### `wal.rs` (~67KB) -- Write-Ahead Log

The largest file in the storage crate, implementing a high-performance write-ahead log:

- **ARIES-style recovery:** Supports analysis, redo, and undo phases for crash recovery
- **Segment management:** WAL is divided into fixed-size segments that are rotated and archived
- **Group commit:** Batches multiple transaction commits into a single `fsync()` call for throughput
- **Log record types:** Insert, Update, Delete, Commit, Abort, Checkpoint, CompensationLogRecord (CLR)
- **Checkpointing:** Periodic fuzzy checkpoints to bound recovery time
- **Log sequence numbers (LSN):** Monotonically increasing sequence numbers for ordering

Key types: `WalManager`, `WalWriter`, `WalReader`, `LogRecord`, `WalSegment`, `CheckpointManager`

#### `btree.rs` (~29KB) -- B+Tree Indexes

Implements concurrent B+Tree indexes, the primary index structure for row-oriented data:

- **Latch coupling (crabbing):** Lock-coupling protocol for concurrent access without coarse-grained locking
- **Prefix compression:** Reduces key storage overhead in leaf and internal nodes
- **Leaf page chaining:** Doubly-linked leaf pages for efficient range scans
- **Bulk loading:** Optimized bottom-up construction for initial data load
- **Split and merge:** Page splits and merges maintain tree balance
- **Iterator interface:** `BTreeIterator` for sequential and reverse scanning

Key types: `BTree`, `BTreeNode`, `InternalNode`, `LeafNode`, `BTreeIterator`, `BTreeBuilder`

#### `buffer.rs` -- Buffer Pool

Manages a fixed-size pool of in-memory page frames:

- **LRU eviction:** Least-recently-used eviction policy with clock approximation
- **Page pinning:** Prevents eviction of actively used pages
- **Dirty page tracking:** Tracks modified pages for write-back
- **Read/write latching:** Per-page read-write locks for concurrent access
- **Prefetching:** Sequential scan detection and asynchronous prefetching

Key types: `BufferPool`, `BufferFrame`, `PageHandle`, `EvictionPolicy`

#### `row_store.rs` -- Row-Oriented Storage

Implements the row-oriented storage format optimized for OLTP workloads:

- **Heap file organization:** Pages organized as a heap with free space tracking
- **Slot directory:** Each page has a slot directory mapping slot numbers to row offsets
- **Row format:** Fixed-size header followed by column values with null bitmap
- **Free space map:** Tracks available space per page for fast insertion

Key types: `RowStore`, `HeapFile`, `SlotPage`, `RowHeader`, `FreeSpaceMap`

#### `column_store.rs` -- Columnar Storage

Implements the columnar storage format optimized for OLAP workloads:

- **Column groups:** Columns are stored in groups based on access patterns
- **Row groups:** Data is divided into row groups (typically 64K-128K rows) for batch processing
- **Encoding:** Type-specific encodings (dictionary, RLE, delta, bit-packing)
- **Statistics:** Min/max/null count per column chunk for predicate pushdown
- **Apache Arrow integration:** Native Arrow columnar format for zero-copy analytics

Key types: `ColumnStore`, `ColumnGroup`, `RowGroup`, `ColumnChunk`, `ColumnEncoder`

#### `catalog.rs` -- System Catalog

Manages metadata about databases, tables, columns, indexes, users, and other database objects:

- **In-memory cache:** Frequently accessed metadata is cached in memory
- **Persistent storage:** Catalog data is stored in system tables
- **Versioning:** Catalog changes are versioned for DDL transactional support
- **Schema evolution:** Supports adding/removing columns, changing types (with restrictions)

Key types: `Catalog`, `DatabaseMeta`, `TableMeta`, `ColumnMeta`, `IndexMeta`

#### `compression.rs` -- Compression Algorithms

Implements multiple compression algorithms with a unified interface:

| Algorithm | Best For | Ratio | Speed |
|-----------|----------|-------|-------|
| **LZ4** | General purpose, hot data | Moderate | Very fast |
| **Snappy** | General purpose, balanced | Moderate | Fast |
| **Zstd** | Cold data, archival | High | Moderate |
| **RLE** (Run-Length Encoding) | Columns with many repeated values | Variable | Very fast |
| **Delta** | Monotonically increasing values (timestamps, sequences) | High | Very fast |
| **Dictionary** | Low-cardinality string columns | High | Fast |

Key types: `Compressor`, `CompressionAlgorithm`, `CompressedBlock`

#### `page.rs` -- Page Management

Defines the 16KB page format used throughout the storage engine:

```
+------------------+
| Page Header      |  (fixed size: 64 bytes)
|   - page_id      |
|   - page_type    |
|   - lsn          |
|   - checksum     |
|   - free_space   |
+------------------+
| Page Content     |  (variable, depends on page type)
|   ...            |
+------------------+
| Page Footer      |  (checksum validation)
+------------------+
```

Page types: `Data`, `Index`, `Overflow`, `FreeSpaceMap`, `Undo`, `System`

Key types: `Page`, `PageHeader`, `PageType`, `PageManager`

#### `disk.rs` -- Disk I/O

Low-level disk I/O layer with direct I/O support:

- **Asynchronous I/O:** Uses `tokio::fs` for non-blocking file operations
- **Direct I/O:** Optional `O_DIRECT` support to bypass OS page cache
- **I/O scheduling:** Request merging and prioritization
- **File management:** Tablespace and data file management

Key types: `DiskManager`, `FileHandle`, `IoRequest`, `IoScheduler`

---

### thunder-txn

Transaction management, ensuring ACID properties across the distributed system.

#### `mvcc.rs` -- Multi-Version Concurrency Control

Implements MVCC for snapshot isolation and serializable isolation levels:

- **Version chains:** Each row maintains a chain of versions tagged with transaction IDs
- **Visibility rules:** A version is visible to a transaction if it was committed before the transaction's snapshot
- **Garbage collection:** Old versions that are no longer visible to any active transaction are reclaimed
- **Snapshot management:** Efficient tracking of active transactions and their snapshots

Key types: `MvccManager`, `Version`, `VersionChain`, `Snapshot`, `VisibilityChecker`

#### `ccp.rs` -- Optimistic Concurrency Control

Implements optimistic concurrency control (OCC) for low-contention workloads:

- **Read phase:** Transaction reads are tracked without acquiring locks
- **Validation phase:** At commit time, the transaction validates that no conflicts occurred
- **Write phase:** If validation succeeds, changes are applied atomically
- **Conflict detection:** Tracks read and write sets for intersection checking

Key types: `OccManager`, `ReadSet`, `WriteSet`, `ValidationResult`

#### `coordinator.rs` -- 2PC Distributed Transaction Coordinator

Coordinates distributed transactions across multiple nodes using two-phase commit:

- **Prepare phase:** Coordinator sends prepare request to all participants; each participant votes commit or abort
- **Commit/abort phase:** Based on unanimous votes, coordinator sends global commit or abort decision
- **Recovery:** Handles coordinator and participant failures using persistent log
- **Timeout handling:** Configurable timeouts with automatic abort on expiry

Key types: `TxnCoordinator`, `Participant`, `PrepareResult`, `TxnLog`

#### `lock_manager.rs` -- Lock Management

Fine-grained locking for pessimistic concurrency control:

- **Lock modes:** Shared (S), Exclusive (X), Intent Shared (IS), Intent Exclusive (IX), Shared Intent Exclusive (SIX)
- **Lock granularity:** Database, table, page, row level locks
- **Lock escalation:** Automatic escalation from row to page to table when lock count exceeds threshold
- **Wait-for graph:** Maintained for deadlock detection

Key types: `LockManager`, `LockMode`, `LockRequest`, `LockTable`

#### `deadlock.rs` -- Deadlock Detection

Implements deadlock detection and resolution:

- **Wait-for graph:** Directed graph of transaction dependencies
- **Cycle detection:** Periodic cycle detection using DFS
- **Victim selection:** Chooses the youngest transaction (lowest cost) as the deadlock victim
- **Automatic abort:** Victim transaction is automatically aborted and retried

Key types: `DeadlockDetector`, `WaitForGraph`, `DeadlockVictim`

---

### thunder-sql

SQL processing pipeline from text to optimized logical plan.

#### `parser.rs` -- SQL Parser

Parses SQL text into an abstract syntax tree (AST). Built on the `sqlparser` crate with ThunderDB-specific extensions:

- Standard SQL parsing (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)
- ThunderDB extensions (VECTOR SEARCH, CREATE ML MODEL, NLP QUERY)
- Error recovery with helpful diagnostics

Key types: `Parser`, `Statement`, `Expr`, `SelectStatement`, `ParseError`

#### `analyzer.rs` -- Semantic Analyzer

Performs semantic analysis on the parsed AST:

- **Name resolution:** Resolves table names, column references, and aliases against the catalog
- **Type checking:** Validates and infers types for expressions, function calls, and operators
- **Privilege checking:** Verifies the current user has permissions for the requested operations
- **Validation:** Checks constraints, foreign key references, and schema compatibility

Key types: `Analyzer`, `AnalyzedStatement`, `NameResolver`, `TypeChecker`

#### `optimizer.rs` -- Query Optimizer

Transforms logical query plans into optimized forms using cost-based optimization:

- **Predicate pushdown:** Moves filter predicates closer to data sources
- **Projection pushdown:** Eliminates unnecessary columns early
- **Join reordering:** Explores join orders using dynamic programming for small join counts, greedy for large
- **Cost model:** Estimates I/O cost, CPU cost, and memory usage based on catalog statistics
- **Rule-based optimization:** Applies heuristic transformations (constant folding, predicate simplification)
- **Subquery decorrelation:** Converts correlated subqueries to joins where possible

Key types: `Optimizer`, `LogicalPlan`, `OptimizationRule`, `CostModel`, `Statistics`

#### `planner.rs` -- Query Planner

Converts optimized logical plans to physical execution plans:

- **Physical operator selection:** Chooses between hash join vs. merge join vs. nested loop based on cost
- **Index selection:** Determines when to use index scans vs. full table scans
- **Parallelism planning:** Determines degree of parallelism and data partitioning strategy
- **Memory budgeting:** Allocates memory among operators for sort, hash, and aggregation buffers

Key types: `Planner`, `PhysicalPlan`, `PhysicalOperator`, `ExecutionStrategy`

#### `dialect.rs` (~45KB) -- Multi-Dialect SQL Support

Implements compatibility with multiple SQL dialects:

- **PostgreSQL dialect:** Compatible with PostgreSQL-specific syntax and functions
- **MySQL dialect:** MySQL-specific syntax, quoting rules, and function names
- **SQLite dialect:** SQLite compatibility for lightweight use cases
- **Standard SQL:** ANSI SQL:2016 compliance

Each dialect defines parsing rules, type mappings, function mappings, and behavioral differences.

Key types: `Dialect`, `PostgresDialect`, `MySqlDialect`, `SqliteDialect`, `StandardDialect`

#### `nlp.rs` (~38KB) -- Natural Language Processing

Enables querying ThunderDB using natural language:

- **Intent recognition:** Classifies user intent (query, insert, update, schema modification)
- **Entity extraction:** Identifies table names, column names, and values from natural language
- **SQL generation:** Converts structured intent into executable SQL
- **Disambiguation:** Interactive clarification when intent is ambiguous
- **Context management:** Maintains conversation context for follow-up queries

Key types: `NlpEngine`, `Intent`, `Entity`, `NlpContext`, `Disambiguation`

#### `llm.rs` (~23KB) -- LLM Integration

Integrates with large language models for advanced query generation:

- **Provider abstraction:** Pluggable LLM providers (OpenAI, Anthropic, local models)
- **Prompt engineering:** Schema-aware prompts for accurate SQL generation
- **Output validation:** Validates LLM-generated SQL against the schema before execution
- **Caching:** Caches LLM responses for repeated query patterns
- **Rate limiting:** Configurable rate limits per provider

Key types: `LlmEngine`, `LlmProvider`, `LlmRequest`, `LlmResponse`, `PromptTemplate`

#### `ml.rs` (~28KB) -- ML Operations

SQL-integrated machine learning operations:

- **Model management:** CREATE, TRAIN, EVALUATE, PREDICT SQL extensions
- **Feature engineering:** Built-in transformations (normalization, one-hot encoding, binning)
- **Algorithms:** Linear regression, logistic regression, decision trees, k-means clustering
- **Model storage:** Trained models stored in the catalog for persistence
- **Batch prediction:** Efficient batch inference using vectorized execution

Key types: `MlEngine`, `Model`, `TrainingConfig`, `Prediction`, `FeatureTransform`

#### `udf.rs` -- User-Defined Functions

Framework for registering and executing user-defined functions:

- **Scalar UDFs:** Functions that operate on a single row
- **Aggregate UDFs:** Functions that aggregate across multiple rows
- **Table UDFs:** Functions that return a table (table-valued functions)
- **WebAssembly UDFs:** Sandboxed execution of user-provided WASM modules

Key types: `UdfRegistry`, `ScalarUdf`, `AggregateUdf`, `TableUdf`, `WasmRuntime`

---

### thunder-query

The query execution engine that runs physical plans against the storage engine.

#### `executor.rs` (~60KB) -- Main Query Executor

The largest file in the codebase, implementing the core query execution framework:

- **Volcano model:** Iterator-based pull model for row-at-a-time execution
- **Vectorized execution:** Batch processing mode for analytical queries
- **Adaptive execution:** Runtime switching between row and batch modes based on query characteristics
- **Memory management:** Per-operator memory tracking with spill-to-disk capability
- **Cancellation:** Cooperative cancellation support for long-running queries
- **Progress tracking:** Real-time query progress reporting

Key types: `Executor`, `ExecutionContext`, `OperatorState`, `QueryResult`, `ExecutionStats`

#### `physical_plan.rs` (~38KB) -- Physical Operators

Defines all physical operators available for query execution:

- **Scan operators:** `SeqScan`, `IndexScan`, `IndexOnlyScan`, `BitmapScan`
- **Join operators:** `NestedLoopJoin`, `HashJoin`, `MergeJoin`, `IndexNestedLoopJoin`
- **Aggregation operators:** `HashAggregate`, `SortAggregate`, `StreamingAggregate`
- **Sort operators:** `ExternalSort` (with spill-to-disk), `TopN`
- **Set operators:** `Union`, `Intersect`, `Except`
- **DML operators:** `Insert`, `Update`, `Delete`
- **Utility operators:** `Limit`, `Offset`, `Project`, `Filter`, `Materialize`

Each operator implements the `PhysicalOperator` trait:
```rust
pub trait PhysicalOperator: Send + Sync {
    fn open(&mut self, ctx: &ExecutionContext) -> Result<()>;
    fn next(&mut self) -> Result<Option<Row>>;
    fn next_batch(&mut self) -> Result<Option<RecordBatch>>;
    fn close(&mut self) -> Result<()>;
    fn estimated_cost(&self) -> OperatorCost;
    fn children(&self) -> &[Box<dyn PhysicalOperator>];
}
```

#### `vectorized.rs` (~33KB) -- Vectorized Batch Processing

Implements vectorized execution for analytical workloads:

- **Arrow-based:** Uses Apache Arrow `RecordBatch` as the internal batch format
- **SIMD acceleration:** Leverages SIMD intrinsics for filter evaluation, aggregation, and comparison
- **Batch size tuning:** Adaptive batch sizes based on available memory and cache characteristics
- **Late materialization:** Defers tuple construction until necessary
- **Filter pushdown:** Evaluates filters on compressed/encoded data where possible

Key types: `VectorizedExecutor`, `BatchOperator`, `FilterMask`, `AggregateAccumulator`

#### `parallel.rs` (~35KB) -- Multi-Threaded Execution

Implements intra-query and inter-query parallelism:

- **Exchange operators:** `HashPartition`, `RoundRobin`, `Broadcast` for data redistribution
- **Pipeline parallelism:** Multiple operators execute concurrently in a pipeline
- **Partition-parallel execution:** Same operator runs on multiple partitions simultaneously
- **Work stealing:** Idle threads steal work from busy threads for load balancing
- **Resource management:** Per-query thread pools with configurable limits

Key types: `ParallelExecutor`, `Exchange`, `Pipeline`, `WorkerPool`, `PartitionState`

---

### thunder-protocol

Wire protocol implementations for client compatibility.

#### `postgres.rs` (~54KB) -- PostgreSQL Wire Protocol

Full implementation of the PostgreSQL v3 frontend/backend protocol:

- **Startup sequence:** SSL negotiation, authentication (password, MD5, SCRAM-SHA-256), parameter exchange
- **Simple query:** Parse, execute, and return results for text queries
- **Extended query:** Prepare, bind, describe, execute flow for parameterized queries
- **Copy protocol:** COPY IN/OUT for bulk data loading and extraction
- **Type system mapping:** PostgreSQL OID to ThunderDB type mapping
- **Error and notice messages:** PostgreSQL-compatible error codes and messages
- **Cancellation:** Query cancellation via cancel key

Compatible with `psql`, `libpq`, JDBC (`pgjdbc`), Python (`psycopg2`, `asyncpg`), Go (`pgx`), and other PostgreSQL client libraries.

Key types: `PostgresProtocol`, `PostgresMessage`, `PostgresSession`, `PostgresTypeMap`

#### `mysql.rs` (~36KB) -- MySQL Wire Protocol

Implementation of the MySQL client/server protocol:

- **Handshake:** Capability negotiation, authentication (native password, caching SHA2)
- **Command phase:** COM_QUERY, COM_STMT_PREPARE, COM_STMT_EXECUTE, COM_STMT_CLOSE
- **Result set protocol:** Column definitions, row data, EOF markers
- **Type system mapping:** MySQL type codes to ThunderDB types
- **Character set handling:** UTF-8 and other MySQL character set negotiations

Compatible with the `mysql` CLI, MySQL Connector/J, Python (`mysql-connector-python`, `PyMySQL`), and other MySQL client libraries.

Key types: `MysqlProtocol`, `MysqlPacket`, `MysqlSession`, `MysqlCapabilities`

#### `resp.rs` (~105KB) -- Redis RESP Protocol

The largest file in the entire codebase, implementing the Redis Serialization Protocol (RESP) for key-value and cache workloads:

- **RESP2 and RESP3:** Full support for both protocol versions
- **Command parsing:** Parses and dispatches all supported Redis commands
- **Data structure commands:** String, Hash, List, Set, Sorted Set, Stream operations
- **Pub/Sub:** Publish/Subscribe messaging
- **Lua scripting:** EVAL and EVALSHA commands with embedded Lua interpreter
- **Transaction commands:** MULTI/EXEC/DISCARD for Redis-style transactions
- **Cluster commands:** CLUSTER INFO, CLUSTER NODES for cluster-aware clients
- **Pipeline support:** Multiple commands in a single round trip
- **SQL bridge:** Translates Redis operations to underlying SQL/KV operations

Compatible with `redis-cli`, `redis-py`, `ioredis`, `jedis`, and other Redis client libraries.

Key types: `RespProtocol`, `RespValue`, `RespCommand`, `RedisSession`, `CommandDispatcher`

#### `session.rs` (~41KB) -- Session Management

Manages client sessions across all protocols:

- **Session lifecycle:** Creation, authentication, parameter setting, query execution, disconnection
- **Session state:** Current database, transaction state, prepared statements, portal cursors
- **Connection pooling:** Efficient session reuse for high-concurrency workloads
- **Idle timeout:** Automatic cleanup of idle sessions
- **Session variables:** Per-session configuration overrides

Key types: `SessionManager`, `Session`, `SessionState`, `SessionConfig`

#### `auth.rs` -- Authentication

Multi-method authentication:

- Password-based authentication (bcrypt, Argon2)
- SCRAM-SHA-256 (PostgreSQL SASL)
- X.509 certificate authentication
- LDAP integration
- JWT token validation

Key types: `Authenticator`, `AuthMethod`, `Credential`, `AuthResult`

#### `tls.rs` -- TLS/SSL

TLS transport security:

- TLS 1.2 and 1.3 support
- Certificate management and rotation
- SNI (Server Name Indication) support
- Mutual TLS (mTLS) for client certificate verification

Key types: `TlsConfig`, `TlsAcceptor`, `CertificateManager`

---

### thunder-api

HTTP-based API servers and the web administration dashboard.

#### `rest.rs` -- REST API Server

RESTful API built on `axum`:

- CRUD operations for databases, tables, and data
- Query execution endpoint
- Bulk import/export
- OpenAPI/Swagger documentation
- Content negotiation (JSON, CSV, Parquet)
- Pagination and cursor-based navigation

#### `grpc.rs` -- gRPC API Server

gRPC API built on `tonic`:

- Protobuf-defined service interfaces
- Streaming query results (server-side streaming)
- Bi-directional streaming for live data feeds
- Health checking service
- Reflection service for dynamic clients

#### `graphql.rs` -- GraphQL API Server

Auto-generated GraphQL API:

- Schema introspection
- Query, mutation, and subscription support
- Automatic schema generation from database tables
- N+1 query prevention with DataLoader pattern
- Depth and complexity limiting

#### `websocket.rs` -- WebSocket API Server

Real-time WebSocket API:

- Live query subscriptions (receive updates when query results change)
- Change stream subscriptions
- Binary and text message support
- Heartbeat and automatic reconnection

#### `dashboard.rs` (~40KB) -- Web Admin Dashboard

Embedded web administration interface:

- **Cluster overview:** Node health, topology, resource utilization
- **Query console:** Interactive SQL editor with syntax highlighting and autocomplete
- **Performance monitoring:** Real-time query latency, throughput, and resource metrics
- **Slow query log:** Identify and analyze slow queries
- **Schema browser:** Navigate databases, tables, indexes, and views
- **User management:** Create and manage users, roles, and permissions
- **Configuration editor:** View and modify server configuration
- **Backup management:** Initiate and monitor backup and restore operations

#### `handlers.rs` -- Request Handlers

Shared request handling logic for all API endpoints. Includes request parsing, parameter validation, result serialization, and error response formatting.

#### `auth.rs` -- API Authentication

API-specific authentication middleware:

- API key authentication
- OAuth 2.0 / OpenID Connect
- JWT bearer token validation
- Session-based authentication

#### `rate_limit.rs` -- Rate Limiting

Token bucket rate limiter:

- Per-user and per-IP rate limits
- Configurable burst and sustained rates
- Rate limit headers in responses (`X-RateLimit-*`)
- Distributed rate limiting via shared state in cluster mode

---

### thunder-server

The top-level binary crate that ties everything together.

#### `main.rs` -- Server Entry Point

The application entry point:

- **CLI argument parsing:** Uses `clap` for command-line interface:
  ```
  thunder-server [OPTIONS]
      --config <PATH>       Path to configuration file
      --data-dir <PATH>     Data directory
      --log-level <LEVEL>   Log level (trace, debug, info, warn, error)
      --bind <ADDR>         Bind address
      --cluster-join <ADDR> Join an existing cluster
      --init                Initialize a new database
      --version             Print version information
  ```
- **Signal handling:** Graceful shutdown on SIGTERM/SIGINT
- **Panic handling:** Custom panic hook for logging and crash reporting
- **Tokio runtime setup:** Configures the async runtime with appropriate thread counts

#### `engine.rs` -- Core Engine Coordination

The central coordination layer that initializes and connects all subsystems:

- **Startup sequence:** Catalog recovery, WAL replay, buffer pool initialization, cluster join
- **Shutdown sequence:** Graceful client disconnection, WAL flush, checkpoint, resource cleanup
- **Health monitoring:** Periodic health checks of all subsystems
- **Configuration reloading:** Dynamic configuration changes without restart

Key types: `Engine`, `EngineConfig`, `SubsystemHandle`

#### `workers.rs` -- Background Tasks

Long-running background tasks:

- **Checkpoint worker:** Periodic fuzzy checkpointing
- **Compaction worker:** Background compaction of storage files
- **Statistics worker:** Periodic collection of table and index statistics for the query optimizer
- **WAL archival worker:** Archiving old WAL segments
- **Garbage collection worker:** MVCC version garbage collection
- **Monitoring worker:** Metrics collection and export

Key types: `WorkerManager`, `Worker`, `WorkerConfig`

---

### thunder-cdc

#### Key Files
- **`cdc.rs`:** Core CDC engine that reads WAL records and converts them to change events
- **`publisher.rs`:** Publishes change events to downstream consumers (Kafka, Pulsar, webhooks)
- **`filter.rs`:** Table and column-level filtering for selective replication
- **`format.rs`:** Change event serialization (JSON, Avro, Protobuf)

---

### thunder-vector

#### Key Files
- **`index.rs`:** Vector index implementations (HNSW, IVF-Flat, IVF-PQ)
- **`search.rs`:** k-NN and approximate nearest neighbor search
- **`distance.rs`:** Distance functions (Euclidean, cosine, dot product, Hamming) with SIMD acceleration via `simsimd`
- **`embedding.rs`:** Embedding storage and retrieval

---

### thunder-fdw

#### Key Files
- **`wrapper.rs`:** Foreign data wrapper trait and registry
- **`postgres_fdw.rs`:** Foreign data wrapper for PostgreSQL
- **`mysql_fdw.rs`:** Foreign data wrapper for MySQL
- **`csv_fdw.rs`:** Foreign data wrapper for CSV files
- **`parquet_fdw.rs`:** Foreign data wrapper for Parquet files
- **`s3_fdw.rs`:** Foreign data wrapper for S3-compatible object storage

---

### thunder-client

#### Key Files
- **`client.rs`:** Main client API with builder pattern (`ClientBuilder`)
- **`connection.rs`:** Connection management and pooling
- **`query.rs`:** Query building and execution
- **`transaction.rs`:** Transaction lifecycle management
- **`stream.rs`:** Change stream subscription

## Key External Dependencies

ThunderDB relies on a curated set of high-quality external crates:

### Async Runtime and Networking
| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime (multi-threaded scheduler, I/O, timers, channels) |
| `axum` | HTTP framework for REST and WebSocket APIs |
| `tonic` | gRPC framework (client and server) |
| `tower` | Service abstractions and middleware (rate limiting, timeout, retry) |
| `hyper` | Low-level HTTP implementation (used by axum and tonic) |

### SQL and Data Processing
| Crate | Purpose |
|-------|---------|
| `sqlparser` | SQL parsing into AST |
| `arrow` | Apache Arrow columnar memory format |
| `datafusion` | Analytical query engine components |

### Storage
| Crate | Purpose |
|-------|---------|
| `rocksdb` | Embedded key-value store (used for metadata and auxiliary storage) |

### Distributed Systems
| Crate | Purpose |
|-------|---------|
| `raft` | Raft consensus protocol implementation |

### Concurrency
| Crate | Purpose |
|-------|---------|
| `crossbeam` | Lock-free data structures and utilities |
| `dashmap` | Concurrent hash map |
| `parking_lot` | Fast mutex and RwLock implementations |

### Vector and SIMD
| Crate | Purpose |
|-------|---------|
| `simsimd` | SIMD-accelerated vector distance functions |

### Serialization
| Crate | Purpose |
|-------|---------|
| `serde` | Serialization/deserialization framework |
| `serde_json` | JSON serialization |
| `prost` | Protocol Buffers (used by tonic for gRPC) |
| `bincode` | Compact binary serialization for internal use |

### Observability
| Crate | Purpose |
|-------|---------|
| `tracing` | Structured, async-aware logging and instrumentation |
| `tracing-subscriber` | Log formatting and filtering |
| `prometheus` | Metrics collection and export |

### Utilities
| Crate | Purpose |
|-------|---------|
| `clap` | CLI argument parsing |
| `chrono` | Date and time handling |
| `uuid` | UUID generation and parsing |
| `rust_decimal` | Arbitrary-precision decimal arithmetic |
| `bytes` | Efficient byte buffer management |
| `thiserror` | Derive macro for `std::error::Error` |
| `anyhow` | Flexible error type (used in tests and CLI) |

## Design Patterns

ThunderDB follows established Rust design patterns throughout the codebase. Understanding these patterns helps you write consistent, idiomatic contributions.

### Builder Pattern

Used extensively for constructing complex objects with many optional parameters:

```rust
// thunder-client/src/client.rs
let client = ClientBuilder::new()
    .host("localhost")
    .port(5432)
    .username("admin")
    .password("secret")
    .database("mydb")
    .pool_size(10)
    .connect_timeout(Duration::from_secs(5))
    .build()
    .await?;
```

The builder pattern is used for `ClientBuilder`, `ServerConfig`, `QueryBuilder`, `IndexBuilder`, and many other configuration objects.

### RAII for Resource Management

Resources are tied to object lifetimes, ensuring cleanup on drop:

```rust
// Buffer pool page handles automatically release the page on drop
{
    let page = buffer_pool.fetch_page(page_id).await?;
    // page is pinned in the buffer pool
    // ... use the page ...
}  // page is automatically unpinned when dropped

// Transaction handles automatically abort on drop if not committed
{
    let txn = engine.begin_transaction().await?;
    // ... perform operations ...
    txn.commit().await?;  // explicit commit
}  // if commit was not called, txn aborts on drop
```

### Interior Mutability

Shared mutable state is managed through interior mutability patterns:

```rust
// Arc<RwLock<T>> for shared state with read-heavy access
let catalog: Arc<RwLock<Catalog>> = Arc::new(RwLock::new(Catalog::new()));

// DashMap for concurrent hash maps (lock-free reads)
let sessions: DashMap<SessionId, Session> = DashMap::new();

// Arc<Mutex<T>> for exclusive-access shared state
let wal_writer: Arc<Mutex<WalWriter>> = Arc::new(Mutex::new(WalWriter::new()));
```

`DashMap` is preferred over `RwLock<HashMap>` when the map is accessed from many concurrent tasks and contention needs to be minimized.

### Type-State Pattern for Transactions

Transactions use the type-state pattern to enforce correct lifecycle at compile time:

```rust
// Transaction states are encoded in the type system
pub struct Transaction<S: TxnState> {
    id: TxnId,
    state: PhantomData<S>,
    // ...
}

pub struct Active;    // Transaction is active
pub struct Prepared;  // Transaction has been prepared (2PC)

impl Transaction<Active> {
    pub fn read(&self, key: &[u8]) -> Result<Value> { /* ... */ }
    pub fn write(&mut self, key: &[u8], value: Value) -> Result<()> { /* ... */ }
    pub fn commit(self) -> Result<()> { /* consumes self */ }
    pub fn abort(self) -> Result<()> { /* consumes self */ }
    pub fn prepare(self) -> Result<Transaction<Prepared>> { /* state transition */ }
}

impl Transaction<Prepared> {
    pub fn commit(self) -> Result<()> { /* ... */ }
    pub fn abort(self) -> Result<()> { /* ... */ }
    // Cannot call read() or write() on a Prepared transaction -- compile error!
}
```

This prevents misuse like writing to a prepared transaction or preparing a transaction twice.

### Visitor Pattern in SQL Optimizer

The SQL optimizer uses the visitor pattern to traverse and transform query plan trees:

```rust
pub trait PlanVisitor {
    fn pre_visit(&mut self, plan: &LogicalPlan) -> Result<bool>;
    fn post_visit(&mut self, plan: &LogicalPlan) -> Result<bool>;
}

pub trait PlanRewriter {
    fn rewrite(&mut self, plan: LogicalPlan) -> Result<LogicalPlan>;
}

// Example: Predicate pushdown implemented as a visitor
struct PredicatePushdown;

impl PlanRewriter for PredicatePushdown {
    fn rewrite(&mut self, plan: LogicalPlan) -> Result<LogicalPlan> {
        match plan {
            LogicalPlan::Filter { predicate, input } => {
                // Try to push predicate down into the input node
                self.push_predicate_down(predicate, *input)
            }
            _ => Ok(plan),
        }
    }
}
```

Each optimization rule is implemented as a separate visitor/rewriter, making it easy to add new optimizations independently.

### Error Propagation Pattern

Errors use the `thiserror` crate for derived `Error` implementations and the `?` operator for propagation:

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("page {0} not found")]
    PageNotFound(PageId),

    #[error("WAL write failed: {0}")]
    WalWriteFailed(#[from] std::io::Error),

    #[error("checksum mismatch on page {page_id}: expected {expected}, got {actual}")]
    ChecksumMismatch {
        page_id: PageId,
        expected: u32,
        actual: u32,
    },
}

// Errors propagate cleanly with ?
fn read_page(&self, page_id: PageId) -> Result<Page, StorageError> {
    let data = self.disk.read(page_id)?;  // io::Error -> StorageError via From
    let page = Page::from_bytes(&data)?;
    page.verify_checksum()?;
    Ok(page)
}
```

## Where to Start

If you are new to the codebase, here is a recommended exploration path:

1. **Start with `thunder-common/src/types.rs`** to understand the fundamental types.
2. **Read `thunder-common/src/error.rs`** to see how errors are structured.
3. **Explore `thunder-storage/src/page.rs`** to understand the page format.
4. **Read `thunder-storage/src/wal.rs`** (at least the public API) to understand durability.
5. **Trace a simple query** from `thunder-sql/src/parser.rs` through `analyzer.rs`, `optimizer.rs`, `planner.rs`, and into `thunder-query/src/executor.rs`.
6. **Read `thunder-protocol/src/postgres.rs`** to see how client connections are handled.
7. **Finally, read `thunder-server/src/main.rs`** and `engine.rs` to see how everything is wired together.

This path takes you from the foundations through the storage engine, query processing pipeline, protocol handling, and finally the server orchestration layer.
