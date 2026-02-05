---
title: "Configuration"
weight: 2
description: "Complete configuration reference for ThunderDB including TOML settings, environment variable overrides, and performance tuning guides."
---

# Configuration

ThunderDB is configured through a TOML configuration file, typically located at `/etc/thunderdb/thunderdb.toml`. Every setting can also be overridden via environment variables, making it easy to customize behavior in containerized deployments.

---

## Configuration File Format

The configuration file is organized into the following sections:

```toml
[node]
[network]
[storage]
[cluster]
[security]
[logging]
```

### Complete Reference Configuration

Below is a fully annotated configuration file with all available settings and their defaults:

```toml
# =============================================================================
# ThunderDB Configuration File
# =============================================================================

# -----------------------------------------------------------------------------
# Node Settings
# -----------------------------------------------------------------------------
[node]
# Unique identifier for this node in the cluster.
# Must be unique across all nodes. In Kubernetes, this is typically derived
# from the pod ordinal index.
node_id = 1

# -----------------------------------------------------------------------------
# Network Settings
# -----------------------------------------------------------------------------
[network]
# Address to bind all listeners to.
# Use "0.0.0.0" to listen on all interfaces, or a specific IP to restrict.
listen_addr = "0.0.0.0"

# PostgreSQL wire protocol port.
# Compatible with psql, pgcli, and all PostgreSQL client libraries.
pg_port = 5432

# MySQL wire protocol port.
# Compatible with mysql CLI and all MySQL client libraries.
mysql_port = 3306

# RESP (Redis Serialization Protocol) port.
# Compatible with redis-cli and all Redis client libraries.
resp_port = 6379

# HTTP API port.
# Used for REST API, admin endpoints, metrics, and health checks.
http_port = 8088

# gRPC port.
# Used for inter-node communication and the native gRPC client API.
grpc_port = 9090

# -----------------------------------------------------------------------------
# Storage Settings
# -----------------------------------------------------------------------------
[storage]
# Directory for storing data files (pages, indexes, metadata).
data_dir = "/var/lib/thunderdb/data"

# Directory for write-ahead log (WAL) files.
# For best performance, place on a separate disk from data_dir.
wal_dir = "/var/lib/thunderdb/wal"

# Size of the buffer pool (in-memory page cache).
# This is the single most important tuning parameter. Larger values improve
# read performance by keeping more pages in memory.
# Supports suffixes: KB, MB, GB.
buffer_pool_size = "128MB"

# Size of the WAL write buffer.
# Larger values improve write throughput by batching WAL writes.
wal_buffer_size = "16MB"

# Size of each data page.
# Changing this after initialization requires a full data migration.
# Valid values: 4KB, 8KB, 16KB, 32KB.
page_size = "16KB"

# Interval between automatic checkpoints.
# Checkpoints flush dirty pages to disk, reducing recovery time.
# Lower values reduce recovery time but increase I/O.
checkpoint_interval = "60s"

# Number of threads dedicated to background compaction.
# More threads speed up compaction but consume CPU.
compaction_threads = 2

# Enable direct I/O to bypass the OS page cache.
# Recommended for production to avoid double-caching.
direct_io = false

# Enable compression for data pages on disk.
# Reduces storage requirements at a small CPU cost.
compression = true

# Compression algorithm to use when compression is enabled.
# Options: "Lz4" (fast), "Snappy" (balanced), "Zstd" (high ratio).
compression_algorithm = "Lz4"

# Maximum WAL size before forcing a checkpoint.
# When the WAL reaches this size, a checkpoint is triggered regardless
# of the checkpoint_interval.
max_wal_size = "1GB"

# Whether to flush WAL to disk on every commit.
# true:  Guarantees durability (no data loss on crash). Recommended for production.
# false: Better write performance but risks losing the last few transactions on crash.
sync_commit = true

# -----------------------------------------------------------------------------
# Cluster Settings
# -----------------------------------------------------------------------------
[cluster]
# Cluster name. All nodes in the same cluster must use the same name.
cluster_name = "default"

# List of peer node addresses (host:grpc_port).
# Exclude the current node's address.
peers = []

# Raft election timeout.
# If a follower doesn't hear from the leader within this duration,
# it starts a new election. Must be greater than raft_heartbeat_interval.
# For WAN deployments, increase to 3-5s.
raft_election_timeout = "1s"

# Raft heartbeat interval.
# The leader sends heartbeats at this interval.
# Must be significantly less than raft_election_timeout (typically 1/10th).
raft_heartbeat_interval = "100ms"

# Number of copies of each data region.
# 3 is recommended for production (tolerates 1 node failure).
# Cannot exceed the number of nodes in the cluster.
replication_factor = 3

# Maximum size of a single data region before it is split.
# Smaller regions enable finer-grained load balancing.
max_region_size = "256MB"

# Minimum size of a single data region before it is merged.
# Prevents excessive fragmentation from many small regions.
min_region_size = "64MB"

# Enable automatic region balancing across nodes.
# When enabled, the leader periodically rebalances regions
# to maintain even distribution.
auto_balance = true

# -----------------------------------------------------------------------------
# Security Settings
# -----------------------------------------------------------------------------
[security]
# Enable client authentication.
# When false, all connections are accepted without credentials.
authentication_enabled = false

# Enable TLS for all client-facing protocols.
tls_enabled = false

# Path to the TLS certificate file (PEM format).
tls_cert_path = ""

# Path to the TLS private key file (PEM format).
tls_key_path = ""

# Superuser account name.
superuser = "admin"

# Superuser password (plaintext, for initial setup only).
# In production, use THUNDERDB_SUPERUSER_PASSWORD_HASH environment variable
# with an Argon2 hash instead.
superuser_password = ""

# -----------------------------------------------------------------------------
# Logging Settings
# -----------------------------------------------------------------------------
[logging]
# Log level. Options: "trace", "debug", "info", "warn", "error".
# Use "info" for production, "debug" for development, "trace" for deep debugging.
level = "info"

# Log output format. Options: "text" (human-readable), "json" (structured).
# Use "json" for production environments with log aggregation.
format = "text"

# Enable slow query logging.
# Queries exceeding the threshold are logged at WARN level.
slow_query_enabled = true

# Threshold for slow query logging.
# Queries taking longer than this are logged.
slow_query_threshold = "1s"
```

