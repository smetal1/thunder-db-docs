---
title: "Backup & Recovery"
weight: 4
description: "Protect your data with full backups, incremental WAL-based backups, point-in-time recovery, and disaster recovery planning."
---

# Backup & Recovery

Data protection is a critical aspect of operating ThunderDB in production. This guide covers full backup procedures, incremental backups through WAL archiving, point-in-time recovery (PITR), and disaster recovery planning.

---

## Backup Overview

ThunderDB supports multiple backup strategies that can be combined for comprehensive data protection:

| Strategy | RPO | RTO | Storage Cost | Complexity |
|----------|-----|-----|-------------|------------|
| Full backup | Point-in-time of backup | Minutes to hours | High | Low |
| Incremental (WAL archiving) | Near-zero (last WAL flush) | Minutes | Low (deltas only) | Medium |
| Full + Incremental (PITR) | Near-zero | Minutes | Medium | Medium |
| Cross-region replication | Near-zero | Seconds (failover) | High | High |

**RPO** = Recovery Point Objective (how much data you can afford to lose).
**RTO** = Recovery Time Objective (how quickly you need to recover).

---

## Full Backup

A full backup captures the complete state of a ThunderDB node at a point in time. It includes the data directory and current WAL files.

### Online Backup (Recommended)

ThunderDB supports online (hot) backups that do not require stopping the server:

```bash
# Trigger a consistent backup via the admin API
curl -X POST http://localhost:8088/admin/backup \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "/backups/thunderdb/full-2026-01-15",
    "include_wal": true,
    "compress": true
  }'
```

Response:

```json
{
  "status": "started",
  "backup_id": "bk-20260115-103045",
  "destination": "/backups/thunderdb/full-2026-01-15",
  "estimated_size_bytes": 5368709120
}
```

Monitor backup progress:

```bash
curl http://localhost:8088/admin/backup/status/bk-20260115-103045
```

### Manual Full Backup

If you prefer a manual approach, follow these steps:

```bash
# 1. Force a checkpoint to flush dirty pages to disk
curl -X POST http://localhost:8088/admin/checkpoint

# 2. Copy the data directory
sudo -u thunder rsync -av --progress \
  /var/lib/thunderdb/data/ \
  /backups/thunderdb/full-$(date +%Y%m%d)/data/

# 3. Copy the WAL directory
sudo -u thunder rsync -av --progress \
  /var/lib/thunderdb/wal/ \
  /backups/thunderdb/full-$(date +%Y%m%d)/wal/

# 4. Copy the configuration
sudo cp /etc/thunderdb/thunderdb.toml \
  /backups/thunderdb/full-$(date +%Y%m%d)/thunderdb.toml
```

### Backup Contents

A full backup includes:

| Directory / File | Description |
|-----------------|-------------|
| `data/` | All data pages, indexes, and metadata files. |
| `wal/` | Write-ahead log files active at backup time. |
| `thunderdb.toml` | Configuration file (for reference during restore). |
| `backup_manifest.json` | Metadata about the backup (timestamp, LSN, checksum). |

### Verifying a Backup

Always verify backups after creation:

```bash
# Verify backup integrity
thunderdb --verify-backup /backups/thunderdb/full-2026-01-15

# Expected output:
# Backup verification: PASSED
# Backup time: 2026-01-15T10:30:45Z
# LSN: 0/1A3B4C5D
# Data pages: 8192 (verified)
# WAL segments: 12 (verified)
# Checksum: OK
```

---

## Incremental Backup (WAL Archiving)

Incremental backups capture only the changes since the last full or incremental backup by archiving WAL (Write-Ahead Log) segments. This dramatically reduces backup storage and time.

### Enabling WAL Archiving

Add the following to your configuration:

```toml
[storage]
# Enable WAL archiving
wal_archive_enabled = true

# Directory or command for archiving WAL segments
wal_archive_dir = "/backups/thunderdb/wal-archive"

# Alternative: archive via command (e.g., to S3)
# wal_archive_command = "aws s3 cp %f s3://my-bucket/thunderdb/wal/%n"

# Retain archived WAL segments for this duration
wal_archive_retention = "7d"
```

