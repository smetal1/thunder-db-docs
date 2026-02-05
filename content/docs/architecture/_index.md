---
title: "Architecture"
linkTitle: "Architecture"
weight: 2
description: >
  Deep dive into ThunderDB's system architecture, components, and design decisions.
---

## 1. System Overview

ThunderDB is a distributed Hybrid Transactional/Analytical Processing (HTAP) database written entirely in Rust. The codebase spans approximately 75,600 lines of code organized across 14 crates, each responsible for a distinct subsystem. ThunderDB is designed to serve both OLTP and OLAP workloads from a single system, eliminating the need for separate databases and the ETL pipelines that connect them.

The system follows a layered architecture where each layer has well-defined responsibilities and communicates with adjacent layers through clean interfaces. The following diagram illustrates the complete stack:

```
+===========================================================================+
|                            CLIENT LAYER                                   |
|  +------------------+  +------------------+  +-------------------------+  |
|  | PostgreSQL/MySQL  |  |  Native Driver   |  |  MCP (Model Context    |  |
|  | Compatible Tools  |  |  (Rust Client)   |  |  Protocol)             |  |
|  +--------+---------+  +--------+---------+  +------------+------------+  |
+===========|======================|=========================|==============+
            |                      |                         |
+===========v======================v=========================v==============+
|                           PROTOCOL LAYER                                  |
|  +----------------+ +----------------+ +-----------+ +------------------+ |
|  | PostgreSQL v3  | | MySQL 4.1+     | | RESP2/3   | | Session Mgmt    | |
|  | Wire Protocol  | | Wire Protocol  | | (Redis)   | | Auth & TLS      | |
|  | (54KB)         | | (36KB)         | | (105KB)   | | (41KB)          | |
|  +-------+--------+ +-------+--------+ +-----+-----+ +--------+--------+ |
+=========================================================================--+
            |                      |                |              |
+===========v======================v================v==============v========+
|                             API LAYER                                     |
|  +----------+ +----------+ +-----------+ +------------+ +---------------+ |
|  |  REST    | |  gRPC    | | GraphQL   | | WebSocket  | | Web Dashboard | |
|  |  (axum)  | |  (tonic) | | (async-   | | (live      | | (40KB)        | |
|  |          | |          | |  graphql) | |  queries)  | |               | |
|  +----+-----+ +----+-----+ +-----+-----+ +-----+------+ +------+-------+ |
+=======|============|==============|=============|===============|=========+
        |            |              |             |               |
+=======v============v==============v=============v===============v=========+
|                         INTEGRATION LAYER                                 |
|  +-----------------------------------+ +--------------------------------+ |
|  |  CDC (Change Data Capture)        | | FDW (Foreign Data Wrappers)    | |
|  |  - PostgreSQL (logical repl.)     | | - Query external PostgreSQL    | |
|  |  - MySQL (binlog)                 | | - Query external MySQL         | |
|  |  - MongoDB (change streams)       | | - Query external MongoDB       | |
|  |  - Redis (keyspace notifications) | | - Query external Redis         | |
|  +-----------------------------------+ | - Predicate pushdown           | |
|                                        +--------------------------------+ |
+===========================================================================+
            |                                          |
+===========v==========================================v====================+
|                            SQL LAYER                                      |
|  +----------+  +-----------+  +-----------+  +----------+  +-----------+  |
|  | Parser   |  | Analyzer  |  | Optimizer |  | Planner  |  | NLP / LLM |  |
|  | (sqlpar- |  | (semantic |  | (cost-    |  | (logical |  | (llama.   |  |
|  |  ser)    |  |  valid.)  |  |  based)   |  |  -> phys)|  |  cpp)     |  |
|  +----+-----+  +-----+-----+  +-----+-----+  +----+-----+  +-----+-----+ |
+=======|==============|===============|==============|==============|======+
        |              |               |              |              |
+=======v==============v===============v==============v==============v======+
|                         EXECUTION LAYER                                   |
|  +------------------------+ +---------------------+ +-------------------+ |
|  | Vectorized Execution   | | Parallel Execution  | | Physical Plan     | |
|  | (33KB, 1024+ batches)  | | (35KB, multi-thread)| | Operators (38KB)  | |
|  +------------------------+ +---------------------+ +-------------------+ |
+===========================================================================+
            |
+===========v===============================================================+
|                        TRANSACTION LAYER                                  |
|  +---------+ +----------+ +----------+ +-------------+ +---------------+  |
|  |  MVCC   | |   CCP    | |   2PC    | |  Deadlock   | | Lock Manager  |  |
|  | Snapshot | | Optimis- | | Distrib. | |  Detection  | | (row/table/   |  |
|  | Isolat.  | | tic CC   | | Coord.   | | (wait-for)  | |  intent)      |  |
|  +---------+ +----------+ +----------+ +-------------+ +---------------+  |
+===========================================================================+
            |
+===========v===============================================================+
|                          STORAGE LAYER                                    |
|  +-----------+ +------------+ +-------------+ +-----------+ +-----------+ |
|  | Row Store | | Column     | | Vector      | | Buffer    | | WAL       | |
|  | (OLTP)    | | Store      | | Store       | | Pool      | | (ARIES)   | |
|  |           | | (OLAP)     | | (HNSW/IVF)  | | (LRU)     | |           | |
|  +-----------+ +------------+ +-------------+ +-----------+ +-----------+ |
|  +-----------+ +--------------+ +--------------------+                    |
|  | B+Tree    | | Page Manager | | Compression        |                    |
|  | Indexes   | | (16KB pages) | | (LZ4/Snappy/Zstd)  |                    |
|  +-----------+ +--------------+ +--------------------+                    |
+===========================================================================+
            |
+===========v===============================================================+
|                          CLUSTER LAYER                                    |
|  +----------+ +-------------+ +-------------+ +-----------+ +-----------+ |
|  | Raft     | | Region-     | | Replication | | Auto-     | | gRPC      | |
|  | Consen-  | | Based       | | (config.    | | Rebalance | | Transport | |
|  | sus      | | Sharding    | |  factor)    | |           | |           | |
|  +----------+ +-------------+ +-------------+ +-----------+ +-----------+ |
+===========================================================================+
```

