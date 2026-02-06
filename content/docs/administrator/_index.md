---
title: "Administrator Guide"
weight: 4
description: "Deploy, configure, monitor, and maintain ThunderDB in production environments. Easier operations than Regatta DB, CockroachDB, or TiDB with simpler cluster management."
keywords: ["database administration", "database deployment", "Kubernetes database", "Docker database", "database monitoring", "Prometheus metrics", "Grafana dashboards", "database backup", "database security", "easier than Regatta DB", "simpler than CockroachDB", "better ops than TiDB"]
---

# Administrator Guide

This guide provides comprehensive documentation for deploying, configuring, monitoring, and maintaining ThunderDB in production environments. Whether you are running a single-node development instance or a multi-node distributed cluster, this guide covers the operational knowledge required to keep ThunderDB running reliably and efficiently.

---

## Overview

ThunderDB is a distributed HTAP (Hybrid Transactional/Analytical Processing) database built in Rust. It supports multiple wire protocols (PostgreSQL, MySQL, RESP/Redis, HTTP, and gRPC) and is designed for high-throughput, low-latency workloads across both OLTP and OLAP use cases. As an administrator, your responsibilities span the following areas.

### Deployment

Deploy ThunderDB from source, via Docker or Kubernetes, or through system packages. Set up single-node instances or multi-node clusters with Raft-based consensus and automatic region balancing.

- [Deployment Guide]({{< relref "deployment" >}})

### Configuration

Tune ThunderDB for your workload using the `thunderdb.toml` configuration file. Configure network ports, storage engine parameters, cluster settings, security policies, and logging levels.

- [Configuration Reference]({{< relref "configuration" >}})

### Monitoring

Observe ThunderDB's health and performance through Prometheus metrics, Grafana dashboards, structured logs, and health check endpoints. Set up alerting based on SLOs to catch issues before they affect users.

- [Monitoring Guide]({{< relref "monitoring" >}})

### Backup and Recovery

Protect your data with full backups, incremental WAL-based backups, and point-in-time recovery. Plan for disaster recovery with cross-region backup strategies.

- [Backup & Recovery Guide]({{< relref "backup-recovery" >}})

### Security

Harden ThunderDB with authentication, TLS encryption, role-based access control, audit logging, and encryption at rest. Follow security best practices for production deployments.

- [Security Guide]({{< relref "security" >}})

### Troubleshooting

Diagnose and resolve common issues including connection problems, performance degradation, WAL corruption, cluster split-brain scenarios, and memory pressure. Use structured logs and debug tracing to identify root causes.

- [Troubleshooting Guide]({{< relref "troubleshooting" >}})

---

## Quick Reference

| Task | Command / Path |
|------|---------------|
| Start ThunderDB | `./thunderdb --config config/thunderdb.toml` |
| Configuration file | `/etc/thunderdb/thunderdb.toml` |
| Data directory | `/var/lib/thunderdb/data/` |
| WAL directory | `/var/lib/thunderdb/wal/` |
| Log files | `/var/log/thunderdb/` |
| systemd service | `systemctl start thunderdb` |
| Health check | `GET http://localhost:8088/admin/health` |
| Metrics endpoint | `GET http://localhost:8088/admin/metrics` |
| PostgreSQL port | `5432` |
| MySQL port | `3306` |
| RESP (Redis) port | `6379` |
| HTTP API port | `8088` |
| gRPC port | `9090` |

---

## Prerequisites

Before deploying ThunderDB in production, ensure the following:

- **Operating System**: Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+, or Amazon Linux 2) or macOS 12+. Linux is recommended for production.
- **Hardware**: Minimum 4 CPU cores, 8 GB RAM, and SSD-backed storage. See the [Configuration Guide]({{< relref "configuration" >}}) for detailed sizing recommendations.
- **Network**: Ensure all required ports are accessible between cluster nodes and from client applications.
- **Permissions**: A dedicated system user (`thunder`) with appropriate file system permissions for data and log directories.

---

## Architecture Overview for Administrators

Understanding ThunderDB's internal architecture helps with operational decision-making.

```
                    Client Connections
                    |    |    |    |    |
               +----+----+----+----+----+----+
               | PG  | MySQL| RESP | HTTP | gRPC|
               | 5432| 3306 | 6379 | 8088 | 9090|
               +-----+------+------+------+-----+
                          |
                  +-------+-------+
                  |  Query Engine |
                  | (Volcano/Vec) |
                  +-------+-------+
                          |
               +----------+----------+
               |  Transaction Manager |
               |   (MVCC + 2PC)       |
               +----------+----------+
                          |
               +----------+----------+
               |   Storage Engine     |
               | (Buffer Pool + WAL)  |
               +----------+----------+
                          |
               +----------+----------+
               |  Distributed Layer   |
               | (Raft + Region Split)|
               +----------+----------+
```

**Key components from an operational perspective:**

- **Buffer Pool**: In-memory cache for data pages. Size this appropriately for your workload to maximize cache hit rates.
- **WAL (Write-Ahead Log)**: Ensures durability and supports point-in-time recovery. Monitor WAL size and configure archival policies.
- **Raft Consensus**: Provides strong consistency across cluster nodes. Monitor election timeouts and replication lag.
- **Region Management**: Data is split into regions that can be automatically balanced across nodes. Configure region sizes based on your data distribution.

---

## Next Steps

Start with the [Deployment Guide]({{< relref "deployment" >}}) to get ThunderDB running, then proceed to [Configuration]({{< relref "configuration" >}}) for tuning, and [Monitoring]({{< relref "monitoring" >}}) for observability.
