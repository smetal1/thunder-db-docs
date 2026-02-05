---
title: "Monitoring"
weight: 3
description: "Monitor ThunderDB health and performance with Prometheus metrics, Grafana dashboards, structured logging, and alerting."
---

# Monitoring

Effective monitoring is essential for maintaining ThunderDB in production. This guide covers the built-in metrics endpoint, health checks, structured logging, and how to set up a complete monitoring stack with Prometheus, Grafana, and alerting.

---

## Prometheus Metrics Endpoint

ThunderDB exposes metrics in Prometheus format at the HTTP admin endpoint:

```
GET http://<host>:8088/admin/metrics
```

### Example Request

```bash
curl http://localhost:8088/admin/metrics
```

### Example Response

```
# HELP thunderdb_query_total Total number of queries executed
# TYPE thunderdb_query_total counter
thunderdb_query_total{protocol="pg",status="success"} 1542893
thunderdb_query_total{protocol="pg",status="error"} 127
thunderdb_query_total{protocol="mysql",status="success"} 89421
thunderdb_query_total{protocol="resp",status="success"} 2345678

# HELP thunderdb_query_duration_seconds Query execution time in seconds
# TYPE thunderdb_query_duration_seconds histogram
thunderdb_query_duration_seconds_bucket{protocol="pg",le="0.001"} 892345
thunderdb_query_duration_seconds_bucket{protocol="pg",le="0.01"} 1234567
thunderdb_query_duration_seconds_bucket{protocol="pg",le="0.1"} 1500000
thunderdb_query_duration_seconds_bucket{protocol="pg",le="1.0"} 1540000
thunderdb_query_duration_seconds_bucket{protocol="pg",le="10.0"} 1542893
thunderdb_query_duration_seconds_bucket{protocol="pg",le="+Inf"} 1542893
thunderdb_query_duration_seconds_sum{protocol="pg"} 4521.34
thunderdb_query_duration_seconds_count{protocol="pg"} 1542893

# HELP thunderdb_buffer_pool_hit_ratio Buffer pool cache hit ratio
# TYPE thunderdb_buffer_pool_hit_ratio gauge
thunderdb_buffer_pool_hit_ratio 0.9847

# HELP thunderdb_buffer_pool_pages_total Total pages in buffer pool
# TYPE thunderdb_buffer_pool_pages_total gauge
thunderdb_buffer_pool_pages_total{state="clean"} 7234
thunderdb_buffer_pool_pages_total{state="dirty"} 512
thunderdb_buffer_pool_pages_total{state="free"} 446

# HELP thunderdb_wal_size_bytes Current WAL size in bytes
# TYPE thunderdb_wal_size_bytes gauge
thunderdb_wal_size_bytes 134217728

# HELP thunderdb_connections_active Number of active client connections
# TYPE thunderdb_connections_active gauge
thunderdb_connections_active{protocol="pg"} 42
thunderdb_connections_active{protocol="mysql"} 15
thunderdb_connections_active{protocol="resp"} 128
thunderdb_connections_active{protocol="http"} 3
thunderdb_connections_active{protocol="grpc"} 8

# HELP thunderdb_replication_lag_seconds Replication lag from leader in seconds
# TYPE thunderdb_replication_lag_seconds gauge
thunderdb_replication_lag_seconds{peer="node-2"} 0.003
thunderdb_replication_lag_seconds{peer="node-3"} 0.005

# HELP thunderdb_transactions_total Total transactions
# TYPE thunderdb_transactions_total counter
thunderdb_transactions_total{status="committed"} 987654
thunderdb_transactions_total{status="aborted"} 1234

# HELP thunderdb_checkpoint_duration_seconds Time taken for last checkpoint
# TYPE thunderdb_checkpoint_duration_seconds gauge
thunderdb_checkpoint_duration_seconds 2.34

# HELP thunderdb_regions_total Number of data regions
# TYPE thunderdb_regions_total gauge
thunderdb_regions_total{node="1"} 128
thunderdb_regions_total{node="2"} 125
thunderdb_regions_total{node="3"} 127

# HELP thunderdb_raft_term Current Raft term
# TYPE thunderdb_raft_term gauge
thunderdb_raft_term 5

# HELP thunderdb_compaction_pending Number of pending compaction tasks
# TYPE thunderdb_compaction_pending gauge
thunderdb_compaction_pending 3
```