---

## 2. Crate Architecture

ThunderDB is organized into 14 Rust crates within a Cargo workspace. Each crate encapsulates a distinct subsystem with explicit dependency boundaries. This modularity allows independent development, testing, and potential future extraction of components.

| Crate | Purpose | Key Details |
|---|---|---|
| `thunder-common` | Shared types and infrastructure | `DatabaseId`, `TableId`, `ColumnId`, `RowId`, `PageId`, `TxnId`, and other strongly-typed identifiers. Configuration management, error hierarchy, RBAC (role-based access control), audit logging, and metrics collection (Prometheus-compatible). |
| `thunder-storage` | Storage engine | WAL with ARIES-style recovery (67KB), flash-optimized B+Tree with 256+ fanout (29KB), LRU buffer pool, row store, column store, compression (LZ4, Snappy, Zstd, RLE, Delta, Dictionary encoding), and page management with 16KB pages. |
| `thunder-txn` | Transaction management | MVCC snapshot isolation, CCP (Cooperative Concurrency Protocol) for optimistic concurrency, 2PC distributed transaction coordinator, hierarchical lock manager, and wait-for graph deadlock detection. |
| `thunder-sql` | SQL processing | PostgreSQL dialect parser via `sqlparser` crate, semantic analyzer, cost-based optimizer with rule transformations, logical and physical planner, NLP integration (38KB), LLM integration via llama.cpp (23KB), ML operations (28KB), UDF support, multi-dialect support (45KB). |
| `thunder-query` | Query execution | Executor engine (60KB), physical plan operators (38KB), vectorized execution with 1024+ row batches (33KB), parallel execution across multiple threads (35KB). |
| `thunder-cluster` | Distributed clustering | Raft consensus protocol, region-based sharding with range partitioning, membership management, health checking via heartbeats, configurable replication, gRPC-based inter-node transport. |
| `thunder-protocol` | Wire protocols | PostgreSQL v3 extended query protocol (54KB), MySQL 4.1+ binary protocol (36KB), RESP2/3 Redis protocol (105KB), session management (41KB), authentication (MD5, SCRAM-SHA-256, MySQL native password), TLS termination. |
| `thunder-vector` | Vector indexing | HNSW (Hierarchical Navigable Small World) and IVF (Inverted File Index) algorithms, multiple distance metrics (L2, cosine, inner product), scalar/product quantization, SIMD acceleration via `simsimd`. |
| `thunder-api` | API servers | REST via `axum`, gRPC via `tonic`, GraphQL via `async-graphql`, WebSocket for live query subscriptions, embedded web dashboard (40KB), JWT/API-key authentication, token-bucket rate limiting. |
| `thunder-cdc` | Change Data Capture | PostgreSQL logical replication decoding, MySQL binlog parsing, MongoDB change stream consumption, Redis keyspace notification listeners. Real-time ingestion from external sources. |
| `thunder-fdw` | Foreign Data Wrappers | Query federation across external PostgreSQL, MySQL, MongoDB, and Redis instances. Supports predicate pushdown, projection pruning, and cost estimation for remote tables. |
| `thunder-server` | Main server binary | Engine coordination, background workers (vacuum, checkpoint, statistics collection, region balancing), signal handling, graceful shutdown orchestration. |
| `thunder-client` | Native Rust client | Async connection pool (`bb8`-based), prepared statement caching, transaction helpers, automatic retry with exponential backoff, connection health monitoring. |

### Dependency Graph

```
thunder-server
  +-- thunder-api
  |     +-- thunder-sql
  |     +-- thunder-query
  |     +-- thunder-common
  +-- thunder-protocol
  |     +-- thunder-sql
  |     +-- thunder-common
  +-- thunder-sql
  |     +-- thunder-query
  |     +-- thunder-txn
  |     +-- thunder-common
  +-- thunder-query
  |     +-- thunder-storage
  |     +-- thunder-txn
  |     +-- thunder-vector
  |     +-- thunder-common
  +-- thunder-txn
  |     +-- thunder-storage
  |     +-- thunder-common
  +-- thunder-storage
  |     +-- thunder-common
  +-- thunder-cluster
  |     +-- thunder-storage
  |     +-- thunder-txn
  |     +-- thunder-common
  +-- thunder-cdc
  |     +-- thunder-storage
  |     +-- thunder-common
  +-- thunder-fdw
  |     +-- thunder-sql
  |     +-- thunder-common
  +-- thunder-vector
        +-- thunder-storage
        +-- thunder-common
```

---

## 3. Storage Engine

The storage engine is the foundation of ThunderDB, responsible for durable, efficient data storage and retrieval. It implements a page-based architecture with both row-oriented and column-oriented storage, unified through the fractured mirror design.

### 3.1 Page-Based Storage

All data in ThunderDB is organized into fixed-size **16KB (16,384 byte) pages**. Using a fixed page size simplifies buffer pool management, aligns with common OS page sizes and SSD block sizes, and allows direct I/O.

**Page Header Format (25 bytes):**

