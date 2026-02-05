---
title: "Troubleshooting"
weight: 6
description: "Diagnose and resolve common issues with ThunderDB including connection problems, performance degradation, WAL corruption, and cluster failures."
---

# Troubleshooting

This guide helps you diagnose and resolve common issues with ThunderDB. It covers connection problems, performance degradation, storage issues, cluster failures, and emergency procedures.

---

## Diagnostic Tools

Before diving into specific issues, familiarize yourself with the diagnostic tools available.

### Debug Logging

Enable verbose logging to gather detailed information about internal operations:

```bash
# Via environment variable (most detailed)
RUST_LOG=trace ./thunderdb --config /etc/thunderdb/thunderdb.toml

# For specific subsystems only
RUST_LOG=thunderdb::storage=debug,thunderdb::cluster=trace ./thunderdb --config /etc/thunderdb/thunderdb.toml

# Via runtime API (does not require restart)
curl -X PUT http://localhost:8088/admin/config/log_level -d '{"level": "debug"}'
```

### Useful Log Targets

| Target | Description |
|--------|-------------|
| `thunderdb::server` | Server startup, shutdown, and connection handling. |
| `thunderdb::query` | Query parsing, planning, and execution. |
| `thunderdb::storage` | Buffer pool, page I/O, compaction. |
| `thunderdb::wal` | Write-ahead log operations. |
| `thunderdb::cluster` | Raft consensus, region management, replication. |
| `thunderdb::txn` | Transaction management, MVCC, locking. |
| `thunderdb::protocol::pg` | PostgreSQL wire protocol handling. |
| `thunderdb::protocol::mysql` | MySQL wire protocol handling. |
| `thunderdb::protocol::resp` | RESP (Redis) wire protocol handling. |
| `thunderdb::security` | Authentication, authorization, TLS. |

### Health and Status Endpoints

```bash
# Overall health
curl http://localhost:8088/admin/health

# Readiness status
curl http://localhost:8088/admin/ready

# Cluster membership
curl http://localhost:8088/admin/cluster/members

# Raft status
curl http://localhost:8088/admin/cluster/raft

# Region distribution
curl http://localhost:8088/admin/cluster/regions

# Active connections
curl http://localhost:8088/admin/connections

# Current queries
curl http://localhost:8088/admin/queries

# Storage statistics
curl http://localhost:8088/admin/storage/stats

# WAL status
curl http://localhost:8088/admin/wal/status
```

---

## Common Issues and Solutions

### ThunderDB Fails to Start

**Symptom:** ThunderDB exits immediately after startup with an error.

**Check the logs:**

```bash
journalctl -u thunderdb --no-pager -n 50
# or
RUST_LOG=debug ./thunderdb --config /etc/thunderdb/thunderdb.toml 2>&1 | head -100
```

**Common causes:**

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Address already in use` | Another process is using a required port. | Check `ss -tlnp \| grep <port>` and stop the conflicting process or change the port. |
| `Permission denied: /var/lib/thunderdb/data` | ThunderDB does not have write access to the data directory. | Fix ownership: `chown -R thunder:thunder /var/lib/thunderdb`. |
| `Invalid configuration` | Syntax error or invalid value in `thunderdb.toml`. | Validate the TOML file and check against the configuration reference. |
| `Failed to open WAL` | WAL directory is missing or corrupted. | Verify the directory exists and has correct permissions. If corrupted, see WAL corruption recovery. |
| `Cannot bind to address` | The `listen_addr` is not available on this host. | Use `0.0.0.0` or a valid IP address assigned to the host. |
| `Incompatible page size` | `page_size` differs from the existing data files. | Use the same `page_size` as when the data was created. |

### ThunderDB Starts but Clients Cannot Connect

**Symptom:** ThunderDB is running but clients receive connection refused or timeout errors.

**Diagnostic steps:**

```bash
# 1. Verify ThunderDB is listening on the expected ports
ss -tlnp | grep thunderdb

# 2. Check if the node is ready
curl http://localhost:8088/admin/ready

# 3. Test local connectivity
psql -h 127.0.0.1 -p 5432 -U admin

# 4. Test remote connectivity
psql -h <thunderdb-ip> -p 5432 -U admin

# 5. Check firewall rules
sudo ufw status
sudo iptables -L -n
```

---

## Connection Problems by Protocol

### PostgreSQL Connection Issues

**"Connection refused":**

```bash
# Verify pg_port is configured and ThunderDB is listening
curl http://localhost:8088/admin/health
ss -tln | grep 5432
```

**"Authentication failed":**

```bash
# Verify the user exists and password is correct
# Check audit log for details
tail -20 /var/log/thunderdb/audit.log | grep auth