### How WAL Archiving Works

1. ThunderDB writes transactions to WAL segments (files of `max_wal_size` or less).
2. When a WAL segment is full or a checkpoint occurs, the segment is archived (copied to the archive directory or processed by the archive command).
3. Archived segments are retained according to `wal_archive_retention`.
4. For recovery, archived WAL segments are replayed on top of a full backup.

### Monitoring WAL Archiving

```bash
# Check archiving status
curl http://localhost:8088/admin/wal/archive/status

# Response:
# {
#   "archiving_enabled": true,
#   "last_archived_segment": "000000010000000000000042",
#   "last_archive_time": "2026-01-15T10:30:45Z",
#   "segments_pending": 0,
#   "archive_rate_bytes_per_sec": 1048576,
#   "total_archived_bytes": 536870912
# }
```

### WAL Archive to Object Storage

For cloud deployments, archive WAL segments to object storage:

**Amazon S3:**

```toml
[storage]
wal_archive_command = "aws s3 cp %f s3://my-thunderdb-backups/wal/%n --storage-class STANDARD_IA"
wal_restore_command = "aws s3 cp s3://my-thunderdb-backups/wal/%n %f"
```

**Google Cloud Storage:**

```toml
[storage]
wal_archive_command = "gsutil cp %f gs://my-thunderdb-backups/wal/%n"
wal_restore_command = "gsutil cp gs://my-thunderdb-backups/wal/%n %f"
```

**Azure Blob Storage:**

```toml
[storage]
wal_archive_command = "az storage blob upload --file %f --container-name thunderdb-wal --name %n"
wal_restore_command = "az storage blob download --container-name thunderdb-wal --name %n --file %f"
```

In these commands:
- `%f` is replaced with the full path to the WAL segment file.
- `%n` is replaced with the WAL segment filename only.

---

## Point-in-Time Recovery (PITR)

PITR allows you to restore a ThunderDB instance to any specific point in time, provided you have a full backup and the WAL archive covering that time period.

### Prerequisites

- A full backup taken before the target recovery time.
- All WAL archive segments from the backup time to the target recovery time.

### Recovery Procedure

```bash
# Restore to a specific timestamp
thunderdb --restore-pitr "2026-01-15T14:30:00Z" \
  --restore-backup /backups/thunderdb/full-2026-01-15

# Restore to the latest available point
thunderdb --restore-pitr "latest" \
  --restore-backup /backups/thunderdb/full-2026-01-15

# Restore to a specific WAL LSN (Log Sequence Number)
thunderdb --restore-pitr "lsn:0/1A3B4C5D" \
  --restore-backup /backups/thunderdb/full-2026-01-15
```

### Step-by-Step PITR Process

1. **Stop ThunderDB** on the target node:

   ```bash
   sudo systemctl stop thunderdb
   ```

2. **Clear the existing data and WAL directories** (or use a fresh node):

   ```bash
   sudo rm -rf /var/lib/thunderdb/data/*
   sudo rm -rf /var/lib/thunderdb/wal/*
   ```

3. **Restore from the full backup:**

   ```bash
   sudo -u thunder cp -a /backups/thunderdb/full-2026-01-15/data/* /var/lib/thunderdb/data/
   sudo -u thunder cp -a /backups/thunderdb/full-2026-01-15/wal/* /var/lib/thunderdb/wal/
   ```

4. **Run PITR recovery:**

   ```bash
   thunderdb --restore-pitr "2026-01-15T14:30:00Z" \
     --restore-backup /backups/thunderdb/full-2026-01-15 \
     --wal-archive-dir /backups/thunderdb/wal-archive \
     --config /etc/thunderdb/thunderdb.toml
   ```

5. **Start ThunderDB** normally after recovery completes:

   ```bash
   sudo systemctl start thunderdb
   ```

6. **Verify data** integrity after recovery:

   ```bash
   curl http://localhost:8088/admin/health
   # Connect via psql and verify data
   psql -h localhost -U admin -c "SELECT COUNT(*) FROM your_table;"
   ```