```
+----------+----------+------+----------+----------------+------------+
|  PageId  |   LSN    | Type | Checksum | Free Space Ptr | Slot Count |
|  (8B)    |  (8B)    | (1B) |  (4B)    |     (2B)       |    (2B)    |
+----------+----------+------+----------+----------------+------------+
 0          8         16     17         21               23           25

PageId (8 bytes)       - Unique identifier for the page within the tablespace
LSN (8 bytes)          - Log Sequence Number of the last modification
Type (1 byte)          - Page type: 0x01=Data, 0x02=Index, 0x03=Overflow,
                         0x04=FreeSpaceMap, 0x05=ColumnSegment
Checksum (4 bytes)     - CRC32 checksum of the page contents for corruption detection
Free Space Ptr (2 bytes) - Offset to the start of free space within the page
Slot Count (2 bytes)   - Number of active slots (row pointers) in the page
```

### 3.2 Row Store (OLTP-Optimized)

The row store is the primary storage format for transactional workloads. It uses a **slotted page** layout where each page contains a header, a slot directory growing forward, and tuple data growing backward.

```
+-----------------------------------------------------------------------+
|                         Page Header (25B)                             |
+-----------------------------------------------------------------------+
| Slot 0 | Slot 1 | Slot 2 | ... | Slot N |  ---> free space <---     |
| (off,  | (off,  | (off,  |     | (off,  |                           |
|  len,  |  len,  |  len,  |     |  len,  |                           |
|  flags)|  flags)|  flags)|     |  flags)|                           |
+-----------------------------------------------------------------------+
|                        FREE SPACE                                     |
+-----------------------------------------------------------------------+
|  Tuple N  |  ...  |  Tuple 2  |  Tuple 1  |  Tuple 0  |             |
|  (data)   |       |  (data)   |  (data)   |  (data)   |             |
+-----------------------------------------------------------------------+
```

Each **slot directory entry** is 6 bytes: offset (2B) + length (2B) + flags (2B). Flags encode the tuple's visibility and state.

**Tuple Header (per row):**

| Field | Size | Description |
|---|---|---|
| `xmin` | 8B | Transaction ID that created this tuple version |
| `xmax` | 8B | Transaction ID that deleted/updated this tuple (0 if alive) |
| `t_ctid` | 6B | Current tuple ID (page + slot), points to newer version on update |
| `t_infomask` | 2B | Visibility flags, null bitmap indicator, HOT update flag |
| `t_hoff` | 1B | Offset to user data (accounts for null bitmap) |

**Key operations:**
- **In-place update**: When possible (same-size or smaller tuple), the row is updated directly in the same slot, avoiding HOT chain creation.
- **Tombstone deletion**: Rather than physically removing data, `xmax` is set to the deleting transaction's ID. The tuple becomes invisible to new snapshots.
- **Free space map (FSM)**: A secondary structure tracks free space per page, enabling efficient insertion without scanning every page.
- **Vacuum**: Background process reclaims space from dead tuples (those invisible to all active transactions), compacts pages, and updates the FSM.

### 3.3 Column Store (OLAP-Optimized)

The column store is designed for analytical queries that scan large numbers of rows but only a few columns. Data is organized into **column segments**, each storing values for a single column of a row group.

```
+----------------------------------------------------------------------+
|  Column Segment Header                                               |
|  - Column ID, Row Group ID, Row Count, Compression Type              |
|  - Min/Max values (zone map), Null Count, Distinct Count             |
+----------------------------------------------------------------------+
|  Null Bitmap (1 bit per row, RLE-compressed)                         |
+----------------------------------------------------------------------+
|  Compressed Data                                                     |
|  (LZ4 / Snappy / Zstd / RLE / Delta / Dictionary)                   |
+----------------------------------------------------------------------+
|  Optional: Dictionary Page (for dictionary encoding)                 |
+----------------------------------------------------------------------+
```

**Compression strategies** are chosen automatically based on column statistics:

| Strategy | Best For | Ratio |
|---|---|---|
| LZ4 | General purpose, fast decompression | 2-4x |
| Snappy | Low-latency reads | 1.5-3x |
| Zstd | High compression archival data | 3-10x |
| RLE (Run-Length Encoding) | Low cardinality, sorted columns | 10-100x |
| Delta Encoding | Timestamps, sequential integers | 5-20x |
| Dictionary Encoding | String columns with < 64K distinct values | 3-15x |

**Column statistics** (zone maps) are maintained per segment and include min/max values, null count, and distinct count. These allow the query engine to skip entire segments during scans (segment elimination).

### 3.4 Fractured Mirror (HTAP Design)

ThunderDB achieves HTAP by maintaining both row-oriented and column-oriented copies of data through a **fractured mirror** architecture. This avoids the traditional approach of ETL pipelines between separate OLTP and OLAP systems.

```
                     +------ WRITE PATH ------+
                     |                        |
                     v                        |
               +-----------+                  |
               | Row Store |  <-- primary     |
               | (OLTP)    |     for writes   |
               +-----+-----+                  |
                     |                        |
            async propagation                 |
            (background worker)               |
                     |                        |
                     v                        |
            +--------------+                  |
            | Column Store |  <-- derived     |
            | (OLAP)       |     from rows    |
            +--------------+                  |
                                              |
  OLTP queries ---> Row Store (latest data)   |
  OLAP queries ---> Column Store (near-real-time, seconds of lag)
```

**Propagation mechanism:**
1. Writes always go to the row store first (the source of truth for transactions).
2. A background worker reads committed changes from the WAL.
3. Changes are batched into row groups (typically 64K-128K rows).
4. Row groups are compressed column-by-column and written to the column store.
5. Column statistics (zone maps) are updated.
6. The propagation LSN is advanced, allowing old WAL segments to be recycled.

**Consistency guarantee:** The column store may lag behind the row store by a small window (typically seconds). OLAP queries that require absolute freshness can opt to fall back to the row store or merge results from both stores.