### Key Metrics Reference

| Metric | Type | Description |
|--------|------|-------------|
| `thunderdb_query_total` | counter | Total queries executed, labeled by protocol and status. |
| `thunderdb_query_duration_seconds` | histogram | Query execution latency distribution. |
| `thunderdb_buffer_pool_hit_ratio` | gauge | Ratio of page reads served from buffer pool (target: >0.95). |
| `thunderdb_buffer_pool_pages_total` | gauge | Buffer pool page counts by state (clean, dirty, free). |
| `thunderdb_wal_size_bytes` | gauge | Current size of the WAL on disk. |
| `thunderdb_connections_active` | gauge | Active connections per protocol. |
| `thunderdb_replication_lag_seconds` | gauge | Replication lag from leader to each follower. |
| `thunderdb_transactions_total` | counter | Transactions by outcome (committed, aborted). |
| `thunderdb_checkpoint_duration_seconds` | gauge | Duration of the most recent checkpoint. |
| `thunderdb_regions_total` | gauge | Number of data regions per node. |
| `thunderdb_raft_term` | gauge | Current Raft consensus term. |
| `thunderdb_compaction_pending` | gauge | Pending background compaction tasks. |
| `thunderdb_disk_usage_bytes` | gauge | Disk usage by category (data, wal, temp). |
| `thunderdb_memory_usage_bytes` | gauge | Memory usage by component (buffer_pool, wal_buffer, query). |
| `thunderdb_slow_queries_total` | counter | Count of queries exceeding the slow query threshold. |

---

## Prometheus Scrape Configuration

ThunderDB ships with a ready-to-use Prometheus configuration in `deploy/prometheus/`.

### prometheus.yml

```yaml
# deploy/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

scrape_configs:
  - job_name: "thunderdb"
    metrics_path: /admin/metrics
    scrape_interval: 10s
    scrape_timeout: 5s

    # For static deployments:
    static_configs:
      - targets:
          - "thunderdb-1:8088"
          - "thunderdb-2:8088"
          - "thunderdb-3:8088"
        labels:
          cluster: "production"

    # For Kubernetes deployments, replace static_configs with:
    # kubernetes_sd_configs:
    #   - role: pod
    #     namespaces:
    #       names:
    #         - thunderdb
    # relabel_configs:
    #   - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    #     action: keep
    #     regex: "true"
    #   - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
    #     action: replace
    #     target_label: __address__
    #     regex: (.+)
    #     replacement: $1
    #   - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
    #     action: replace
    #     target_label: __metrics_path__
    #     regex: (.+)
```

### Running Prometheus

```bash
docker run -d \
  --name prometheus \
  -p 9091:9090 \
  -v $(pwd)/deploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro \
  -v $(pwd)/deploy/prometheus/rules:/etc/prometheus/rules:ro \
  prom/prometheus:latest
```

---

## Grafana Dashboards

ThunderDB provides pre-built Grafana dashboards in `deploy/grafana/`. These dashboards give you immediate visibility into cluster health, query performance, storage utilization, and replication status.

### Available Dashboards

| Dashboard | File | Description |
|-----------|------|-------------|
| **Cluster Overview** | `deploy/grafana/dashboards/cluster-overview.json` | High-level cluster health, node status, region distribution. |
| **Query Performance** | `deploy/grafana/dashboards/query-performance.json` | Query latency percentiles, throughput, slow queries by protocol. |
| **Storage** | `deploy/grafana/dashboards/storage.json` | Buffer pool hit rate, WAL size, disk usage, compaction status. |
| **Replication** | `deploy/grafana/dashboards/replication.json` | Replication lag, Raft term changes, leader elections. |
| **Connections** | `deploy/grafana/dashboards/connections.json` | Active connections by protocol, connection rate, errors. |

### Setting Up Grafana

```bash
docker run -d \
  --name grafana \
  -p 3000:3000 \
  -v $(pwd)/deploy/grafana/provisioning:/etc/grafana/provisioning:ro \
  -v $(pwd)/deploy/grafana/dashboards:/var/lib/grafana/dashboards:ro \
  -e GF_SECURITY_ADMIN_PASSWORD=admin \
  grafana/grafana:latest
```

Grafana is accessible at `http://localhost:3000` (default credentials: `admin`/`admin`).