---

## Section Reference

### [node]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `node_id` | integer | `1` | Unique node identifier within the cluster. |

### [network]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `listen_addr` | string | `"0.0.0.0"` | Bind address for all listeners. |
| `pg_port` | integer | `5432` | PostgreSQL wire protocol port. |
| `mysql_port` | integer | `3306` | MySQL wire protocol port. |
| `resp_port` | integer | `6379` | RESP (Redis) wire protocol port. |
| `http_port` | integer | `8088` | HTTP API and admin endpoint port. |
| `grpc_port` | integer | `9090` | gRPC port for inter-node and client communication. |

### [storage]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data_dir` | string | `"/var/lib/thunderdb/data"` | Data file storage directory. |
| `wal_dir` | string | `"/var/lib/thunderdb/wal"` | WAL file storage directory. |
| `buffer_pool_size` | size | `"128MB"` | In-memory page cache size. |
| `wal_buffer_size` | size | `"16MB"` | WAL write buffer size. |
| `page_size` | size | `"16KB"` | Data page size. Immutable after initialization. |
| `checkpoint_interval` | duration | `"60s"` | Automatic checkpoint interval. |
| `compaction_threads` | integer | `2` | Background compaction thread count. |
| `direct_io` | boolean | `false` | Bypass OS page cache with direct I/O. |
| `compression` | boolean | `true` | Enable on-disk page compression. |
| `compression_algorithm` | string | `"Lz4"` | Compression algorithm: `Lz4`, `Snappy`, or `Zstd`. |
| `max_wal_size` | size | `"1GB"` | Maximum WAL size before forced checkpoint. |
| `sync_commit` | boolean | `true` | Flush WAL to disk on every commit. |

### [cluster]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cluster_name` | string | `"default"` | Cluster name shared by all nodes. |
| `peers` | array | `[]` | Peer node addresses in `"host:port"` format. |
| `raft_election_timeout` | duration | `"1s"` | Raft follower election timeout. |
| `raft_heartbeat_interval` | duration | `"100ms"` | Raft leader heartbeat interval. |
| `replication_factor` | integer | `3` | Number of region replicas. |
| `max_region_size` | size | `"256MB"` | Region split threshold. |
| `min_region_size` | size | `"64MB"` | Region merge threshold. |
| `auto_balance` | boolean | `true` | Enable automatic region rebalancing. |