### 3.5 B+Tree Indexes

ThunderDB uses **flash-optimized B+Tree** indexes with a high fanout of **256+ keys per node**, minimizing tree height and random I/O on SSDs.

```
                         +------------------+
                         |   Root Node      |
                         | [K50 | K150]     |
                         +--/-------|---\---+
                        /           |        \
           +-----------+    +-------+-----+   +------------+
           | Internal  |    |  Internal   |   |  Internal  |
           | [K10|K30] |    | [K80|K120]  |   | [K180|K220]|
           +--/---|--\-+    +--/---|---\--+   +--/---|---\-+
          /    |    \      /    |      \     /    |      \
        +--+ +--+ +--+  +--+ +--+  +--+  +--+ +--+  +--+
        |L1| |L2| |L3|  |L4| |L5|  |L6|  |L7| |L8|  |L9|
        +--+-+--+-+--+--+--+-+--+--+--+--+--+-+--+--+--+
         <->   <->  <->  <->  <->  <->  <->  <->  <->
               Doubly-linked leaf node chain
```

**Key features:**
- **High fanout (256+):** Reduces tree height to 2-3 levels for most datasets, meaning most lookups require at most 2-3 page reads.
- **Linked leaf nodes:** Enable efficient range scans by following sibling pointers without traversing back up the tree.
- **Latch coupling (crabbing):** Concurrent access uses a top-down latch coupling protocol: acquire child latch before releasing parent latch, ensuring structural consistency without holding the root latch during the entire operation.
- **Prefix compression:** Common key prefixes within a node are stored once, increasing the effective fanout for string keys.
- **Bulk loading:** Sorted data can be loaded bottom-up, constructing the tree from leaf level to root for optimal space utilization and minimal I/O.

### 3.6 Buffer Pool

The buffer pool is an in-memory cache of disk pages that sits between the execution engine and the file system. All page accesses go through the buffer pool.

```
  +---------------------------------------------------------------------+
  |                        Buffer Pool                                  |
  |  +--------+  +--------+  +--------+  +--------+  +--------+        |
  |  | Frame  |  | Frame  |  | Frame  |  | Frame  |  | Frame  |  ...   |
  |  | Page:5 |  | Page:12|  | Page:3 |  | Page:42|  | Page:7 |        |
  |  | Pin:2  |  | Pin:0  |  | Pin:1  |  | Pin:0  |  | Pin:3  |        |
  |  | Dirty:N|  | Dirty:Y|  | Dirty:N|  | Dirty:Y|  | Dirty:N|        |
  |  +--------+  +--------+  +--------+  +--------+  +--------+        |
  |                                                                     |
  |  Page Table (HashMap<PageId, FrameId>)                              |
  |  LRU List: [Frame 1] <-> [Frame 3] <-> ... <-> [Frame N]           |
  |  Free List: [Frame 6, Frame 9, ...]                                 |
  +---------------------------------------------------------------------+
```

| Property | Description |
|---|---|
| Eviction Policy | LRU (Least Recently Used); pinned pages are never evicted |
| Page Pinning | Reference-counted; a page is pinned while any thread holds a reference |
| Dirty Tracking | Pages modified in memory are marked dirty; flushed on eviction or checkpoint |
| Configurable Size | Default 256MB; tunable via `buffer_pool_size` in configuration |
| Pre-fetching | Sequential scan detection triggers asynchronous pre-fetch of upcoming pages |

### 3.7 WAL (Write-Ahead Log)

The WAL implements **ARIES-style** (Algorithm for Recovery and Isolation Exploiting Semantics) recovery to guarantee durability and atomicity. Every modification is first recorded in the WAL before being applied to data pages.

**WAL Record Types:**

| Record Type | Code | Description |
|---|---|---|
| `BeginTxn` | 0x01 | Transaction started |
| `Insert` | 0x02 | Row inserted (contains full tuple) |
| `Update` | 0x03 | Row updated (contains before/after images) |
| `Delete` | 0x04 | Row deleted (contains before image) |
| `Commit` | 0x05 | Transaction committed |
| `Abort` | 0x06 | Transaction aborted |
| `Checkpoint` | 0x07 | Fuzzy checkpoint marker with dirty page table and active txn table |
| `CLR` | 0x08 | Compensation Log Record (undo of an undo, prevents repeated undo) |
| `PageSplit` | 0x09 | B+Tree page split operation |
| `PageMerge` | 0x0A | B+Tree page merge operation |
| `CreateTable` | 0x0B | DDL: table creation |
| `DropTable` | 0x0C | DDL: table deletion |

**WAL file structure:**

```
  WAL Directory
  +-- segment_000000000001.wal  (64MB)
  +-- segment_000000000002.wal  (64MB)
  +-- segment_000000000003.wal  (64MB, active)
  +-- checkpoint.meta

  Each segment:
  +---------------------------------------------------------------+
  | Segment Header: magic(4B), version(2B), segment_id(8B)       |
  +---------------------------------------------------------------+
  | Record 1: LSN(8B) | TxnId(8B) | Type(1B) | Len(4B) | Data   |
  | Record 2: LSN(8B) | TxnId(8B) | Type(1B) | Len(4B) | Data   |
  | ...                                                           |
  +---------------------------------------------------------------+
```

**Group commit:** Multiple transactions waiting to commit are batched into a single `fsync` call, amortizing the cost of durable writes across many transactions. This dramatically improves throughput under concurrent workloads.

**Three-Phase Recovery:**

1. **Analysis Phase:** Scan the WAL forward from the last checkpoint. Reconstruct the dirty page table (which pages had uncommitted modifications) and the active transaction table (which transactions were in-flight).