### Provisioning Configuration

The provisioning directory automatically configures the Prometheus data source and dashboard imports:

```yaml
# deploy/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

```yaml
# deploy/grafana/provisioning/dashboards/thunderdb.yml
apiVersion: 1
providers:
  - name: ThunderDB
    orgId: 1
    folder: ThunderDB
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

### Key Dashboard Panels

**Cluster Overview dashboard includes:**
- Cluster status indicator (healthy/degraded/critical)
- Node status table with uptime, role, and region count
- Total queries per second across all protocols
- Average query latency (p50, p95, p99)
- Buffer pool hit ratio gauge
- Active connections count

**Query Performance dashboard includes:**
- Query throughput by protocol (QPS)
- Query latency histograms (p50, p95, p99, p99.9)
- Slow query count over time
- Query error rate
- Top slow queries table
- Query type distribution (SELECT, INSERT, UPDATE, DELETE)

---

## Health Check Endpoints

ThunderDB exposes three health check endpoints for load balancers, orchestrators, and monitoring systems.

### GET /admin/health

Returns the overall health status of the node, including subsystem checks.

```bash
curl http://localhost:8088/admin/health
```

**Response (healthy):**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_seconds": 86400,
  "node_id": 1,
  "cluster_role": "leader",
  "checks": {
    "storage": "ok",
    "wal": "ok",
    "raft": "ok",
    "buffer_pool": "ok"
  }
}
```

**Response (degraded):**

```json
{
  "status": "degraded",
  "version": "0.1.0",
  "uptime_seconds": 86400,
  "node_id": 2,
  "cluster_role": "follower",
  "checks": {
    "storage": "ok",
    "wal": "ok",
    "raft": "degraded: replication lag 5.2s",
    "buffer_pool": "ok"
  }
}
```

HTTP status codes:
- `200 OK` -- Node is healthy.
- `503 Service Unavailable` -- Node is unhealthy or degraded.

### GET /admin/live

Liveness probe. Returns `200 OK` if the process is running and responsive. Used by Kubernetes liveness probes to determine if the pod should be restarted.

```bash
curl http://localhost:8088/admin/live
```

**Response:**

```json
{
  "status": "alive"
}
```

### GET /admin/ready

Readiness probe. Returns `200 OK` if the node is ready to serve traffic (storage initialized, WAL recovered, cluster joined). Used by Kubernetes readiness probes and load balancers.

```bash
curl http://localhost:8088/admin/ready
```

**Response (ready):**

```json
{
  "status": "ready",
  "storage_initialized": true,
  "wal_recovered": true,
  "cluster_joined": true,
  "regions_loaded": 128
}
```

**Response (not ready):**

```json
{
  "status": "not_ready",
  "storage_initialized": true,
  "wal_recovered": true,
  "cluster_joined": false,
  "regions_loaded": 0
}
```

HTTP status codes:
- `200 OK` -- Node is ready to serve traffic.
- `503 Service Unavailable` -- Node is not ready.

---

## Logging

ThunderDB produces structured logs that can be consumed by log aggregation systems such as the ELK stack, Loki, or Splunk.

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `trace` | Very detailed internal tracing | Deep debugging of specific subsystems |
| `debug` | Detailed operational information | Development and troubleshooting |
| `info` | Normal operational events | Production default |
| `warn` | Potentially problematic situations | Slow queries, approaching limits |
| `error` | Error conditions | Failed operations, connectivity issues |

### Structured Log Format

When `format = "json"` is configured, logs are emitted as JSON lines:

```json
{"timestamp":"2026-01-15T10:30:45.123Z","level":"info","target":"thunderdb::server","message":"Server started","node_id":1,"pg_port":5432,"mysql_port":3306,"resp_port":6379,"http_port":8088,"grpc_port":9090}
{"timestamp":"2026-01-15T10:30:45.456Z","level":"info","target":"thunderdb::cluster","message":"Cluster joined","node_id":1,"cluster_name":"production","role":"follower","term":1}
{"timestamp":"2026-01-15T10:30:46.789Z","level":"info","target":"thunderdb::cluster","message":"Leader elected","node_id":1,"leader_id":1,"term":2}
{"timestamp":"2026-01-15T10:31:15.012Z","level":"warn","target":"thunderdb::query","message":"Slow query detected","duration_ms":2345,"protocol":"pg","query":"SELECT * FROM orders JOIN products ON ...","client":"10.0.1.50:54321"}
```

When `format = "text"` is configured:

```
2026-01-15T10:30:45.123Z  INFO thunderdb::server: Server started node_id=1 pg_port=5432 mysql_port=3306
2026-01-15T10:30:45.456Z  INFO thunderdb::cluster: Cluster joined node_id=1 cluster_name=production role=follower
2026-01-15T10:31:15.012Z  WARN thunderdb::query: Slow query detected duration_ms=2345 protocol=pg
```

### Slow Query Log

When `slow_query_enabled = true`, queries exceeding `slow_query_threshold` are logged at WARN level with full query text, execution time, client address, and protocol:

```json
{
  "timestamp": "2026-01-15T10:31:15.012Z",
  "level": "warn",
  "target": "thunderdb::query::slow",
  "message": "Slow query detected",
  "duration_ms": 2345,
  "protocol": "pg",
  "query": "SELECT o.id, p.name, SUM(o.quantity) FROM orders o JOIN products p ON o.product_id = p.id GROUP BY o.id, p.name HAVING SUM(o.quantity) > 100",
  "client": "10.0.1.50:54321",
  "rows_examined": 1500000,
  "rows_returned": 42,
  "plan": "HashJoin -> SeqScan(orders) + IndexScan(products)"
}
```

### Runtime Log Level Changes

Change the log level at runtime without restarting:

```bash
# Via HTTP API
curl -X PUT http://localhost:8088/admin/config/log_level -d '{"level": "debug"}'