### [security]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `authentication_enabled` | boolean | `false` | Require client authentication. |
| `tls_enabled` | boolean | `false` | Enable TLS encryption. |
| `tls_cert_path` | string | `""` | Path to TLS certificate (PEM). |
| `tls_key_path` | string | `""` | Path to TLS private key (PEM). |
| `superuser` | string | `"admin"` | Superuser account name. |
| `superuser_password` | string | `""` | Superuser password (plaintext). |

### [logging]

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `level` | string | `"info"` | Log level: `trace`, `debug`, `info`, `warn`, `error`. |
| `format` | string | `"text"` | Log format: `text` or `json`. |
| `slow_query_enabled` | boolean | `true` | Enable slow query logging. |
| `slow_query_threshold` | duration | `"1s"` | Slow query time threshold. |

---

## Environment Variable Overrides

Every configuration parameter can be overridden by an environment variable. This is especially useful for Docker and Kubernetes deployments where secrets and per-instance values should not be baked into configuration files.

| Environment Variable | Overrides | Example |
|---------------------|-----------|---------|
| `THUNDERDB_DATA_DIR` | `storage.data_dir` | `/mnt/ssd/thunderdb/data` |
| `THUNDERDB_WAL_DIR` | `storage.wal_dir` | `/mnt/ssd/thunderdb/wal` |
| `THUNDERDB_LOG_LEVEL` | `logging.level` | `debug` |
| `THUNDERDB_SUPERUSER_PASSWORD_HASH` | `security.superuser_password` | `argon2:$argon2id$v=19$...` |
| `THUNDERDB_NODE_ID` | `node.node_id` | `2` |
| `THUNDERDB_LISTEN_ADDR` | `network.listen_addr` | `0.0.0.0` |
| `THUNDERDB_PG_PORT` | `network.pg_port` | `15432` |
| `THUNDERDB_MYSQL_PORT` | `network.mysql_port` | `13306` |
| `THUNDERDB_RESP_PORT` | `network.resp_port` | `16379` |
| `THUNDERDB_HTTP_PORT` | `network.http_port` | `18088` |
| `THUNDERDB_GRPC_PORT` | `network.grpc_port` | `19090` |

**Precedence**: Environment variables take precedence over values in the configuration file. Command-line flags (if any) take precedence over both.

### Using Environment Variables with Docker

```bash
docker run -d \
  -e THUNDERDB_NODE_ID=1 \
  -e THUNDERDB_LISTEN_ADDR=0.0.0.0 \
  -e THUNDERDB_LOG_LEVEL=info \
  -e THUNDERDB_SUPERUSER_PASSWORD_HASH='argon2:$argon2id$v=19$m=65536,t=3,p=4$...' \
  -e THUNDERDB_DATA_DIR=/var/lib/thunderdb/data \
  -e THUNDERDB_WAL_DIR=/var/lib/thunderdb/wal \
  thunderdb:latest
```

### Using Environment Variables with systemd

Add an override file:

```bash
sudo systemctl edit thunderdb
```

```ini
[Service]
Environment="THUNDERDB_LOG_LEVEL=debug"
Environment="THUNDERDB_SUPERUSER_PASSWORD_HASH=argon2:$argon2id$v=19$..."
```

---

## Performance Tuning Guide

ThunderDB's HTAP architecture means it must be tuned differently depending on whether your workload leans toward OLTP (transactional), OLAP (analytical), or a mix of both.

### OLTP-Optimized Configuration

For workloads dominated by short, high-frequency transactions (point lookups, inserts, updates):

```toml
[storage]
# Large buffer pool to keep hot rows in memory.
# Aim for 60-70% of available system RAM.
buffer_pool_size = "8GB"

# Moderate WAL buffer -- OLTP writes are typically small.
wal_buffer_size = "32MB"

# Ensure every commit is durable.
sync_commit = true

# Frequent checkpoints reduce recovery time after crashes.
checkpoint_interval = "30s"

# Fewer compaction threads needed; OLTP generates less bulk data.
compaction_threads = 2

# Bypass OS cache to avoid double-buffering.
direct_io = true

# Lz4 for minimal CPU overhead on the write path.
compression = true
compression_algorithm = "Lz4"

# Smaller max WAL keeps recovery time bounded.
max_wal_size = "512MB"
```

**Key principles:**
- Maximize buffer pool size to serve reads from memory.
- Use `sync_commit = true` to guarantee durability.
- Lower `checkpoint_interval` to reduce crash recovery time.
- Use Lz4 compression for its speed advantage on the write path.

### OLAP-Optimized Configuration

