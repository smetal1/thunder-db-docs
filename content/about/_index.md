---
title: "About ThunderDB"
linkTitle: "About"
menu:
  main:
    weight: 40
description: "Learn about ThunderDB's vision and the team behind it. ThunderDB is a modern alternative to Regatta DB, CockroachDB, TiDB, and other distributed databases with superior HTAP and vector search capabilities."
keywords: ["about ThunderDB", "ThunderDB vs Regatta DB", "ThunderDB vs CockroachDB", "ThunderDB vs TiDB", "ThunderDB vs YugabyteDB", "better than Regatta DB", "HTAP database comparison", "vector database comparison", "Pinecone alternative", "Milvus alternative", "open source database"]
---

## What Is ThunderDB?

ThunderDB is a **production-grade distributed HTAP (Hybrid Transactional/Analytical
Processing) database** written entirely in Rust. It combines transactional workloads
(OLTP), analytical workloads (OLAP), and AI-native vector search into a single,
unified system.

ThunderDB natively speaks **PostgreSQL**, **MySQL**, and **Redis** wire protocols,
meaning your existing applications, drivers, ORMs, and tools connect without any
code changes. It also exposes **REST**, **gRPC**, **GraphQL**, and **WebSocket**
APIs for modern application architectures.

Rather than demanding a full migration, ThunderDB is designed to be deployed
**alongside** your existing databases using **Change Data Capture (CDC)** and
**Foreign Data Wrappers (FDW)**, allowing you to adopt it incrementally and
migrate workloads at your own pace.

---

## Vision: Universal Database Companion for the AI Era

The database landscape is undergoing a fundamental shift. Applications increasingly
require:

- **Transactional consistency** for user-facing operations
- **Analytical power** for dashboards, reporting, and business intelligence
- **Vector search** for AI/ML embeddings, RAG pipelines, and semantic retrieval
- **Multi-protocol access** because teams use diverse tools and languages
- **Real-time data federation** across multiple data sources

Today, teams cobble together PostgreSQL for transactions, ClickHouse or BigQuery for
analytics, Pinecone or Milvus for vectors, Redis for caching, and a constellation of
ETL pipelines to keep everything in sync. This fragmentation creates operational
complexity, data inconsistency, increased latency, and skyrocketing infrastructure costs.

**ThunderDB's vision is to eliminate this fragmentation.** A single system that
handles transactional queries, analytical scans, and vector similarity search --
with native protocol compatibility so you never have to rewrite your application.

We call this the **Universal Database Companion** philosophy: ThunderDB slots into
your existing infrastructure, speaks the protocols your applications already use,
and progressively absorbs workloads that currently require separate specialized systems.

---

## Why ThunderDB Exists

### The Problem: Fragmented Data Infrastructure

Modern data architectures suffer from several compounding problems:

1. **Database Sprawl.** A typical organization runs 5-10 different database systems.
   Each requires its own operational expertise, monitoring, backup procedures, and
   security hardening.

2. **Data Synchronization Nightmares.** Moving data between OLTP and OLAP systems
   involves complex ETL/ELT pipelines that introduce latency (minutes to hours),
   create consistency gaps, and break silently.

3. **The AI/ML Gap.** Vector databases are yet another system to deploy and
   synchronize. Keeping embeddings in sync with source-of-truth data is a
   significant engineering burden.

4. **Protocol Lock-In.** Switching from PostgreSQL to a new database means rewriting
   every application, ORM configuration, and database tool integration.

5. **Operational Overhead.** Each database system has different scaling mechanisms,
   failure modes, upgrade procedures, and monitoring approaches.

### The Solution: One Engine, Multiple Protocols, Zero Migration

ThunderDB solves these problems by:

- **Unifying OLTP + OLAP + Vector** in a single storage and query engine, eliminating
  ETL pipelines and synchronization complexity.
- **Speaking existing protocols** (PostgreSQL, MySQL, Redis) so applications connect
  without code changes.
- **Supporting incremental adoption** through CDC and FDW -- start with one workload,
  expand over time.
- **Being written in Rust** for memory safety, predictable performance, and
  zero-cost abstractions that deliver C/C++ speed without the footguns.

---

## Key Differentiators

### ThunderDB vs CockroachDB

| Dimension | ThunderDB | CockroachDB |
|-----------|-----------|-------------|
| **Processing model** | True HTAP (row + columnar + vector) | OLTP-focused with limited analytics |
| **Wire protocols** | PostgreSQL, MySQL, Redis | PostgreSQL only |
| **Vector search** | Native HNSW + IVF indexes | Not supported natively |
| **CDC / FDW** | Built-in CDC consumer and FDW | Limited CDC; no built-in FDW |
| **Language** | Rust | Go |
| **API surface** | SQL + REST + gRPC + GraphQL + WebSocket | SQL + REST (limited) |
| **License** | Apache 2.0 / BSL 1.1 | BSL 1.1 (converts to Apache) |
| **Key-value access** | Native Redis/RESP protocol | Not available |