# Via systemd reload
sudo systemctl reload thunderdb

# Via environment variable (requires restart)
THUNDERDB_LOG_LEVEL=debug
```

### Log Rotation

When running under systemd, logs go to the journal and are rotated automatically. For file-based logging, configure logrotate:

```
# /etc/logrotate.d/thunderdb
/var/log/thunderdb/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 thunder thunder
    postrotate
        systemctl reload thunderdb
    endscript
}
```

---

## Alerting Rules

ThunderDB ships with recommended alerting rules based on SLOs in `deploy/slo.yaml`. These rules can be loaded into Prometheus Alertmanager.

### Alert Rules Configuration

```yaml
# deploy/prometheus/rules/thunderdb-alerts.yml
groups:
  - name: thunderdb.availability
    rules:
      - alert: ThunderDBDown
        expr: up{job="thunderdb"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ThunderDB node {{ $labels.instance }} is down"
          description: "The ThunderDB node has been unreachable for more than 1 minute."

      - alert: ThunderDBNotReady
        expr: thunderdb_ready == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "ThunderDB node {{ $labels.instance }} is not ready"
          description: "The node has been in a not-ready state for more than 5 minutes."

  - name: thunderdb.performance
    rules:
      - alert: ThunderDBHighQueryLatency
        expr: histogram_quantile(0.99, rate(thunderdb_query_duration_seconds_bucket[5m])) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High p99 query latency on {{ $labels.instance }}"
          description: "The p99 query latency has exceeded 5 seconds for more than 10 minutes."

      - alert: ThunderDBLowBufferPoolHitRate
        expr: thunderdb_buffer_pool_hit_ratio < 0.90
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Low buffer pool hit rate on {{ $labels.instance }}"
          description: "Buffer pool hit rate is {{ $value }}, below the 0.90 threshold. Consider increasing buffer_pool_size."

      - alert: ThunderDBHighSlowQueryRate
        expr: rate(thunderdb_slow_queries_total[5m]) > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High rate of slow queries on {{ $labels.instance }}"
          description: "More than 10 slow queries per second for the last 10 minutes."

  - name: thunderdb.storage
    rules:
      - alert: ThunderDBWALSizeHigh
        expr: thunderdb_wal_size_bytes > 0.8 * thunderdb_wal_max_size_bytes
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "WAL size approaching limit on {{ $labels.instance }}"
          description: "WAL is at {{ $value | humanize1024 }}, approaching the configured maximum."

      - alert: ThunderDBDiskSpaceLow
        expr: thunderdb_disk_usage_bytes / thunderdb_disk_total_bytes > 0.85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk usage is above 85%. Consider expanding storage or archiving old data."

      - alert: ThunderDBDiskSpaceCritical
        expr: thunderdb_disk_usage_bytes / thunderdb_disk_total_bytes > 0.95
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Critical disk space on {{ $labels.instance }}"
          description: "Disk usage is above 95%. Immediate action required."

      - alert: ThunderDBCompactionBacklog
        expr: thunderdb_compaction_pending > 50
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Compaction backlog on {{ $labels.instance }}"
          description: "More than 50 pending compaction tasks. Consider increasing compaction_threads."

  - name: thunderdb.cluster
    rules:
      - alert: ThunderDBReplicationLagHigh
        expr: thunderdb_replication_lag_seconds > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High replication lag on {{ $labels.instance }}"
          description: "Replication lag to {{ $labels.peer }} is {{ $value }}s."

      - alert: ThunderDBReplicationLagCritical
        expr: thunderdb_replication_lag_seconds > 60
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical replication lag on {{ $labels.instance }}"
          description: "Replication lag to {{ $labels.peer }} has exceeded 60 seconds."

      - alert: ThunderDBLeaderChanged
        expr: changes(thunderdb_raft_term[5m]) > 2
        labels:
          severity: warning
        annotations:
          summary: "Frequent Raft leader elections on {{ $labels.instance }}"
          description: "More than 2 leader elections in the last 5 minutes. Check network stability."

      - alert: ThunderDBClusterDegraded
        expr: count(up{job="thunderdb"} == 1) < 3
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ThunderDB cluster is degraded"
          description: "Fewer than 3 nodes are healthy. Cluster may lose quorum."

  - name: thunderdb.connections
    rules:
      - alert: ThunderDBHighConnectionCount
        expr: sum(thunderdb_connections_active) by (instance) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High connection count on {{ $labels.instance }}"
          description: "Active connections have exceeded 1000. Consider connection pooling."

      - alert: ThunderDBHighErrorRate
        expr: rate(thunderdb_query_total{status="error"}[5m]) / rate(thunderdb_query_total[5m]) > 0.05
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High query error rate on {{ $labels.instance }}"
          description: "More than 5% of queries are failing."
```

### SLO Definitions

```yaml
# deploy/slo.yaml
slos:
  - name: thunderdb-availability
    description: "ThunderDB cluster availability"
    target: 99.95%
    window: 30d
    indicator:
      type: availability
      query: "up{job='thunderdb'}"

  - name: thunderdb-latency
    description: "Query latency SLO"
    target: 99%
    window: 30d
    indicator:
      type: latency
      threshold: 500ms
      query: "histogram_quantile(0.99, rate(thunderdb_query_duration_seconds_bucket[5m]))"

  - name: thunderdb-error-rate
    description: "Query error rate SLO"
    target: 99.9%
    window: 30d
    indicator:
      type: error_rate
      query: "rate(thunderdb_query_total{status='error'}[5m]) / rate(thunderdb_query_total[5m])"
```

---

## Recommended Monitoring Stack Setup

For a complete production monitoring setup, deploy the following stack alongside ThunderDB:

### Architecture

```
ThunderDB Nodes ──> Prometheus ──> Grafana
      |                 |
      |                 v
      |           Alertmanager ──> PagerDuty/Slack/Email
      |
      v
  Log Aggregation (Loki/ELK)
```

### Quick Start with Docker Compose

Use the provided `docker-compose.monitoring.yml` or add the monitoring services to your existing compose file (see [Deployment Guide]({{< relref "../deployment" >}})).

### Step-by-Step Setup

1. **Deploy Prometheus** with ThunderDB scrape configuration.
2. **Deploy Grafana** with provisioned data source and dashboards.
3. **Deploy Alertmanager** with notification channels (Slack, PagerDuty, email).
4. **Import alert rules** from `deploy/prometheus/rules/`.
5. **Verify metrics** flow by checking Prometheus targets page.
6. **Set up log aggregation** (Loki for Grafana, or Elasticsearch + Kibana) for centralized log analysis.
7. **Test alerting** by simulating a failure (e.g., stopping a node).

### Operational Runbook Integration

Combine monitoring with operational runbooks (see `deploy/runbook.md`) to ensure alerts are actionable. Each alert should link to a runbook entry with:
- What the alert means
- How to diagnose the root cause
- Step-by-step remediation procedures
- Escalation paths