2. **Redo Phase:** Scan the WAL forward again, re-applying all logged operations to bring pages up to date. For each record, compare the page's LSN with the record's LSN; skip if the page is already current. This restores the database to its exact state at the moment of the crash.

3. **Undo Phase:** Scan the WAL backward, undoing all operations from transactions that were active (uncommitted) at crash time. CLR records are written during undo to ensure idempotency if the system crashes again during recovery.

---

## 4. Transaction Processing

### 4.1 MVCC (Multi-Version Concurrency Control)

ThunderDB implements MVCC to provide **lock-free reads**. Each row may have multiple versions, identified by `xmin` (creating transaction) and `xmax` (deleting transaction). A read transaction takes a snapshot at its start time and sees only versions committed before that snapshot.

```
  Snapshot at T=100 sees:

  Version 1: xmin=50  xmax=80   -> INVISIBLE (deleted before snapshot)
  Version 2: xmin=80  xmax=0    -> VISIBLE   (created before snapshot, not deleted)
  Version 3: xmin=110 xmax=0    -> INVISIBLE (created after snapshot)
```

**Visibility rules** (simplified):
- A tuple is visible if `xmin` is committed AND `xmin < snapshot_txn_id` AND (`xmax` is zero OR `xmax` is not committed OR `xmax > snapshot_txn_id`).

### 4.2 CCP (Cooperative Concurrency Protocol)

For write-write conflicts, ThunderDB implements an optimistic concurrency control protocol called CCP. Transactions proceed without acquiring locks during their execution phase. At commit time, a validation phase checks whether any read-write or write-write conflicts occurred.

**CCP phases:**
1. **Read Phase:** Transaction reads from its snapshot and writes to a private workspace.
2. **Validation Phase:** At commit time, check if any tuple read by this transaction was modified by a concurrent committed transaction.
3. **Write Phase:** If validation succeeds, apply all writes atomically. If it fails, abort and retry.

### 4.3 Distributed Transactions (2PC)

For transactions that span multiple nodes (regions), ThunderDB uses Two-Phase Commit (2PC) with an elected coordinator.

```
  Coordinator                Participant A          Participant B
      |                           |                       |
      |--- PREPARE -------------->|                       |
      |--- PREPARE ---------------------------------------->|
      |                           |                       |
      |<-- VOTE YES --------------|                       |
      |<-- VOTE YES ----------------------------------------|
      |                           |                       |
      |--- COMMIT --------------->|                       |
      |--- COMMIT ----------------------------------------->|
      |                           |                       |
      |<-- ACK -------------------|                       |
      |<-- ACK --------------------------------------------|
```

**Failure handling:**
- If any participant votes NO, the coordinator sends ABORT to all.
- If the coordinator crashes after PREPARE but before COMMIT, participants hold locks until the coordinator recovers (or a new coordinator is elected via Raft).
- WAL records are written at each phase boundary for crash recovery.

### 4.4 Deadlock Detection

The lock manager maintains a **wait-for graph** where nodes represent transactions and edges represent "waits for" relationships. A background thread periodically traverses this graph looking for cycles.

**Victim selection criteria (in priority order):**
1. Transaction with the least amount of work done (fewest WAL records).
2. Transaction that holds the fewest locks.
3. Youngest transaction (highest TxnId).

### 4.5 Isolation Levels

| Level | Dirty Read | Non-Repeatable Read | Phantom | Implementation |
|---|---|---|---|---|
| Read Committed | No | Possible | Possible | New snapshot per statement |
| Repeatable Read | No | No | Possible | Single snapshot for entire transaction |
| Serializable | No | No | No | Snapshot + predicate locks (SSI) |

### 4.6 TxnId Format

Transaction IDs are 64-bit values with embedded metadata for distributed coordination:

```
  +---------------------------------------------------+----------+----------+
  |        Timestamp (48 bits)                         | Node ID  | Sequence |
  |        Milliseconds since epoch                    | (8 bits) | (8 bits) |
  +---------------------------------------------------+----------+----------+
   63                                                16 15       8 7        0

  - 48-bit timestamp: ~8,900 years of unique timestamps
  - 8-bit node ID:    Up to 256 nodes in the cluster
  - 8-bit sequence:   Up to 256 transactions per millisecond per node
```

This format allows **global ordering** of transactions without centralized coordination. Any node can generate unique, monotonically increasing TxnIds independently.

---

## 5. Query Processing Pipeline

Every SQL query in ThunderDB passes through a five-stage pipeline before results are returned to the client.

```
  SQL Text
    |
    v
  +----------+     AST       +-----------+   Bound AST   +-----------+
  |  Parser  | ------------> | Analyzer  | ------------> | Optimizer |
  | (sqlpar- |               | (semantic |               | (cost-    |
  |  ser)    |               |  checks)  |               |  based)   |
  +----------+               +-----------+               +-----------+
                                                              |
                                                        Logical Plan
                                                              |
                                                              v
                                                        +-----------+
                                                        | Planner   |
                                                        | (physical |
                                                        |  plan)    |
                                                        +-----------+
                                                              |
                                                        Physical Plan
                                                              |
                                                              v
                                                        +-----------+
                                                        | Executor  | ---> Results
                                                        | (vector-  |
                                                        |  ized)    |
                                                        +-----------+
```

### 5.1 Parser

The parser uses the `sqlparser` crate configured for the **PostgreSQL dialect**. It tokenizes the SQL input and constructs an Abstract Syntax Tree (AST). Multi-dialect support (45KB) enables alternative syntax acceptance for MySQL and Redis-style commands.

### 5.2 Analyzer

The semantic analyzer resolves table and column references against the catalog, performs type checking and implicit type coercion, validates function signatures, resolves aliases, and checks permissions against the RBAC policy.

### 5.3 Optimizer