### Recovery Output

During PITR, ThunderDB logs the recovery progress:

```
[INFO] Starting Point-in-Time Recovery
[INFO] Target time: 2026-01-15T14:30:00Z
[INFO] Base backup LSN: 0/1A000000
[INFO] Phase 1: Restoring base backup... done (8192 pages)
[INFO] Phase 2: Replaying WAL segments...
[INFO]   Replaying segment 000000010000000000000038... done
[INFO]   Replaying segment 000000010000000000000039... done
[INFO]   Replaying segment 00000001000000000000003A... done (target reached)
[INFO] Phase 3: Recovery complete
[INFO] Recovered to: 2026-01-15T14:30:00.000Z (LSN: 0/1A3B4C5D)
[INFO] Transactions recovered: 45,231
[INFO] Transactions rolled back: 12 (in-progress at recovery point)
```

---

## WAL-Based Recovery (ARIES)

ThunderDB uses the ARIES (Algorithm for Recovery and Isolation Exploiting Semantics) recovery algorithm, which provides crash recovery through a three-phase process. This happens automatically on startup after an unclean shutdown.

### Phase 1: Analysis

The analysis phase scans the WAL from the last checkpoint to determine:
- Which pages were dirty (modified but not flushed) at the time of the crash.
- Which transactions were active (not yet committed or aborted).
- The starting point for the redo phase.

### Phase 2: Redo

The redo phase replays all WAL records from the analysis starting point forward, reapplying all changes to bring the database to the exact state it was in at the time of the crash. This includes changes made by transactions that will later be undone.

### Phase 3: Undo

The undo phase rolls back all transactions that were active (not committed) at the time of the crash. It processes undo records in reverse order, ensuring the database only contains the effects of committed transactions.

### Monitoring Recovery

Recovery progress is logged during startup:

```
[INFO] Crash recovery initiated
[INFO] Last checkpoint LSN: 0/1A000000
[INFO] Phase 1 (Analysis): Scanning WAL... 42 dirty pages, 3 active transactions
[INFO] Phase 2 (Redo): Replaying from LSN 0/1A000000... 1,234 records replayed
[INFO] Phase 3 (Undo): Rolling back 3 active transactions... done
[INFO] Recovery complete in 2.34s
```

### Recovery Tuning

For large databases where recovery time is critical:

```toml
[storage]
# More frequent checkpoints reduce the amount of WAL to replay
checkpoint_interval = "30s"

# Smaller max WAL size limits recovery scope
max_wal_size = "512MB"
```

---

## Backup Scheduling Best Practices

### Recommended Backup Schedule

| Backup Type | Frequency | Retention | Purpose |
|-------------|-----------|-----------|---------|
| Full backup | Daily (off-peak hours) | 7 days | Base for PITR, standalone restore |
| WAL archiving | Continuous | 7 days | Incremental changes for PITR |
| Full backup (weekly) | Weekly (Sunday night) | 30 days | Longer-term recovery |
| Full backup (monthly) | Monthly | 12 months | Compliance and archival |

### Automated Backup Script

```bash
#!/bin/bash
# /etc/cron.d/thunderdb-backup.sh
# Run daily at 2:00 AM: 0 2 * * * /etc/cron.d/thunderdb-backup.sh

set -euo pipefail

BACKUP_DIR="/backups/thunderdb"
DATE=$(date +%Y%m%d)
RETENTION_DAYS=7

echo "[$(date)] Starting ThunderDB backup..."

# Trigger online backup
RESPONSE=$(curl -s -X POST http://localhost:8088/admin/backup \
  -H "Content-Type: application/json" \
  -d "{\"destination\": \"${BACKUP_DIR}/full-${DATE}\", \"include_wal\": true, \"compress\": true}")

BACKUP_ID=$(echo $RESPONSE | jq -r '.backup_id')
echo "[$(date)] Backup started: $BACKUP_ID"

# Wait for backup to complete
while true; do
  STATUS=$(curl -s http://localhost:8088/admin/backup/status/$BACKUP_ID | jq -r '.status')
  if [ "$STATUS" = "completed" ]; then
    echo "[$(date)] Backup completed successfully"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
  fi
  sleep 10
done

# Verify backup
thunderdb --verify-backup "${BACKUP_DIR}/full-${DATE}"

# Remove old backups
find "${BACKUP_DIR}" -maxdepth 1 -name "full-*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \;
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"

echo "[$(date)] Backup process complete"
```