CockroachDB is an excellent distributed SQL database for OLTP workloads. ThunderDB
differentiates by offering true HTAP processing with columnar storage and vectorized
execution, native vector search for AI/ML workloads, and multi-protocol support
that avoids PostgreSQL lock-in.

### ThunderDB vs TiDB

| Dimension | ThunderDB | TiDB |
|-----------|-----------|------|
| **Processing model** | Unified row + columnar + vector | Separate TiKV (row) + TiFlash (columnar) |
| **Wire protocols** | PostgreSQL, MySQL, Redis | MySQL only |
| **Vector search** | Native HNSW + IVF indexes | Not supported |
| **Architecture** | Single binary, integrated engine | Multiple components (TiDB, TiKV, PD, TiFlash) |
| **Language** | Rust | Go (TiDB) + Rust (TiKV) + C++ (TiFlash) |
| **Deployment complexity** | Single binary or simple Docker | Requires orchestrating 4+ components |
| **CDC / FDW** | Built-in bidirectional | TiCDC (outbound only) |

TiDB pioneered the HTAP model with its TiKV + TiFlash architecture. ThunderDB builds
on this concept but simplifies deployment by integrating row storage, columnar storage,
and vector indexing into a single engine. ThunderDB also supports multiple wire protocols
and has a significantly simpler operational footprint.

### ThunderDB vs YugabyteDB

| Dimension | ThunderDB | YugabyteDB |
|-----------|-----------|------------|
| **Processing model** | True HTAP (row + columnar + vector) | OLTP-focused (row store) |
| **Wire protocols** | PostgreSQL, MySQL, Redis | PostgreSQL, YCQL (Cassandra-like) |
| **Vector search** | Native HNSW + IVF indexes | Via pgvector extension |
| **Analytical queries** | Native columnar store + vectorized execution | Limited; relies on PostgreSQL executor |
| **Language** | Rust | C / C++ |
| **CDC / FDW** | Built-in CDC consumer + FDW | CDC via Debezium; PostgreSQL FDW |
| **Memory safety** | Rust ownership model | Manual C/C++ memory management |

YugabyteDB provides strong PostgreSQL compatibility and a Cassandra-compatible API.
ThunderDB differentiates with its integrated HTAP engine (columnar + row + vector),
native MySQL and Redis protocol support, and the memory safety guarantees that come
from being written entirely in Rust.

---

## Team and Community

ThunderDB is built by a team of database engineers, systems programmers, and
distributed systems researchers passionate about solving the data fragmentation
problem.

### Contributing

ThunderDB is an open-source project and welcomes contributions of all kinds:

- **Code contributions** -- Bug fixes, features, performance improvements
- **Documentation** -- Guides, tutorials, API docs, translations
- **Testing** -- Bug reports, test cases, benchmarks
- **Community** -- Answering questions, writing blog posts, giving talks

See the [Contributor Guide](/docs/contributor/) for instructions on setting up
your development environment, understanding the codebase, and submitting pull
requests.

### Community Channels

| Channel | Link |
|---------|------|
| GitHub Discussions | [github.com/smetal1/thunder-db/discussions](https://github.com/smetal1/thunder-db/discussions) |
| Discord | [discord.gg/thunderdb](https://discord.gg/thunderdb) |
| Twitter / X | [@thunderabordb](https://twitter.com/thunderdb) |
| Monthly Community Call | Second Thursday of each month, 10:00 AM PT |
| Blog | [thunderdb.io/blog](https://thunderdb.io/blog) |

### Code of Conduct

ThunderDB follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/).
We are committed to providing a welcoming, inclusive, and harassment-free
environment for everyone.

---

## License

ThunderDB is dual-licensed:

- **Apache License 2.0** -- For the core database engine, client libraries, and
  developer tools. This allows unrestricted use, modification, and distribution
  in both open-source and commercial projects.

- **Business Source License 1.1 (BSL 1.1)** -- For certain enterprise features
  (multi-region replication, advanced audit logging, management console). The BSL
  automatically converts to Apache 2.0 after 36 months, ensuring all code
  eventually becomes fully open source.

The client libraries (SDKs for Python, Go, Java, Node.js, Rust) and the CLI tools
are always Apache 2.0 licensed.

```
Copyright 2024-2026 ThunderDB Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