# Verify authentication is configured correctly
grep authentication_enabled /etc/thunderdb/thunderdb.toml
```

**"SSL required" or TLS handshake errors:**

```bash
# If TLS is enabled, clients must use SSL
psql "host=localhost port=5432 user=admin sslmode=require"

# Verify certificate paths are correct
openssl x509 -in /etc/thunderdb/tls/server.crt -noout -dates
```

**Connection timeout:**

```bash
# Check network path
traceroute <thunderdb-host>

# Check for connection limits
curl http://localhost:8088/admin/connections | python3 -m json.tool
```

### MySQL Connection Issues

**"Access denied for user":**

```bash
# Verify credentials
mysql -h localhost -P 3306 -u admin -p

# Check if the MySQL protocol handler is running
curl http://localhost:8088/admin/health | python3 -m json.tool
```

**"Plugin caching_sha2_password could not be loaded":**

This indicates the client is too old to support SHA-256 authentication. Either upgrade the client or connect using the legacy plugin:

```bash
mysql -h localhost -P 3306 -u admin -p --default-auth=mysql_native_password
```

### RESP (Redis) Connection Issues

**"NOAUTH Authentication required":**

```bash
# Authenticate after connecting
redis-cli -h localhost -p 6379
> AUTH admin mypassword
```

**"Connection reset by peer":**

```bash
# Check if TLS is required
redis-cli -h localhost -p 6379 --tls --cacert ca.crt
```

### HTTP API Connection Issues

**"Connection refused" on port 8088:**

```bash
# This is the admin/API port; verify it is enabled
grep http_port /etc/thunderdb/thunderdb.toml
ss -tln | grep 8088
```

### gRPC Connection Issues

**"Unavailable" or "Transport closing":**

```bash
# Verify gRPC port is accessible
grpcurl -plaintext localhost:9090 list

# If TLS is enabled
grpcurl -cacert ca.crt localhost:9090 list
```

---

## Performance Degradation

### Slow Queries

**Symptoms:** Increasing query latency, slow query log entries, user complaints about response times.

**Diagnostic steps:**

```bash
# 1. Check current slow queries
curl http://localhost:8088/admin/queries

# 2. Review slow query log
grep "Slow query" /var/log/thunderdb/thunderdb.log | tail -20

# 3. Check buffer pool hit rate
curl -s http://localhost:8088/admin/metrics | grep buffer_pool_hit_ratio
# Target: > 0.95. If lower, buffer pool is too small.

# 4. Check for lock contention
curl http://localhost:8088/admin/locks

# 5. Check compaction backlog
curl -s http://localhost:8088/admin/metrics | grep compaction_pending
```

**Solutions:**

| Cause | Metric Indicator | Solution |
|-------|-----------------|----------|
| Buffer pool too small | `buffer_pool_hit_ratio < 0.90` | Increase `buffer_pool_size`. |
| Missing indexes | High `rows_examined` in slow queries | Create appropriate indexes. |
| Lock contention | High lock wait times | Optimize transaction scope, reduce transaction size. |
| Compaction backlog | `compaction_pending > 50` | Increase `compaction_threads`. |
| Large result sets | High `rows_returned` | Add LIMIT clauses, use pagination. |
| Full table scans | Sequential scan on large tables | Create indexes, rewrite queries. |

### High CPU Usage

```bash
# 1. Check active queries for expensive operations
curl http://localhost:8088/admin/queries

# 2. Check compaction thread activity
curl -s http://localhost:8088/admin/metrics | grep compaction

# 3. Profile the process (requires perf tools)
sudo perf top -p $(pgrep thunderdb)
```

**Solutions:**
- Kill expensive queries: `curl -X POST http://localhost:8088/admin/queries/<query_id>/cancel`
- Reduce `compaction_threads` if compaction is consuming too much CPU.
- Check for runaway analytics queries consuming excessive CPU.

### High Memory Usage

```bash
# 1. Check memory breakdown
curl http://localhost:8088/admin/storage/stats

# 2. Check buffer pool usage
curl -s http://localhost:8088/admin/metrics | grep memory_usage

# 3. Check OS-level memory
free -h
cat /proc/$(pgrep thunderdb)/status | grep VmRSS
```