The cost-based optimizer transforms logical plans to minimize estimated execution cost.

**Rule-based transformations:**
- Predicate pushdown (push filters below joins)
- Projection pruning (eliminate unused columns early)
- Constant folding (evaluate constant expressions at compile time)
- Subquery decorrelation (convert correlated subqueries to joins)
- Common subexpression elimination

**Cost-based decisions:**
- **Join ordering:** Dynamic programming for small join counts (< 10 tables), greedy heuristic for large join graphs.
- **Index selection:** Compare sequential scan cost vs. index scan cost using selectivity estimates from column statistics (histograms, distinct counts, null fractions).
- **Join algorithm selection:** Nested loop (small inner), hash join (equi-joins), sort-merge join (sorted inputs or large datasets).
- **Scan type:** Row store scan for point queries and small ranges, column store scan for full-table analytics.

### 5.4 Planner

The planner converts the optimized logical plan into a physical plan by selecting concrete operator implementations. For example, a logical "Join" becomes a physical "HashJoin" or "MergeSortJoin".

### 5.5 Execution

The executor implements a **Volcano-style iterator model** enhanced with **vectorized processing**:

- **Batch size:** 1024+ rows per batch (configurable). Processing data in batches amortizes function call overhead and enables SIMD optimizations.
- **Parallel execution:** The executor can partition work across multiple threads. Parallel hash joins, parallel scans, and parallel aggregations are supported. The degree of parallelism is auto-tuned based on available CPU cores and data size.
- **Physical operators:** SeqScan, IndexScan, Filter, Project, HashJoin, MergeSortJoin, NestedLoopJoin, HashAggregate, SortAggregate, Sort, Limit, TopN, Union, Intersect, Except, Insert, Update, Delete, CreateTable, and more.

### 5.6 NLP & LLM Integration

ThunderDB optionally supports **natural language queries** through an embedded LLM (llama.cpp integration, 23KB of glue code). Users can submit queries in plain English, which are translated to SQL via a retrieval-augmented generation (RAG) approach that incorporates schema context. The NLP layer (38KB) handles tokenization, intent classification, and entity extraction. ML operations (28KB) enable in-database inference for registered models.

---

## 6. Distributed Architecture

### 6.1 Raft Consensus

ThunderDB uses the **Raft consensus protocol** for leader election and replicated state machine consistency. Each cluster has one Raft group for metadata and one Raft group per region for data.

**Raft roles:**
- **Leader:** Handles all client requests, replicates log entries to followers.
- **Follower:** Replicates the leader's log, responds to read requests (with lease-based reads).
- **Candidate:** Temporarily during leader election.

**Key parameters:**
- Election timeout: 150-300ms (randomized)
- Heartbeat interval: 50ms
- Log compaction: Snapshot when log exceeds 10,000 entries

### 6.2 Region-Based Sharding

Data is partitioned into **regions**, each responsible for a contiguous range of the primary key space.

```
  Key Space:  [0 ................................................... MAX]
              |         |              |             |              |
              | Region1 |   Region2    |  Region3    |   Region4    |
              | [0, 100)|  [100, 500)  | [500, 800)  | [800, MAX)   |
              |  Node A |   Node B     |  Node A     |   Node C     |
```

| Property | Value |
|---|---|
| Max Region Size | 256MB |
| Split Trigger | Region exceeds 256MB |
| Split Strategy | Midpoint of key range based on sampled keys |
| Merge Trigger | Two adjacent regions on the same node both below 64MB |
| Replication | Configurable factor (default 3) |

### 6.3 Auto-Rebalancing

A background scheduler on the cluster leader continuously monitors region sizes and node loads. When imbalance is detected:

1. **Split:** Over-sized regions are split at a sampled midpoint key.
2. **Transfer:** Regions are moved from overloaded nodes to underloaded nodes using Raft learner mechanism (add learner, replicate, promote, remove old replica).
3. **Merge:** Under-sized adjacent regions are merged to reduce metadata overhead.

### 6.4 gRPC Transport

All inter-node communication uses gRPC with Protocol Buffers serialization. Key RPC services:

- `RaftService`: AppendEntries, RequestVote, InstallSnapshot
- `RegionService`: Get, Put, Delete, Scan, BatchGet
- `AdminService`: SplitRegion, MergeRegion, TransferLeader, AddNode, RemoveNode

Connection pooling and multiplexing minimize connection overhead. TLS is mandatory for inter-node traffic in production configurations.

---

## 7. Protocol Compatibility

### 7.1 PostgreSQL v3 Wire Protocol (54KB)

ThunderDB implements the full PostgreSQL v3 extended query protocol, allowing connections from `psql`, pgAdmin, any PostgreSQL driver (JDBC, psycopg2, node-pg, etc.), and ORMs (SQLAlchemy, Hibernate, Prisma).

**Supported message types:**
- Startup, Authentication (MD5, SCRAM-SHA-256), ParameterStatus
- SimpleQuery, Parse, Bind, Describe, Execute, Sync (extended query protocol)
- COPY IN/OUT for bulk data transfer
- LISTEN/NOTIFY for real-time event channels
- Prepared statements with parameter binding
- Portal-based cursors for large result sets

### 7.2 MySQL 4.1+ Wire Protocol (36KB)

Full binary protocol support for MySQL client compatibility:
- Handshake with capability negotiation
- COM_QUERY, COM_STMT_PREPARE, COM_STMT_EXECUTE, COM_STMT_CLOSE
- MySQL native password authentication
- Server-side prepared statements
- Binary result set encoding

### 7.3 RESP2/3 Protocol (105KB)

ThunderDB implements the Redis Serialization Protocol, enabling compatibility with all Redis clients and tools (`redis-cli`, Jedis, ioredis, etc.).