For workloads dominated by large scans, aggregations, and batch processing:

```toml
[storage]
# Moderate buffer pool -- OLAP scans are sequential and don't benefit
# as much from caching random pages.
buffer_pool_size = "4GB"

# Large WAL buffer to handle bulk writes efficiently.
wal_buffer_size = "128MB"

# Async commit is acceptable if some data loss on crash is tolerable.
sync_commit = false

# Less frequent checkpoints to reduce I/O during long-running queries.
checkpoint_interval = "300s"

# More compaction threads for faster background processing of bulk data.
compaction_threads = 8

# Direct I/O is still beneficial for large sequential reads.
direct_io = true

# Zstd compression for maximum space savings on large datasets.
compression = true
compression_algorithm = "Zstd"

# Larger max WAL to avoid checkpoint storms during bulk loads.
max_wal_size = "4GB"
```

**Key principles:**
- Allocate more to WAL buffer for batch write throughput.
- Use more compaction threads to keep up with bulk data ingestion.
- Use Zstd compression to minimize storage costs for large datasets.
- Larger `max_wal_size` and `checkpoint_interval` reduce I/O interference with queries.

### Mixed HTAP Configuration

For workloads with both transactional and analytical queries (the most common ThunderDB use case):

```toml
[storage]
# Balance between caching hot transactional data and leaving room
# for analytical query memory needs.
buffer_pool_size = "6GB"

# Balanced WAL buffer.
wal_buffer_size = "64MB"

# Durability is important for the transactional component.
sync_commit = true

# Moderate checkpoint interval balances recovery time and I/O.
checkpoint_interval = "60s"

# Moderate compaction thread count.
compaction_threads = 4

# Direct I/O recommended.
direct_io = true

# Lz4 is a good default balance of speed and compression.
compression = true
compression_algorithm = "Lz4"

# Moderate max WAL size.
max_wal_size = "1GB"
```

### Memory Sizing Guide

Use the following guidelines to size ThunderDB's memory parameters based on available system RAM:

| Available RAM | Buffer Pool | WAL Buffer | Recommended For |
|--------------|-------------|------------|-----------------|
| 8 GB | 4 GB | 32 MB | Development / Small production |
| 16 GB | 10 GB | 64 MB | Medium OLTP workloads |
| 32 GB | 20 GB | 128 MB | Large OLTP / Mixed HTAP |
| 64 GB | 40 GB | 256 MB | Heavy HTAP workloads |
| 128 GB | 80 GB | 512 MB | Large-scale analytics |

**General rules:**
- Allocate 50-70% of total RAM to `buffer_pool_size`.
- Reserve at least 2-4 GB for the OS, file system cache, and other processes.
- The WAL buffer should be 0.5-1% of the buffer pool size.
- For Kubernetes, set resource `requests` to the sum of buffer pool + WAL buffer + 2 GB overhead, and `limits` to 1.5x the requests.

### Compression Algorithm Comparison

| Algorithm | Compression Ratio | Compression Speed | Decompression Speed | Best For |
|-----------|------------------|-------------------|---------------------|----------|
| **Lz4** | Low-Medium | Very Fast | Very Fast | OLTP, low-latency reads |
| **Snappy** | Medium | Fast | Fast | General purpose |
| **Zstd** | High | Moderate | Fast | OLAP, storage-constrained |

### OS-Level Tuning

For optimal performance, apply these OS-level settings on Linux:

```bash
# Increase file descriptor limits
echo "thunder soft nofile 65535" >> /etc/security/limits.conf
echo "thunder hard nofile 65535" >> /etc/security/limits.conf

# Reduce swappiness (prefer keeping data in RAM)
echo "vm.swappiness=1" >> /etc/sysctl.conf

# Increase the number of memory map areas
echo "vm.max_map_count=262144" >> /etc/sysctl.conf

# Increase network buffer sizes for high-throughput workloads
echo "net.core.somaxconn=65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog=65535" >> /etc/sysctl.conf

# Apply changes
sysctl -p
```

### Disk I/O Tuning

For SSD-backed storage:

```bash
# Use noop or none scheduler for SSDs
echo "none" > /sys/block/sda/queue/scheduler

# Set readahead to 256 KB for SSDs (reduce for random I/O workloads)
blockdev --setra 512 /dev/sda
```

For best results, place `data_dir` and `wal_dir` on separate physical disks or volumes. WAL writes are sequential and benefit from dedicated I/O bandwidth.
