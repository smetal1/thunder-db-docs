---
title: "Getting Started"
linkTitle: "Getting Started"
weight: 1
description: >
  Get ThunderDB up and running in minutes. Install, connect, and run your first queries.
---

This guide walks you through installing ThunderDB, starting the server, connecting with
multiple protocols, running your first SQL queries, performing vector similarity search,
setting up Change Data Capture (CDC), and querying external databases through Foreign
Data Wrappers (FDW).

## Prerequisites

Before you begin, make sure you have one of the following environments ready:

### Option A: Build from Source

| Requirement | Minimum Version | Notes |
|-------------|-----------------|-------|
| **Rust toolchain** | 1.75+ | Install via [rustup](https://rustup.rs/) |
| **Cargo** | Bundled with Rust | Rust's package manager |
| **CMake** | 3.20+ | Required for native dependency builds |
| **Clang / GCC** | Clang 14+ or GCC 11+ | C/C++ compiler for linked libraries |
| **OpenSSL** | 1.1.1+ | TLS support (or use `vendored-openssl` feature) |
| **protoc** | 3.15+ | Protocol Buffers compiler for gRPC |
| **Git** | 2.x | To clone the repository |

### Option B: Docker

| Requirement | Minimum Version |
|-------------|-----------------|
| **Docker** | 20.10+ |
| **Docker Compose** | 2.0+ (V2 plugin) |

### Option C: Pre-built Packages

Pre-built `.deb` and `.rpm` packages are available on the
[GitHub Releases](https://github.com/smetal1/thunder-db/releases) page for
Ubuntu 22.04+, Debian 12+, and RHEL 9+ / Fedora 38+.

---

## Installation

### Method 1: Build from Source

Clone the repository and build an optimized release binary:

```bash
# Clone the repository
git clone https://github.com/smetal1/thunder-db.git
cd thunderdb

# Build a release binary (optimized, may take 5-10 minutes on first build)
cargo build --release

# The binary is located at:
#   target/release/thunderdb-server
#   target/release/thunderdb-cli

# (Optional) Install system-wide
sudo cp target/release/thunderdb-server /usr/local/bin/
sudo cp target/release/thunderdb-cli /usr/local/bin/
```

To build with all optional features enabled (vector search, CDC, FDW, full-text search):

```bash
cargo build --release --features "vector,cdc,fdw,fts"
```

### Method 2: Docker

Pull the official image and start a container:

```bash
# Pull the latest image
docker pull thunderdb/thunderdb:latest

# Run with default settings, exposing all protocol ports
docker run -d \
  --name thunderdb \
  -p 5432:5432 \
  -p 3306:3306 \
  -p 6379:6379 \
  -p 8088:8088 \
  -p 9090:9090 \
  -v thunderdb-data:/var/lib/thunderdb \
  thunderdb/thunderdb:latest
```

### Method 3: Docker Compose (Recommended for Development)

Create a `docker-compose.yml` file with the full multi-port setup:

```yaml
version: "3.9"

services:
  thunderdb:
    image: thunderdb/thunderdb:latest
    container_name: thunderdb
    restart: unless-stopped
    ports:
      # PostgreSQL wire protocol
      - "5432:5432"
      # MySQL wire protocol
      - "3306:3306"
      # Redis / RESP protocol
      - "6379:6379"
      # REST / HTTP API
      - "8088:8088"
      # gRPC API
      - "9090:9090"
      # Prometheus metrics
      - "9100:9100"
    volumes:
      - thunderdb-data:/var/lib/thunderdb
      - ./thunderdb.toml:/etc/thunderdb/thunderdb.toml:ro
    environment:
      THUNDERDB_LOG_LEVEL: info
      THUNDERDB_DATA_DIR: /var/lib/thunderdb
      THUNDERDB_ADMIN_PASSWORD: "${THUNDERDB_ADMIN_PASSWORD:-thunderdb}"
    healthcheck:
      test: ["CMD", "thunderdb-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  thunderdb-data:
    driver: local
```

Start the stack:

```bash
docker-compose up -d

# Check the logs
docker-compose logs -f thunderdb
```

### Method 4: Debian / Ubuntu Package

```bash
# Download the latest .deb package
curl -LO https://github.com/smetal1/thunder-db/releases/latest/download/thunderdb_amd64.deb

# Install the package
sudo dpkg -i thunderdb_amd64.deb

# The package installs:
#   /usr/bin/thunderdb-server
#   /usr/bin/thunderdb-cli
#   /etc/thunderdb/thunderdb.toml   (default config)
#   /lib/systemd/system/thunderdb.service

# Enable and start the service
sudo systemctl enable thunderdb
sudo systemctl start thunderdb

# Check status
sudo systemctl status thunderdb
```

---

## Starting the Server

If you built from source, start the server with the default configuration:

```bash
# Start with default settings (listens on all default ports)
thunderdb-server

# Or specify a custom configuration file
thunderdb-server --config /path/to/thunderdb.toml

# Or set individual options via CLI flags
thunderdb-server \
  --data-dir /var/lib/thunderdb \
  --pg-port 5432 \
  --mysql-port 3306 \
  --redis-port 6379 \
  --http-port 8088 \
  --grpc-port 9090 \
  --log-level info
```

You should see output similar to:

```
2026-02-05T10:00:00.000Z  INFO thunderdb::server: Starting ThunderDB v0.1.0
2026-02-05T10:00:00.010Z  INFO thunderdb::storage: Opening data directory: /var/lib/thunderdb
2026-02-05T10:00:00.050Z  INFO thunderdb::protocol::pg: PostgreSQL protocol listening on 0.0.0.0:5432
2026-02-05T10:00:00.051Z  INFO thunderdb::protocol::mysql: MySQL protocol listening on 0.0.0.0:3306
2026-02-05T10:00:00.052Z  INFO thunderdb::protocol::redis: Redis/RESP protocol listening on 0.0.0.0:6379
2026-02-05T10:00:00.053Z  INFO thunderdb::api::http: REST API listening on 0.0.0.0:8088
2026-02-05T10:00:00.054Z  INFO thunderdb::api::grpc: gRPC API listening on 0.0.0.0:9090
2026-02-05T10:00:00.055Z  INFO thunderdb::server: ThunderDB is ready to accept connections
```

---

## Connecting to ThunderDB

ThunderDB speaks multiple wire protocols simultaneously. You can connect with
whichever client you prefer.

### Connect via PostgreSQL Protocol (psql)

ThunderDB implements the PostgreSQL wire protocol on port **5432** (default).
Any PostgreSQL-compatible client or driver works out of the box.

```bash
# Connect using psql
psql -h localhost -p 5432 -U thunderdb -d default

# You will see:
# psql (16.1, server ThunderDB 0.1.0)
# Type "help" for help.
#
# default=>
```

If you set a custom admin password, provide it when prompted:

```bash
psql -h localhost -p 5432 -U thunderdb -d default -W
```

### Connect via MySQL Protocol (mysql client)

ThunderDB implements the MySQL wire protocol on port **3306** (default).
Standard MySQL clients and connectors work without modification.

```bash
# Connect using the mysql client
mysql -h 127.0.0.1 -P 3306 -u thunderdb -p --database=default

# You will see:
# Welcome to ThunderDB v0.1.0 (MySQL protocol mode)
# Server version: 8.0.32-ThunderDB
#
# mysql>
```

### Connect via Redis Protocol (redis-cli)

ThunderDB implements a subset of the Redis/RESP protocol on port **6379** (default).
You can use `redis-cli` or any Redis client library.

```bash
# Connect using redis-cli
redis-cli -h localhost -p 6379

# Test the connection
127.0.0.1:6379> PING
PONG

# Set and get a key
127.0.0.1:6379> SET greeting "Hello from ThunderDB"
OK
127.0.0.1:6379> GET greeting
"Hello from ThunderDB"

# You can also run SQL through the Redis protocol
127.0.0.1:6379> THUNDERDB.QUERY "SELECT 1 + 1 AS result"
1) 1) "result"
   2) "2"
```

### Connect via REST API (curl)

ThunderDB exposes a REST API on port **8088** (default) for HTTP-based access.

```bash
# Health check
curl http://localhost:8088/api/v1/health
# {"status":"ok","version":"0.1.0","uptime_seconds":42}

# Run a query
curl -X POST http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 + 1 AS result"}'

# Response:
# {
#   "columns": ["result"],
#   "rows": [[2]],
#   "execution_time_ms": 0.12
# }
```

---

## Your First Queries

Now that you are connected, let us create some tables, insert data, and run queries.
The examples below use `psql`, but the SQL is identical across all protocols.

### Create a Table

```sql
-- Create a simple users table
CREATE TABLE users (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    username    VARCHAR(255) NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL,
    full_name   VARCHAR(255),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active   BOOLEAN DEFAULT TRUE
);

-- Create an orders table with a foreign key
CREATE TABLE orders (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    product     VARCHAR(255) NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    price       DECIMAL(10, 2) NOT NULL,
    status      VARCHAR(50) DEFAULT 'pending',
    ordered_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create an index for faster lookups
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

### Insert Data

```sql
-- Insert users
INSERT INTO users (username, email, full_name) VALUES
    ('alice',   'alice@example.com',   'Alice Johnson'),
    ('bob',     'bob@example.com',     'Bob Smith'),
    ('charlie', 'charlie@example.com', 'Charlie Brown'),
    ('diana',   'diana@example.com',   'Diana Prince'),
    ('eve',     'eve@example.com',     'Eve Wilson');

-- Insert orders
INSERT INTO orders (user_id, product, quantity, price, status) VALUES
    (1, 'Mechanical Keyboard',  1, 149.99, 'shipped'),
    (1, 'USB-C Hub',            2,  39.99, 'delivered'),
    (2, '27" Monitor',          1, 449.99, 'pending'),
    (3, 'Wireless Mouse',       1,  29.99, 'shipped'),
    (3, 'Laptop Stand',         1,  59.99, 'delivered'),
    (4, 'Webcam HD',            1,  79.99, 'pending'),
    (5, 'Noise-Cancel Headset', 1, 199.99, 'shipped');
```

### Query Data (OLTP)

```sql
-- Simple SELECT
SELECT * FROM users WHERE is_active = TRUE;

-- JOIN query
SELECT
    u.username,
    u.full_name,
    o.product,
    o.price,
    o.status
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.status = 'shipped'
ORDER BY o.price DESC;

-- Result:
-- +----------+---------------+------------------------+--------+---------+
-- | username | full_name     | product                | price  | status  |
-- +----------+---------------+------------------------+--------+---------+
-- | eve      | Eve Wilson    | Noise-Cancel Headset   | 199.99 | shipped |
-- | alice    | Alice Johnson | Mechanical Keyboard    | 149.99 | shipped |
-- | charlie  | Charlie Brown | Wireless Mouse         |  29.99 | shipped |
-- +----------+---------------+------------------------+--------+---------+
```

### Analytical Queries (OLAP)

ThunderDB handles analytical workloads in the same engine. Queries that scan large
volumes of data automatically use the columnar store and vectorized execution.

```sql
-- Revenue by user
SELECT
    u.username,
    COUNT(o.id) AS total_orders,
    SUM(o.price * o.quantity) AS total_spent,
    AVG(o.price) AS avg_order_value
FROM users u
JOIN orders o ON u.id = o.user_id
GROUP BY u.username
ORDER BY total_spent DESC;

-- Result:
-- +----------+--------------+-------------+-----------------+
-- | username | total_orders | total_spent | avg_order_value |
-- +----------+--------------+-------------+-----------------+
-- | bob      |            1 |      449.99 |          449.99 |
-- | alice    |            2 |      229.97 |           94.99 |
-- | eve      |            1 |      199.99 |          199.99 |
-- | charlie  |            2 |       89.98 |           44.99 |
-- | diana    |            1 |       79.99 |           79.99 |
-- +----------+--------------+-------------+-----------------+

-- Order status distribution
SELECT
    status,
    COUNT(*) AS order_count,
    SUM(price * quantity) AS total_revenue,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM orders
GROUP BY status
ORDER BY order_count DESC;
```

---

## Vector Search

ThunderDB has built-in support for vector embeddings and similarity search,
making it ideal for AI/ML workloads, RAG pipelines, and semantic search.

### Create a Vector Table

```sql
-- Create a documents table with a 384-dimensional embedding column
CREATE TABLE documents (
    id        BIGINT PRIMARY KEY AUTO_INCREMENT,
    title     VARCHAR(512) NOT NULL,
    content   TEXT,
    embedding VECTOR(384) NOT NULL,
    metadata  JSONB
);

-- Create an HNSW index for fast approximate nearest-neighbor search
CREATE INDEX idx_documents_embedding
    ON documents
    USING HNSW (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
```

### Insert Vector Data

```sql
-- Insert documents with embeddings (truncated for readability)
-- In practice, embeddings come from a model like sentence-transformers
INSERT INTO documents (title, content, embedding, metadata) VALUES
(
    'Introduction to ThunderDB',
    'ThunderDB is a distributed HTAP database written in Rust...',
    '[0.12, -0.03, 0.88, 0.45, ...]'::VECTOR(384),
    '{"category": "database", "author": "docs-team"}'
),
(
    'Vector Search Tutorial',
    'Learn how to use vector similarity search in ThunderDB...',
    '[0.09, 0.77, -0.12, 0.33, ...]'::VECTOR(384),
    '{"category": "tutorial", "author": "docs-team"}'
),
(
    'Rust Performance Guide',
    'Understanding zero-cost abstractions and memory safety...',
    '[0.55, 0.01, 0.34, -0.22, ...]'::VECTOR(384),
    '{"category": "programming", "author": "community"}'
);
```

### Similarity Search

```sql
-- Find the 5 most similar documents to a query vector
-- using cosine distance
SELECT
    id,
    title,
    content,
    embedding <=> '[0.10, 0.75, -0.08, 0.30, ...]'::VECTOR(384) AS distance
FROM documents
ORDER BY embedding <=> '[0.10, 0.75, -0.08, 0.30, ...]'::VECTOR(384)
LIMIT 5;

-- Result:
-- +----+----------------------------+------------------------------------------+----------+
-- | id | title                      | content                                  | distance |
-- +----+----------------------------+------------------------------------------+----------+
-- |  2 | Vector Search Tutorial     | Learn how to use vector similarity se... |   0.0312 |
-- |  1 | Introduction to ThunderDB  | ThunderDB is a distributed HTAP data... |   0.2145 |
-- |  3 | Rust Performance Guide     | Understanding zero-cost abstractions... |   0.5678 |
-- +----+----------------------------+------------------------------------------+----------+

-- Filtered similarity search with metadata
SELECT
    title,
    embedding <=> '[0.10, 0.75, -0.08, 0.30, ...]'::VECTOR(384) AS distance
FROM documents
WHERE metadata->>'category' = 'tutorial'
ORDER BY embedding <=> '[0.10, 0.75, -0.08, 0.30, ...]'::VECTOR(384)
LIMIT 10;
```

### Vector Search via REST API

```bash
curl -X POST http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT title, embedding <=> $1::VECTOR(384) AS distance FROM documents ORDER BY distance LIMIT 5",
    "params": ["[0.10, 0.75, -0.08, 0.30, ...]"]
  }'
```

---

## Change Data Capture (CDC)

ThunderDB can act as a CDC consumer, continuously replicating data from external
databases into ThunderDB. This lets you add HTAP and vector search capabilities
on top of your existing primary database without modifying your application.

### Sync from an External PostgreSQL

First, ensure the source PostgreSQL instance has logical replication enabled:

```ini
# In postgresql.conf on the source database
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4
```

Then, in ThunderDB, create a CDC subscription:

```sql
-- Create a CDC source pointing to the external PostgreSQL
CREATE CDC SOURCE pg_source
    TYPE POSTGRES
    CONNECTION 'host=pg-primary.example.com port=5432 dbname=myapp user=replicator password=secret'
    PUBLICATION 'thunderdb_pub';

-- Create a subscription that syncs specific tables
CREATE CDC SUBSCRIPTION sync_users
    FROM SOURCE pg_source
    TABLES (public.users, public.orders)
    INTO SCHEMA synced
    WITH (
        snapshot = TRUE,           -- initial full snapshot
        slot_name = 'thunderdb_slot',
        create_slot = TRUE
    );

-- Check subscription status
SELECT * FROM thunderdb_cdc.subscriptions;
-- +------------+-----------+--------+------------------+---------------------+
-- | name       | source    | status | tables           | last_lsn            |
-- +------------+-----------+--------+------------------+---------------------+
-- | sync_users | pg_source | active | users, orders    | 0/16B3748           |
-- +------------+-----------+--------+------------------+---------------------+

-- Query the synced data — it stays up-to-date in near real-time
SELECT * FROM synced.users LIMIT 5;
```

### Monitoring CDC Lag

```sql
-- Check replication lag
SELECT
    subscription_name,
    source_lsn,
    applied_lsn,
    lag_bytes,
    lag_seconds
FROM thunderdb_cdc.replication_status;
```

---

## Foreign Data Wrappers (FDW)

ThunderDB supports Foreign Data Wrappers that let you query external databases
directly from ThunderDB SQL, without copying data. This is useful for ad-hoc
cross-database joins and federation.

### Query an External MySQL Database

```sql
-- Create a foreign server definition
CREATE FOREIGN SERVER mysql_erp
    TYPE MYSQL
    OPTIONS (
        host 'mysql-erp.example.com',
        port '3306',
        database 'erp'
    );

-- Create user mapping for authentication
CREATE USER MAPPING FOR thunderdb
    SERVER mysql_erp
    OPTIONS (
        username 'readonly_user',
        password 'secret'
    );

-- Import foreign tables from the remote schema
IMPORT FOREIGN SCHEMA erp
    FROM SERVER mysql_erp
    INTO SCHEMA erp_remote;

-- Now query the remote MySQL tables as if they were local
SELECT
    p.product_name,
    p.sku,
    p.price
FROM erp_remote.products p
WHERE p.category = 'Electronics'
ORDER BY p.price DESC
LIMIT 10;

-- Cross-database JOIN: local ThunderDB table + remote MySQL table
SELECT
    o.id AS order_id,
    o.product,
    o.price AS our_price,
    rp.price AS erp_price,
    o.price - rp.price AS price_diff
FROM orders o
JOIN erp_remote.products rp ON o.product = rp.product_name
ORDER BY price_diff DESC;
```

### Query an External PostgreSQL Database via FDW

```sql
CREATE FOREIGN SERVER pg_analytics
    TYPE POSTGRES
    OPTIONS (
        host 'pg-analytics.example.com',
        port '5432',
        database 'analytics'
    );

CREATE USER MAPPING FOR thunderdb
    SERVER pg_analytics
    OPTIONS (
        username 'reader',
        password 'secret'
    );

IMPORT FOREIGN SCHEMA public
    FROM SERVER pg_analytics
    INTO SCHEMA analytics_remote;

-- Federated query across ThunderDB local data and remote PostgreSQL
SELECT
    u.username,
    a.page_views,
    a.session_duration_avg
FROM users u
JOIN analytics_remote.user_analytics a ON u.id = a.user_id
WHERE a.page_views > 100
ORDER BY a.page_views DESC;
```

---

## Docker Compose: Full Multi-Protocol Example

Here is a complete `docker-compose.yml` that sets up ThunderDB alongside
a source PostgreSQL (for CDC) and a source MySQL (for FDW), demonstrating
the full integration capabilities:

```yaml
version: "3.9"

services:
  # ── ThunderDB ──────────────────────────────────────────────
  thunderdb:
    image: thunderdb/thunderdb:latest
    container_name: thunderdb
    restart: unless-stopped
    ports:
      - "5432:5432"     # PostgreSQL protocol
      - "3306:3306"     # MySQL protocol
      - "6379:6379"     # Redis / RESP protocol
      - "8088:8088"     # REST API
      - "9090:9090"     # gRPC API
      - "9100:9100"     # Prometheus metrics
    volumes:
      - thunderdb-data:/var/lib/thunderdb
    environment:
      THUNDERDB_LOG_LEVEL: info
      THUNDERDB_ADMIN_PASSWORD: thunderdb
    depends_on:
      pg-source:
        condition: service_healthy
      mysql-source:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "thunderdb-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Source PostgreSQL (for CDC demo) ───────────────────────
  pg-source:
    image: postgres:16
    container_name: pg-source
    restart: unless-stopped
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: appsecret
      POSTGRES_DB: myapp
    command:
      - "postgres"
      - "-c"
      - "wal_level=logical"
      - "-c"
      - "max_replication_slots=4"
      - "-c"
      - "max_wal_senders=4"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d myapp"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ── Source MySQL (for FDW demo) ────────────────────────────
  mysql-source:
    image: mysql:8.0
    container_name: mysql-source
    restart: unless-stopped
    ports:
      - "3307:3306"
    environment:
      MYSQL_ROOT_PASSWORD: rootsecret
      MYSQL_DATABASE: erp
      MYSQL_USER: readonly_user
      MYSQL_PASSWORD: secret
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  thunderdb-data:
    driver: local
```

Start everything:

```bash
# Start the full stack
docker-compose up -d

# Wait for all services to be healthy
docker-compose ps

# Connect to ThunderDB via psql
psql -h localhost -p 5432 -U thunderdb -d default

# Connect to ThunderDB via mysql client
mysql -h 127.0.0.1 -P 3306 -u thunderdb -p --database=default

# Connect to ThunderDB via redis-cli
redis-cli -h localhost -p 6379

# Hit the REST API
curl http://localhost:8088/api/v1/health
```

---

## Verifying Your Installation

Run the built-in self-check to make sure everything is working:

```bash
# Using the CLI tool
thunderdb-cli doctor

# Expected output:
# [OK] Storage engine initialized
# [OK] PostgreSQL protocol on :5432
# [OK] MySQL protocol on :3306
# [OK] Redis protocol on :6379
# [OK] REST API on :8088
# [OK] gRPC API on :9090
# [OK] Vector index support available
# [OK] CDC module loaded
# [OK] FDW module loaded
# All checks passed.
```

Or via SQL:

```sql
-- Show server version and build info
SELECT thunderdb_version();
-- ThunderDB 0.1.0 (rustc 1.78.0, release, linux-x86_64)

-- Show enabled features
SELECT * FROM thunderdb_features();
-- +----------------+---------+
-- | feature        | enabled |
-- +----------------+---------+
-- | vector_search  | true    |
-- | cdc            | true    |
-- | fdw            | true    |
-- | full_text      | true    |
-- | columnar_store | true    |
-- +----------------+---------+
```

---

## Next Steps

Now that you have ThunderDB running and have executed your first queries,
explore the rest of the documentation:

- **[Architecture](../architecture/)** -- Understand how ThunderDB's distributed
  engine, storage layers, consensus protocol, and query optimizer work together.
- **[SQL Reference](../developer/sql-reference/)** -- Complete reference for all
  supported SQL statements, data types, functions, and operators.
- **[API Reference](../developer/api-reference/)** -- REST, gRPC, GraphQL, and
  WebSocket API documentation with request/response examples.
- **[SDK Guide](../developer/sdk/)** -- Client libraries for Python, Go, Java,
  Node.js, and Rust with code samples.
- **[Configuration](../administrator/configuration/)** -- Tune ThunderDB for your
  workload with detailed configuration reference.
- **[Deployment](../administrator/deployment/)** -- Production deployment guides
  for Kubernetes, bare-metal, and cloud-managed environments.
- **[Monitoring](../administrator/monitoring/)** -- Set up Prometheus metrics,
  Grafana dashboards, and alerting for your ThunderDB cluster.
- **[Examples](../developer/examples/)** -- End-to-end application examples
  including RAG pipelines, real-time dashboards, and multi-protocol microservices.