**Solutions:**
- Reduce `buffer_pool_size` if the system is under memory pressure.
- Reduce `wal_buffer_size`.
- Check for memory leaks by monitoring memory growth over time.

---

## WAL Corruption Recovery

WAL corruption is rare but can occur due to hardware failures, abrupt power loss, or disk errors.

### Detecting WAL Corruption

**Symptoms:**
- ThunderDB fails to start with WAL-related errors.
- Recovery phase reports checksum mismatches.
- Log messages like `WAL segment corrupted` or `Invalid WAL record at LSN`.

**Check WAL integrity:**

```bash
thunderdb --verify-wal --config /etc/thunderdb/thunderdb.toml
```

### Recovery from WAL Corruption

**Option 1: Skip corrupted WAL records (potential data loss):**

```bash
# WARNING: This may result in loss of recent transactions.
thunderdb --recover-wal --skip-corrupted --config /etc/thunderdb/thunderdb.toml
```

This skips corrupted WAL records during recovery. Transactions that depended on corrupted records may be lost.

**Option 2: Restore from backup:**

If data integrity is critical, restore from the most recent backup and replay WAL archives up to the point of corruption:

```bash
# 1. Stop ThunderDB
sudo systemctl stop thunderdb

# 2. Restore from backup
thunderdb --restore-pitr "2026-01-15T10:00:00Z" \
  --restore-backup /backups/thunderdb/full-2026-01-15

# 3. Start ThunderDB
sudo systemctl start thunderdb
```

**Option 3: Re-replicate from cluster peers:**

If the node is part of a healthy cluster, remove its data and let it re-replicate:

```bash
# 1. Stop the node
sudo systemctl stop thunderdb

# 2. Remove data and WAL directories
sudo rm -rf /var/lib/thunderdb/data/*
sudo rm -rf /var/lib/thunderdb/wal/*

# 3. Start the node -- it will rejoin the cluster and re-replicate
sudo systemctl start thunderdb
```

---

## Cluster Split-Brain Handling

A split-brain occurs when network partitions cause cluster nodes to diverge, potentially electing multiple leaders.

### Detecting Split-Brain

**Symptoms:**
- Multiple nodes report themselves as leaders.
- Clients connected to different nodes see different data.
- Raft term increases rapidly (frequent elections).

```bash
# Check Raft status on each node
for node in 10.0.1.1 10.0.1.2 10.0.1.3; do
  echo "--- Node: $node ---"
  curl -s http://$node:8088/admin/cluster/raft | python3 -m json.tool
done
```

### Prevention

ThunderDB's Raft implementation prevents split-brain through quorum-based consensus:
- A leader must have support from a majority of nodes (quorum).
- In a 3-node cluster, a leader needs 2 votes (tolerates 1 failure).
- In a 5-node cluster, a leader needs 3 votes (tolerates 2 failures).

**Best practices:**
- Always use an odd number of nodes (3, 5, 7).
- Ensure reliable network connectivity between all nodes.
- Set appropriate `raft_election_timeout` (increase for unreliable networks).
- Monitor Raft term changes to detect election storms.

### Resolution

If a split-brain does occur (e.g., due to a symmetric network partition):

1. **Identify the partition:** Determine which nodes can communicate with which.
2. **Resolve the network issue:** Restore connectivity between all nodes.
3. **The Raft protocol will self-heal:** Once connectivity is restored, nodes will converge on a single leader with the highest term and most up-to-date log.
4. **Verify data consistency:**

   ```bash
   curl http://localhost:8088/admin/cluster/consistency-check
   ```

5. **If data inconsistency is detected:** The minority partition's writes (if any were accepted without quorum) are automatically rolled back when the partition heals.

---

## Memory Pressure and OOM

### Detecting Memory Pressure

```bash
# Check if OOM killer was invoked
dmesg | grep -i "out of memory"
journalctl -k | grep -i oom

# Check ThunderDB memory usage
curl -s http://localhost:8088/admin/metrics | grep memory_usage

# Check system memory
free -h
vmstat 1 5
```

### Preventing OOM

1. **Size the buffer pool appropriately:** Do not set `buffer_pool_size` to more than 70% of total system RAM.

2. **Set memory limits:**

   For systemd:
   ```ini
   [Service]
   MemoryMax=12G
   MemoryHigh=10G
   ```

   For Kubernetes:
   ```yaml
   resources:
     limits:
       memory: 12Gi
     requests:
       memory: 8Gi
   ```

3. **Monitor memory trends:** Set up alerting for memory usage above 80%.