**Supported data structures and commands:**
- **Strings:** GET, SET, MGET, MSET, INCR, DECR, APPEND, STRLEN, SETEX, SETNX
- **Hashes:** HGET, HSET, HMGET, HMSET, HDEL, HGETALL, HKEYS, HVALS, HINCRBY
- **Lists:** LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, LINDEX, LSET, LREM
- **Sets:** SADD, SREM, SMEMBERS, SISMEMBER, SCARD, SUNION, SINTER, SDIFF
- **Sorted Sets:** ZADD, ZREM, ZRANGE, ZRANGEBYSCORE, ZRANK, ZSCORE, ZCARD
- **Pub/Sub:** SUBSCRIBE, UNSUBSCRIBE, PUBLISH, PSUBSCRIBE
- **Transactions:** MULTI, EXEC, DISCARD, WATCH
- **Server:** PING, INFO, DBSIZE, FLUSHDB, SELECT

RESP commands are internally translated to SQL operations against the storage engine, providing full ACID guarantees that standard Redis does not offer.

---

## 8. Integration Layer

### 8.1 CDC Architecture (Change Data Capture)

CDC enables real-time data ingestion from external databases into ThunderDB. This is a key component of the companion deployment strategy, allowing ThunderDB to shadow an existing database during migration.

```
  +----------------+         +--------------------+         +-----------+
  | External DB    |         | CDC Connector      |         | ThunderDB |
  | (PostgreSQL/   | ------> | - Reads change log | ------> | Storage   |
  |  MySQL/Mongo/  |         | - Transforms data  |         | Engine    |
  |  Redis)        |         | - Applies to target |         |           |
  +----------------+         +--------------------+         +-----------+

  PostgreSQL: Logical replication slots + output plugins (pgoutput/wal2json)
  MySQL:      Binary log (ROW format) parsing via binlog protocol
  MongoDB:    Change streams (oplog tailing) via aggregation pipeline
  Redis:      Keyspace notifications (__keyevent@*__ channels)
```

**CDC guarantees:**
- **At-least-once delivery:** Connectors track their position in the source change log and resume from the last acknowledged position after restart.
- **Ordering:** Changes are applied in the same order they were committed in the source database.
- **Schema evolution:** DDL changes in the source are detected and propagated (add column, rename column).

### 8.2 FDW Architecture (Foreign Data Wrappers)

FDW enables ThunderDB to query external databases as if they were local tables, without importing the data.

```sql
-- Register an external PostgreSQL database
CREATE FOREIGN TABLE remote_users
  SERVER pg_production
  OPTIONS (schema 'public', table 'users');

-- Query spans local and remote data
SELECT u.name, o.total
FROM remote_users u
JOIN local_orders o ON u.id = o.user_id
WHERE u.country = 'US';
```

**Predicate pushdown:** Filters and projections are pushed down to the remote database to minimize data transfer. In the example above, `WHERE u.country = 'US'` is executed on the remote PostgreSQL server, and only matching rows are transferred to ThunderDB for the join.

**Cost estimation:** The FDW layer estimates the cost of remote operations based on table statistics (row count, average row size, network latency), allowing the optimizer to make informed decisions about join ordering between local and remote tables.

### 8.3 Zero-Downtime Migration

CDC and FDW together enable a zero-downtime migration path:

1. **Shadow phase:** Deploy ThunderDB alongside the existing database. CDC replicates all data and changes in real-time.
2. **Validation phase:** Use FDW to run comparison queries between the two databases, verifying data consistency.
3. **Cutover phase:** Redirect application traffic to ThunderDB. CDC ensures no data is lost during the switch.
4. **Cleanup phase:** Decommission the old database and CDC connectors.

---

## 9. Data Flow Diagrams

### 9.1 Query Execution Flow (Read Path)

```
  Client                ThunderDB
    |                      |
    |--- SQL Query ------->|
    |                      +---> Protocol Layer (decode wire format)
    |                      +---> SQL Parser (text -> AST)
    |                      +---> Analyzer (AST -> bound plan)
    |                      +---> Optimizer (bound plan -> optimized logical plan)
    |                      +---> Planner (logical plan -> physical plan)
    |                      +---> Executor
    |                      |       +---> Buffer Pool (check cache)
    |                      |       +---> Storage (row store or column store)
    |                      |       +---> MVCC visibility check
    |                      |       +---> Vectorized batch assembly
    |                      +---> Protocol Layer (encode result set)
    |<-- Result Set -------|
```

### 9.2 Write Path

```
  Client                ThunderDB
    |                      |
    |--- INSERT/UPDATE --->|
    |                      +---> Protocol Layer (decode)
    |                      +---> SQL Parser -> Analyzer -> Optimizer -> Planner
    |                      +---> Transaction Manager
    |                      |       +---> Acquire locks (if pessimistic)
    |                      |       +---> Write WAL record (force to disk)
    |                      |       +---> Modify page in buffer pool (dirty)
    |                      |       +---> Update indexes
    |                      +---> COMMIT
    |                      |       +---> Write Commit WAL record
    |                      |       +---> Group commit (fsync)
    |                      |       +---> Release locks
    |                      |       +---> Notify CDC propagation worker
    |                      +---> Protocol Layer (encode OK/error)
    |<-- OK ---------------|
    |                      |
    |                  [Background]
    |                      +---> Column Store propagation worker
    |                      |       +---> Read committed rows from WAL
    |                      |       +---> Batch into row groups
    |                      |       +---> Compress and write column segments
    |                      +---> Checkpoint worker (periodic)
    |                             +---> Flush dirty pages
    |                             +---> Write checkpoint WAL record
    |                             +---> Advance recycle LSN
```

### 9.3 CDC Flow

