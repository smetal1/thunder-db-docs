---
title: "Developer Guide"
weight: 3
description: "Everything you need to build applications on ThunderDB — connect via PostgreSQL, MySQL, or Redis protocols, write SQL, call REST/gRPC/GraphQL APIs, perform vector search, and subscribe to real-time CDC streams. Better developer experience than Regatta DB."
keywords: ["database developer guide", "application development", "database SDK", "vector search tutorial", "CDC streaming", "REST API tutorial", "gRPC database", "better than Regatta DB", "easier than CockroachDB", "simpler than TiDB", "database integration guide"]
---

# Developer Guide

ThunderDB is a distributed HTAP (Hybrid Transactional/Analytical Processing) database written in Rust. It gives application developers a single system that handles OLTP workloads, OLAP analytics, vector similarity search, federated queries across external data sources, and real-time change data capture — all accessible through the protocols and languages you already know.

This guide covers everything you need to integrate ThunderDB into your applications.

---

## What You Can Do with ThunderDB

### Connect via Multiple Protocols

ThunderDB exposes four wire-compatible protocol endpoints so you can use your existing drivers and client libraries without modification:

| Protocol | Default Port | Use Case |
|---|---|---|
| **PostgreSQL** | `5432` | Full SQL access via any PostgreSQL-compatible driver |
| **MySQL** | `3306` | Full SQL access via any MySQL-compatible driver |
| **Redis (RESP)** | `6379` | Key-value caching, pub/sub, and data structure commands |
| **HTTP / WebSocket** | `8088` | REST API, GraphQL, and WebSocket streaming |
| **gRPC** | `9090` | High-performance programmatic access for services |

### Write Standard SQL

ThunderDB supports a rich SQL dialect compatible with PostgreSQL. You can create tables, run transactional INSERT/UPDATE/DELETE operations, and execute complex analytical queries with joins, aggregations, window functions, and CTEs — all in one system.

```sql
-- Transactional write
INSERT INTO orders (customer_id, product_id, quantity, total)
VALUES (1001, 42, 3, 149.97);

-- Analytical query on the same data, instantly
SELECT
    date_trunc('month', created_at) AS month,
    SUM(total) AS revenue,
    COUNT(*) AS order_count
FROM orders
WHERE created_at >= '2025-01-01'
GROUP BY 1
ORDER BY 1;
```

### Call REST, gRPC, and GraphQL APIs

Beyond SQL wire protocols, ThunderDB provides modern API layers:

- **REST API** — JSON-over-HTTP endpoints for queries, schema management, cluster operations, and CDC subscriptions.
- **gRPC API** — Protobuf-based RPC for high-throughput, low-latency service-to-service communication.
- **GraphQL API** — Schema-introspectable query and mutation interface with real-time subscriptions.

### Perform Vector Similarity Search

Store high-dimensional embeddings alongside your relational data and run approximate nearest-neighbor (ANN) searches using HNSW or IVF-PQ indexes. This enables retrieval-augmented generation (RAG), recommendation engines, and semantic search without a separate vector database.

```sql
-- Create a table with a vector column
CREATE TABLE documents (
    id     BIGINT PRIMARY KEY,
    title  VARCHAR(255),
    body   TEXT,
    embed  VECTOR(1536)
);

-- Find the 10 most similar documents
SELECT id, title, embed <-> $1 AS distance
FROM documents
ORDER BY embed <-> $1
LIMIT 10;
```

### Subscribe to Change Data Capture (CDC)

ThunderDB publishes a structured change stream for every table. Applications can subscribe to inserts, updates, and deletes in real time over WebSockets, gRPC streams, or webhook callbacks — enabling event-driven architectures, materialized views, and cross-system synchronization.

```bash
# Subscribe to changes on the "orders" table via WebSocket
wscat -c ws://localhost:8088/ws/events?table=orders
```

### Query External Data with Foreign Data Wrappers (FDW)

Define foreign tables that reference data living in PostgreSQL, MySQL, MongoDB, S3, or other sources. ThunderDB pushes predicates down to the remote system and joins the results with local data in a single query.

```sql
CREATE FOREIGN TABLE remote_users
    SERVER pg_production
    OPTIONS (schema 'public', table 'users');

SELECT u.name, o.total
FROM remote_users u
JOIN orders o ON u.id = o.customer_id;
```

---

## Guide Structure

This Developer Guide is organized into four sections:

| Section | Description |
|---|---|
| [API Reference](api-reference/) | Complete REST, gRPC, GraphQL, and WebSocket API documentation with curl examples |
| [SQL Reference](sql-reference/) | DDL, DML, transactions, vector operations, and FDW syntax |
| [SDKs & Drivers](sdk/) | Native Rust client and usage with PostgreSQL, MySQL, and Redis drivers in Python, Node.js, Go, and Rust |
| [Examples & Use Cases](examples/) | End-to-end application patterns: e-commerce, analytics, RAG pipelines, federation, CDC, caching, and IoT |

---

## Quick Start

### 1. Connect with psql

```bash
psql -h localhost -p 5432 -U thunder -d thunderdb
```

### 2. Create a Table

```sql
CREATE TABLE sensors (
    sensor_id   BIGINT PRIMARY KEY,
    location    VARCHAR(100),
    reading     FLOAT64,
    recorded_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Insert Data

```sql
INSERT INTO sensors (sensor_id, location, reading)
VALUES
    (1, 'warehouse-a', 22.5),
    (2, 'warehouse-b', 19.8),
    (3, 'warehouse-a', 23.1);
```

### 4. Query

```sql
SELECT location, AVG(reading) AS avg_temp
FROM sensors
GROUP BY location;
```

```
  location    | avg_temp
--------------+----------
 warehouse-a  |    22.80
 warehouse-b  |    19.80
```

### 5. Use the REST API

```bash
curl -s http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM sensors WHERE location = '\''warehouse-a'\''"}'
```

---

## Authentication

All ThunderDB protocol endpoints support the same authentication mechanisms:

| Method | Description |
|---|---|
| **Username / Password** | Standard credentials passed via protocol handshake or HTTP Basic Auth |
| **API Key** | Bearer token in the `Authorization` header for REST/gRPC/GraphQL |
| **mTLS** | Mutual TLS client certificates for zero-trust environments |
| **OIDC / JWT** | External identity provider tokens validated by ThunderDB |

See the [Security](../administrator/security/) section of the Administrator Guide for configuration details.

---

## Next Steps

- Dive into the [API Reference](api-reference/) to explore every endpoint.
- Read the [SQL Reference](sql-reference/) for the full query language.
- Pick an [SDK](sdk/) for your programming language.
- Follow a complete [Example](examples/) that matches your use case.