4. **Disable swap** to avoid performance degradation:
   ```bash
   sudo swapoff -a
   ```

### Recovery from OOM

If ThunderDB is killed by the OOM killer:

```bash
# 1. Check if the process was OOM-killed
dmesg | tail -20

# 2. Restart ThunderDB (ARIES recovery will handle crash recovery)
sudo systemctl start thunderdb

# 3. Monitor recovery progress
journalctl -u thunderdb -f

# 4. After recovery, reduce memory configuration to prevent recurrence
# Edit /etc/thunderdb/thunderdb.toml: reduce buffer_pool_size
sudo systemctl restart thunderdb
```

---

## Disk Space Management

### Monitoring Disk Usage

```bash
# ThunderDB disk usage breakdown
curl http://localhost:8088/admin/storage/stats

# System-level disk usage
df -h /var/lib/thunderdb/data
df -h /var/lib/thunderdb/wal
du -sh /var/lib/thunderdb/data/*
du -sh /var/lib/thunderdb/wal/*
```

### Reclaiming Disk Space

**Force a checkpoint and compact:**

```bash
# Force a checkpoint to flush dirty pages and allow WAL truncation
curl -X POST http://localhost:8088/admin/checkpoint

# Trigger manual compaction
curl -X POST http://localhost:8088/admin/storage/compact
```

**Clean up WAL archives:**

```bash
# Remove old WAL archive files beyond retention
find /backups/thunderdb/wal-archive -mtime +7 -delete
```

**Drop unused tables or databases:**

```sql
DROP TABLE IF EXISTS old_data_table;
DROP DATABASE IF EXISTS staging;
```

### Emergency: Disk Full

If the disk is completely full, ThunderDB will stop accepting writes to prevent data corruption.

```bash
# 1. Free space immediately by removing old WAL archive files or temp files
sudo rm -f /var/lib/thunderdb/wal/*.tmp
sudo rm -rf /tmp/thunderdb-*

# 2. If WAL directory is full, force a checkpoint to allow WAL truncation
# (This requires enough space for the checkpoint itself)
curl -X POST http://localhost:8088/admin/checkpoint

# 3. Add more disk space (expand volume, attach additional disk)
# Then restart if ThunderDB entered read-only mode:
sudo systemctl restart thunderdb
```

---

## Log Analysis Guide

### Finding Errors

```bash
# Search for errors in the last hour
journalctl -u thunderdb --since "1 hour ago" -p err

# Search for specific error patterns
journalctl -u thunderdb | grep -i "panic\|error\|fatal"

# For JSON-formatted logs, use jq
journalctl -u thunderdb --output=cat | jq 'select(.level == "error")'
```

### Analyzing Slow Queries

```bash
# Extract slow query entries
journalctl -u thunderdb --output=cat | jq 'select(.target == "thunderdb::query::slow")'

# Get the top 10 slowest queries
journalctl -u thunderdb --output=cat | \
  jq 'select(.target == "thunderdb::query::slow") | {duration_ms, query}' | \
  jq -s 'sort_by(.duration_ms) | reverse | .[:10]'
```

### Tracking Connection Events

```bash
# Connection events
journalctl -u thunderdb --output=cat | jq 'select(.message | test("connection|disconnect"))'

# Authentication failures
journalctl -u thunderdb --output=cat | jq 'select(.event == "auth" and .status == "failure")'
```

### Cluster Event Timeline

```bash
# Raft elections and leader changes
journalctl -u thunderdb --output=cat | jq 'select(.target == "thunderdb::cluster" and (.message | test("election|leader")))'

# Region splits and merges
journalctl -u thunderdb --output=cat | jq 'select(.message | test("region.*split|region.*merge"))'
```

---

## Emergency Procedures

The following procedures are derived from the operational runbook (`deploy/runbook.md`).

### Emergency: Node Unresponsive

```bash
# 1. Check if the process is running
pgrep -f thunderdb

# 2. Check for resource exhaustion
top -p $(pgrep thunderdb)
free -h
df -h

# 3. If the process is stuck (not responding to signals)
sudo kill -SIGQUIT $(pgrep thunderdb)  # Generates a thread dump in logs
sleep 5

# 4. Force kill if necessary
sudo kill -9 $(pgrep thunderdb)

# 5. Restart
sudo systemctl start thunderdb

# 6. Monitor recovery
journalctl -u thunderdb -f
```

### Emergency: Cluster Lost Quorum

