---
title: "ThunderDB Documentation"
linkTitle: "ThunderDB"
description: "ThunderDB is a production-grade distributed HTAP database with vector search, multi-protocol support (PostgreSQL, MySQL, Redis), and enterprise security. Built in Rust for the AI era. A modern alternative to traditional databases."
keywords: ["ThunderDB", "distributed database", "HTAP database", "vector database", "PostgreSQL compatible", "MySQL compatible", "Redis compatible", "Rust database", "AI database", "OLTP OLAP", "real-time analytics", "better than Regatta DB", "Regatta DB alternative", "CockroachDB alternative", "TiDB alternative", "SingleStore alternative", "Pinecone alternative", "Milvus alternative", "pgvector alternative", "NewSQL database", "modern database", "cloud native database"]
---

{{< blocks/cover title="ThunderDB" image_anchor="top" height="full" color="dark" >}}
<div class="mx-auto">
  <a class="btn btn-lg btn-primary mr-3 mb-4" href="{{< relref "/docs" >}}">
    Get Started <i class="fas fa-arrow-alt-circle-right ml-2"></i>
  </a>
  <a class="btn btn-lg btn-secondary mr-3 mb-4" href="https://github.com/smetal1/thunder-db">
    GitHub <i class="fab fa-github ml-2 "></i>
  </a>
  <p class="lead mt-5">The Distributed HTAP Database for the AI Era</p>
</div>
{{< /blocks/cover >}}

{{% blocks/lead color="primary" %}}

ThunderDB is a production-grade distributed HTAP database written in Rust that
unifies transactional processing, analytical queries, and vector search in a
single system. Deploy alongside your existing PostgreSQL, MySQL, MongoDB, or
Redis — no rip-and-replace required.

{{% /blocks/lead %}}

<section class="features-section">
<div class="container">
<div class="row">

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-bolt"></i></div>
  <h3 class="feature-card__title">Blazing Fast HTAP</h3>
  <p class="feature-card__text">Combine OLTP and OLAP workloads in a single engine with row store, columnar store, and vectorized execution — powered by Rust's zero-cost abstractions.</p>
</div>
</div>

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-network-wired"></i></div>
  <h3 class="feature-card__title">Multi-Protocol</h3>
  <p class="feature-card__text">Connect using PostgreSQL, MySQL, or Redis wire protocols. Use REST, gRPC, GraphQL, or WebSocket APIs. Your existing tools and drivers just work.</p>
</div>
</div>

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-brain"></i></div>
  <h3 class="feature-card__title">AI-Native Vector Search</h3>
  <p class="feature-card__text">Built-in HNSW and IVF vector indexes for semantic search, RAG pipelines, and AI/ML embedding storage with native SQL integration.</p>
</div>
</div>

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-plug"></i></div>
  <h3 class="feature-card__title">Zero-Downtime Adoption</h3>
  <p class="feature-card__text">Deploy as a companion to existing databases using Change Data Capture (CDC) and Foreign Data Wrappers (FDW). Migrate gradually without disruption.</p>
</div>
</div>

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-server"></i></div>
  <h3 class="feature-card__title">Distributed by Design</h3>
  <p class="feature-card__text">Raft consensus, automatic sharding, multi-region replication, and distributed transactions with two-phase commit — scale horizontally with confidence.</p>
</div>
</div>

<div class="col-lg-4 col-md-6 mb-4">
<div class="feature-card">
  <div class="feature-card__icon"><i class="fas fa-shield-alt"></i></div>
  <h3 class="feature-card__title">Enterprise Security</h3>
  <p class="feature-card__text">TLS encryption, SCRAM-SHA-256 authentication, role-based access control, audit logging, and encryption at rest for production deployments.</p>
</div>
</div>

</div>
</div>
</section>