### Backup Monitoring

Add alerts for backup failures:

```yaml
# deploy/prometheus/rules/thunderdb-backup-alerts.yml
groups:
  - name: thunderdb.backup
    rules:
      - alert: ThunderDBBackupFailed
        expr: thunderdb_last_backup_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ThunderDB backup failed on {{ $labels.instance }}"

      - alert: ThunderDBBackupStale
        expr: time() - thunderdb_last_backup_timestamp > 86400 * 2
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "No successful backup in 48 hours on {{ $labels.instance }}"

      - alert: ThunderDBWALArchiveLag
        expr: thunderdb_wal_archive_pending_segments > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "WAL archiving is falling behind on {{ $labels.instance }}"
```

---

## Disaster Recovery Planning

### Recovery Scenarios

| Scenario | Strategy | Expected RTO |
|----------|----------|-------------|
| Single node failure (cluster) | Automatic Raft failover | Seconds |
| Data corruption on one node | Restore from backup or re-replicate from peers | Minutes |
| Full cluster failure (same region) | Restore all nodes from backup + WAL archive | 30-60 minutes |
| Regional disaster | Failover to cross-region replica | Minutes |
| Accidental data deletion | PITR to before deletion timestamp | 15-30 minutes |

### Cross-Region Backup Strategy

For maximum disaster resilience, maintain backups in a different geographic region:

```
Primary Region (us-east-1)          Backup Region (us-west-2)
+-------------------+               +-------------------+
| ThunderDB Cluster |  -- WAL -->   | S3 Bucket         |
| (3 nodes)         |  archiving    | (WAL archive)     |
|                   |               |                   |
| Daily full backup |  -- sync -->  | S3 Bucket         |
| (local disk)      |               | (full backups)    |
+-------------------+               +-------------------+
```

Implementation:

```bash
# Sync local backups to a remote region
aws s3 sync /backups/thunderdb/ s3://thunderdb-backups-us-west-2/ \
  --storage-class STANDARD_IA \
  --region us-west-2

# Configure WAL archiving to the remote region
# In thunderdb.toml:
# wal_archive_command = "aws s3 cp %f s3://thunderdb-backups-us-west-2/wal/%n --region us-west-2"
```

### Disaster Recovery Runbook

1. **Assess the failure scope**: Determine whether it is a single node, full cluster, or regional failure.
2. **For single node failure**: If the cluster has quorum, the node will recover automatically. Otherwise, restore from backup.
3. **For full cluster failure**:
   a. Provision new infrastructure (or use standby).
   b. Restore the most recent full backup on each node.
   c. Apply WAL archive to bring all nodes to the same point.
   d. Start the cluster and verify data integrity.
   e. Update DNS/load balancer to point to the recovered cluster.
4. **For accidental deletion**: Use PITR to recover to a timestamp just before the deletion.
5. **Post-recovery**: Verify data integrity, check replication status, resume backups.

### Testing Recovery

Regularly test your recovery procedures (at least quarterly):

```bash
# 1. Provision a test environment
# 2. Restore from the latest production backup
thunderdb --restore-pitr "latest" \
  --restore-backup /backups/thunderdb/full-latest \
  --config /etc/thunderdb/thunderdb-test.toml

# 3. Start the test instance
thunderdb --config /etc/thunderdb/thunderdb-test.toml

# 4. Run validation queries to verify data integrity
psql -h localhost -p 15432 -U admin -f /scripts/recovery-validation.sql

# 5. Document the recovery time and any issues
```

Record the results of each recovery test, including actual RTO, data completeness verification, and any problems encountered.