```
  External Database              ThunderDB
  +----------------+             +--------------------------------------+
  | PostgreSQL     |             |                                      |
  | Logical Repl.  |--- WAL --->| CDC Connector (PostgreSQL)           |
  | Slot           |  Stream    |   +-> Decode pgoutput messages       |
  +----------------+            |   +-> Transform to ThunderDB ops     |
                                |   +-> Begin transaction              |
  +----------------+            |   +-> Apply INSERT/UPDATE/DELETE     |
  | MySQL          |            |   +-> Commit transaction             |
  | Binlog         |--- ROW --->| CDC Connector (MySQL)                |
  | Events         |  Events    |   +-> Parse binlog events            |
  +----------------+            |   +-> Map columns and types          |
                                |   +-> Apply changes                  |
  +----------------+            |                                      |
  | MongoDB        |--- Change  | CDC Connector (MongoDB)              |
  | Oplog          |  Stream--->|   +-> Consume change stream docs     |
  +----------------+            |   +-> BSON -> row conversion         |
                                |                                      |
  +----------------+            | CDC Connector (Redis)                |
  | Redis          |--- Key --->|   +-> Subscribe to keyspace events   |
  | Keyspace       |  Events    |   +-> Capture key mutations          |
  +----------------+            +--------------------------------------+
```

### 9.4 Distributed Query Flow

```
  Client
    |
    v
  Coordinator Node
    |
    +---> Parse & Optimize query
    +---> Identify involved regions
    +---> Route sub-queries to region leaders
    |
    +----------+----------+----------+
    |          |          |          |
    v          v          v          v
  Region 1  Region 2  Region 3  Region 4
  (Node A)  (Node B)  (Node A)  (Node C)
    |          |          |          |
    +--- partial results ---+       |
    |          |                    |
    v          v                    v
  Coordinator Node
    |
    +---> Merge/Aggregate partial results
    +---> Apply final LIMIT/ORDER BY
    +---> Return to client
    |
    v
  Client
```

---

## 10. Design Decisions

### 10.1 Why Rust?

ThunderDB is written entirely in Rust for three fundamental reasons:

- **Memory safety without garbage collection:** Rust's ownership model and borrow checker eliminate entire classes of bugs (use-after-free, double-free, data races) at compile time. For a database that manages raw memory (buffer pool, page cache), this prevents corruption bugs that are notoriously difficult to diagnose.

- **Zero-cost abstractions:** Rust's trait system, generics, and iterators compile down to the same machine code as hand-written C/C++. The database pays no runtime overhead for its modular architecture.

- **No garbage collector:** Database engines require predictable latency. GC pauses in Java or Go can introduce multi-millisecond stalls during critical operations (transaction commit, WAL flush). Rust's deterministic memory management guarantees consistent tail latencies.

- **Fearless concurrency:** Rust's type system enforces thread safety at compile time. The `Send` and `Sync` traits ensure that concurrent access to shared data structures (buffer pool, lock tables, Raft state) is always correct.

### 10.2 Why HTAP?

Traditional architectures require separate OLTP and OLAP databases connected by ETL pipelines:

```
  Traditional:  App --> OLTP DB --> ETL (hours) --> OLAP DB --> Dashboard
  ThunderDB:    App --> ThunderDB (row + column store) --> Dashboard
```

- **Eliminates data movement:** No ETL pipelines to build, maintain, debug, and monitor.
- **Real-time analytics:** The column store lags the row store by seconds, not hours.
- **Reduced operational complexity:** One database to deploy, backup, monitor, and scale.
- **Consistent data:** Analytics and transactions read from the same source of truth.

### 10.3 Why Multi-Protocol?

Supporting PostgreSQL, MySQL, and Redis wire protocols means:

- **Zero application changes:** Existing applications connect to ThunderDB using their current database drivers.
- **Existing tooling works:** pgAdmin, MySQL Workbench, redis-cli, Grafana, Metabase, and thousands of other tools work without modification.
- **Gradual migration:** Teams can switch one service at a time, using the protocol that service already speaks.

### 10.4 Why Companion Approach?

ThunderDB is designed to run alongside an existing database during migration:

- **Lower adoption barrier:** No big-bang migration required. Start by deploying ThunderDB as a read replica via CDC.
- **Validation period:** Run both databases in parallel, compare query results via FDW, and build confidence before cutover.
- **Rollback safety:** If issues arise, traffic can be redirected back to the original database instantly since CDC keeps both in sync.
- **Incremental feature adoption:** Teams can adopt ThunderDB features (vector search, real-time analytics, Redis compatibility) incrementally without disrupting existing workloads.

---

## Summary of Key Metrics

| Metric | Value |
|---|---|
| Total Lines of Code | ~75,600 |
| Number of Crates | 14 |
| Page Size | 16KB |
| WAL Segment Size | 64MB |
| B+Tree Fanout | 256+ keys/node |
| Vectorized Batch Size | 1024+ rows |
| Max Region Size | 256MB |
| TxnId Width | 64 bits (48 timestamp + 8 node + 8 sequence) |
| Max Cluster Size | 256 nodes |
| Supported Wire Protocols | 3 (PostgreSQL v3, MySQL 4.1+, RESP2/3) |
| CDC Sources | 4 (PostgreSQL, MySQL, MongoDB, Redis) |
| FDW Targets | 4 (PostgreSQL, MySQL, MongoDB, Redis) |
| API Interfaces | 5 (REST, gRPC, GraphQL, WebSocket, Web Dashboard) |
| Compression Algorithms | 6 (LZ4, Snappy, Zstd, RLE, Delta, Dictionary) |
| Authentication Methods | 3 (MD5, SCRAM-SHA-256, MySQL native password) |