If the cluster has lost quorum (majority of nodes are down), it cannot accept writes.

```bash
# 1. Determine cluster state
for node in 10.0.1.1 10.0.1.2 10.0.1.3; do
  echo "--- $node ---"
  curl -s --connect-timeout 2 http://$node:8088/admin/health || echo "UNREACHABLE"
done

# 2. Restore failed nodes as quickly as possible
# On each failed node:
sudo systemctl start thunderdb

# 3. If nodes cannot be restored, and you need emergency write access,
# force a single-node cluster (DANGER: data loss possible)
thunderdb --force-new-cluster --config /etc/thunderdb/thunderdb.toml

# 4. After quorum is restored, verify data consistency
curl http://localhost:8088/admin/cluster/consistency-check
```

### Emergency: Data Corruption Detected

```bash
# 1. Stop writes immediately
curl -X POST http://localhost:8088/admin/read-only

# 2. Run integrity check
thunderdb --verify-data --config /etc/thunderdb/thunderdb.toml

# 3. If corruption is limited:
# - Identify affected pages from the verification output
# - If the node is in a cluster, the affected regions will be re-replicated from healthy replicas

# 4. If corruption is widespread:
# - Stop ThunderDB
sudo systemctl stop thunderdb
# - Restore from backup
thunderdb --restore-pitr "latest" --restore-backup /backups/thunderdb/full-latest
# - Start ThunderDB
sudo systemctl start thunderdb

# 5. Investigate root cause (disk errors, firmware bugs, etc.)
sudo smartctl -a /dev/sda
dmesg | grep -i "error\|i/o\|sector"
```

### Emergency: Security Breach Suspected

```bash
# 1. Review audit logs for suspicious activity
tail -1000 /var/log/thunderdb/audit.log | \
  jq 'select(.event == "auth" and .status == "failure")'

# 2. Check for unauthorized users
psql -h localhost -U admin -c "SELECT * FROM pg_catalog.pg_user;"

# 3. Rotate all passwords
thunderdb --hash-password  # Generate new hash for superuser
# Update THUNDERDB_SUPERUSER_PASSWORD_HASH

# 4. Rotate TLS certificates
# Generate new certificates and reload:
sudo systemctl reload thunderdb

# 5. Rotate encryption keys (if encryption at rest is enabled)
thunderdb --rotate-encryption-key \
  --old-key /etc/thunderdb/encryption.key.old \
  --new-key /etc/thunderdb/encryption.key

# 6. Review and restrict network access
sudo ufw status
# Tighten firewall rules as needed
```

---

## Frequently Asked Troubleshooting Questions

### How do I check the ThunderDB version?

```bash
thunderdb --version
```

### How do I check cluster membership from any node?

```bash
curl http://localhost:8088/admin/cluster/members
```

### How do I see active queries?

```bash
curl http://localhost:8088/admin/queries
```

### How do I kill a long-running query?

```bash
curl -X POST http://localhost:8088/admin/queries/<query_id>/cancel
```

### How do I check why a specific query is slow?

```sql
-- Via PostgreSQL protocol
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
```

### How do I check replication lag?

```bash
curl -s http://localhost:8088/admin/metrics | grep replication_lag
```

### How do I drain a node for maintenance?

```bash
# 1. Mark the node as draining (stops accepting new region replicas)
curl -X POST http://localhost:8088/admin/drain

# 2. Wait for existing regions to migrate to other nodes
curl http://localhost:8088/admin/drain/status

# 3. Once drained, stop for maintenance
sudo systemctl stop thunderdb

# 4. After maintenance, rejoin the cluster
sudo systemctl start thunderdb
```

### How do I recover from a failed configuration change?

```bash
# ThunderDB keeps a backup of the last working configuration
cp /etc/thunderdb/thunderdb.toml.bak /etc/thunderdb/thunderdb.toml
sudo systemctl restart thunderdb
```

### Where do I get help?

- **Documentation**: [https://thunderdb.io/docs](https://thunderdb.io/docs)
- **GitHub Issues**: [https://github.com/smetal1/thunder-db/issues](https://github.com/smetal1/thunder-db/issues)
- **Community Discord**: [https://discord.gg/thunderdb](https://discord.gg/thunderdb)
- **Debug bundle**: Generate a diagnostic bundle for support:

  ```bash
  thunderdb --diagnostic-bundle --output /tmp/thunderdb-diag.tar.gz
  ```

  This collects logs, metrics, configuration (with secrets redacted), and system information.
