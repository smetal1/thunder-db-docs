---
title: "Deployment"
weight: 1
description: "Deploy ThunderDB from source, Docker, Kubernetes, or system packages. Set up single-node and multi-node clusters."
---

# Deployment

This guide covers all supported methods for deploying ThunderDB, from building from source for development to running production-grade Kubernetes clusters.

---

## Building from Source

### Prerequisites

- **Rust** 1.75 or later (install via [rustup](https://rustup.rs/))
- **Cargo** (included with Rust)
- **C/C++ compiler**: GCC 9+ or Clang 12+ (required for native dependencies)
- **CMake** 3.16+ (required for building RocksDB bindings)
- **Protocol Buffers compiler** (`protoc`) 3.15+ (required for gRPC code generation)
- **OpenSSL** development headers (for TLS support)
- **Git** (for cloning the repository)

On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake protobuf-compiler libssl-dev pkg-config git
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

On macOS:

```bash
brew install cmake protobuf openssl pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Build

Clone the repository and build in release mode:

```bash
git clone https://github.com/smetal1/thunder-db.git
cd thunderdb
cargo build --release
```

The optimized binary is produced at:

```
target/release/thunderdb
```

### Verify the Build

```bash
./target/release/thunderdb --version
# ThunderDB 0.1.0 (rustc 1.75.0, built 2026-01-15)
```

### Run

```bash
./target/release/thunderdb --config config/thunderdb.toml
```

If no configuration file is specified, ThunderDB starts with default settings (single-node, all ports on localhost).

### Build Options

| Flag | Description |
|------|-------------|
| `--release` | Optimized build with LTO (recommended for production) |
| `--features tls` | Enable TLS support (enabled by default) |
| `--features simd` | Enable SIMD-accelerated operations |
| `--features jemalloc` | Use jemalloc allocator (recommended for production) |
| `--no-default-features` | Disable all optional features |

Example with all production features:

```bash
cargo build --release --features "tls,simd,jemalloc"
```

---

## Docker

### Dockerfile

ThunderDB uses a multi-stage build to produce a minimal production image:

```dockerfile
# Stage 1: Build
FROM rust:1.75-bookworm AS builder

RUN apt-get update && apt-get install -y \
    cmake protobuf-compiler libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/thunderdb
COPY . .

RUN cargo build --release --features "tls,jemalloc"

# Stage 2: Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r thunder && useradd -r -g thunder thunder \
    && mkdir -p /var/lib/thunderdb/data /var/lib/thunderdb/wal /var/log/thunderdb /etc/thunderdb \
    && chown -R thunder:thunder /var/lib/thunderdb /var/log/thunderdb /etc/thunderdb

COPY --from=builder /usr/src/thunderdb/target/release/thunderdb /usr/local/bin/thunderdb
COPY --from=builder /usr/src/thunderdb/config/thunderdb.toml /etc/thunderdb/thunderdb.toml

USER thunder

EXPOSE 5432 3306 6379 8088 9090

VOLUME ["/var/lib/thunderdb/data", "/var/lib/thunderdb/wal"]

ENTRYPOINT ["thunderdb"]
CMD ["--config", "/etc/thunderdb/thunderdb.toml"]
```

### Building the Docker Image

```bash
docker build -t thunderdb:latest .
```

### Running with Docker

**Basic single-node:**

```bash
docker run -d \
  --name thunderdb \
  -p 5432:5432 \
  -p 3306:3306 \
  -p 6379:6379 \
  -p 8088:8088 \
  -p 9090:9090 \
  -v thunderdb-data:/var/lib/thunderdb/data \
  -v thunderdb-wal:/var/lib/thunderdb/wal \
  thunderdb:latest
```

**With custom configuration:**

```bash
docker run -d \
  --name thunderdb \
  -p 5432:5432 \
  -p 3306:3306 \
  -p 6379:6379 \
  -p 8088:8088 \
  -p 9090:9090 \
  -v thunderdb-data:/var/lib/thunderdb/data \
  -v thunderdb-wal:/var/lib/thunderdb/wal \
  -v $(pwd)/my-config.toml:/etc/thunderdb/thunderdb.toml:ro \
  thunderdb:latest
```

**With environment variable overrides:**

```bash
docker run -d \
  --name thunderdb \
  -p 5432:5432 \
  -p 3306:3306 \
  -p 6379:6379 \
  -p 8088:8088 \
  -p 9090:9090 \
  -e THUNDERDB_LOG_LEVEL=info \
  -e THUNDERDB_SUPERUSER_PASSWORD_HASH="argon2:..." \
  -v thunderdb-data:/var/lib/thunderdb/data \
  -v thunderdb-wal:/var/lib/thunderdb/wal \
  thunderdb:latest
```

### Docker Compose

Create a `docker-compose.yml` for a complete single-node deployment with monitoring:

```yaml
version: "3.8"

services:
  thunderdb:
    image: thunderdb:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: thunderdb
    restart: unless-stopped
    ports:
      - "5432:5432"   # PostgreSQL wire protocol
      - "3306:3306"   # MySQL wire protocol
      - "6379:6379"   # RESP (Redis) wire protocol
      - "8088:8088"   # HTTP API + Admin endpoints
      - "9090:9090"   # gRPC
    volumes:
      - thunderdb-data:/var/lib/thunderdb/data
      - thunderdb-wal:/var/lib/thunderdb/wal
      - ./config/thunderdb.toml:/etc/thunderdb/thunderdb.toml:ro
    environment:
      THUNDERDB_LOG_LEVEL: info
      THUNDERDB_DATA_DIR: /var/lib/thunderdb/data
      THUNDERDB_WAL_DIR: /var/lib/thunderdb/wal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8088/admin/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 8G
        reservations:
          cpus: "2"
          memory: 4G

  prometheus:
    image: prom/prometheus:latest
    container_name: thunderdb-prometheus
    restart: unless-stopped
    ports:
      - "9091:9090"
    volumes:
      - ./deploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    depends_on:
      thunderdb:
        condition: service_healthy

  grafana:
    image: grafana/grafana:latest
    container_name: thunderdb-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./deploy/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./deploy/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    depends_on:
      - prometheus

volumes:
  thunderdb-data:
    driver: local
  thunderdb-wal:
    driver: local
  prometheus-data:
    driver: local
  grafana-data:
    driver: local
```

Start the stack:

```bash
docker compose up -d
```

Verify all services are healthy:

```bash
docker compose ps
docker compose logs thunderdb
```

---

## Kubernetes

ThunderDB provides production-ready Kubernetes manifests for deploying a distributed cluster. All manifests are located in `deploy/k8s/`.

### Namespace

```yaml
# deploy/k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: thunderdb
  labels:
    app: thunderdb
```

### ConfigMap

```yaml
# deploy/k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: thunderdb-config
  namespace: thunderdb
  labels:
    app: thunderdb
data:
  thunderdb.toml: |
    [node]
    node_id = 0  # Overridden per pod via environment variable

    [network]
    listen_addr = "0.0.0.0"
    pg_port = 5432
    mysql_port = 3306
    resp_port = 6379
    http_port = 8088
    grpc_port = 9090

    [storage]
    data_dir = "/var/lib/thunderdb/data"
    wal_dir = "/var/lib/thunderdb/wal"
    buffer_pool_size = "2GB"
    wal_buffer_size = "64MB"
    page_size = "16KB"
    checkpoint_interval = "60s"
    compaction_threads = 4
    direct_io = true
    compression = true
    compression_algorithm = "Lz4"
    max_wal_size = "2GB"
    sync_commit = true

    [cluster]
    cluster_name = "thunderdb-k8s"
    raft_election_timeout = "1s"
    raft_heartbeat_interval = "100ms"
    replication_factor = 3
    max_region_size = "256MB"
    min_region_size = "64MB"
    auto_balance = true

    [security]
    authentication_enabled = true
    tls_enabled = false  # Handled by Kubernetes service mesh or ingress

    [logging]
    level = "info"
    format = "json"
    slow_query_enabled = true
    slow_query_threshold = "1s"
```

### StatefulSet

```yaml
# deploy/k8s/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: thunderdb
  namespace: thunderdb
  labels:
    app: thunderdb
spec:
  serviceName: thunderdb-headless
  replicas: 3
  podManagementPolicy: Parallel
  selector:
    matchLabels:
      app: thunderdb
  template:
    metadata:
      labels:
        app: thunderdb
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8088"
        prometheus.io/path: "/admin/metrics"
    spec:
      terminationGracePeriodSeconds: 60
      securityContext:
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
      initContainers:
        - name: init-config
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              # Extract ordinal index from hostname (e.g., thunderdb-0 -> 0)
              ORDINAL=$(echo $HOSTNAME | rev | cut -d'-' -f1 | rev)
              echo "Node ID: $ORDINAL"
              # Generate peer list
              PEERS=""
              for i in $(seq 0 2); do
                if [ $i -ne $ORDINAL ]; then
                  PEERS="${PEERS}thunderdb-${i}.thunderdb-headless.thunderdb.svc.cluster.local:9090,"
                fi
              done
              PEERS=$(echo $PEERS | sed 's/,$//')
              echo "THUNDERDB_NODE_ID=$ORDINAL" > /etc/thunderdb/env
              echo "THUNDERDB_CLUSTER_PEERS=$PEERS" >> /etc/thunderdb/env
          volumeMounts:
            - name: config-env
              mountPath: /etc/thunderdb
      containers:
        - name: thunderdb
          image: thunderdb:latest
          imagePullPolicy: IfNotPresent
          ports:
            - name: pg
              containerPort: 5432
              protocol: TCP
            - name: mysql
              containerPort: 3306
              protocol: TCP
            - name: resp
              containerPort: 6379
              protocol: TCP
            - name: http
              containerPort: 8088
              protocol: TCP
            - name: grpc
              containerPort: 9090
              protocol: TCP
          envFrom:
            - configMapRef:
                name: thunderdb-env
                optional: true
          env:
            - name: THUNDERDB_DATA_DIR
              value: /var/lib/thunderdb/data
            - name: THUNDERDB_WAL_DIR
              value: /var/lib/thunderdb/wal
            - name: THUNDERDB_SUPERUSER_PASSWORD_HASH
              valueFrom:
                secretKeyRef:
                  name: thunderdb-secrets
                  key: superuser-password-hash
          readinessProbe:
            httpGet:
              path: /admin/ready
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /admin/live
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 5
          startupProbe:
            httpGet:
              path: /admin/health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 30
          resources:
            requests:
              cpu: "2"
              memory: 4Gi
            limits:
              cpu: "4"
              memory: 8Gi
          volumeMounts:
            - name: data
              mountPath: /var/lib/thunderdb/data
            - name: wal
              mountPath: /var/lib/thunderdb/wal
            - name: config
              mountPath: /etc/thunderdb/thunderdb.toml
              subPath: thunderdb.toml
              readOnly: true
            - name: config-env
              mountPath: /etc/thunderdb/env
              subPath: env
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: thunderdb-config
        - name: config-env
          emptyDir: {}
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: thunderdb
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 100Gi
    - metadata:
        name: wal
        labels:
          app: thunderdb
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: fast-ssd
        resources:
          requests:
            storage: 50Gi
```

### Service Definitions

```yaml
# deploy/k8s/service.yaml

# Headless service for StatefulSet DNS resolution
apiVersion: v1
kind: Service
metadata:
  name: thunderdb-headless
  namespace: thunderdb
  labels:
    app: thunderdb
spec:
  clusterIP: None
  selector:
    app: thunderdb
  ports:
    - name: pg
      port: 5432
      targetPort: pg
    - name: mysql
      port: 3306
      targetPort: mysql
    - name: resp
      port: 6379
      targetPort: resp
    - name: http
      port: 8088
      targetPort: http
    - name: grpc
      port: 9090
      targetPort: grpc

---
# ClusterIP service for internal client access
apiVersion: v1
kind: Service
metadata:
  name: thunderdb
  namespace: thunderdb
  labels:
    app: thunderdb
spec:
  type: ClusterIP
  selector:
    app: thunderdb
  ports:
    - name: pg
      port: 5432
      targetPort: pg
    - name: mysql
      port: 3306
      targetPort: mysql
    - name: resp
      port: 6379
      targetPort: resp
    - name: http
      port: 8088
      targetPort: http
    - name: grpc
      port: 9090
      targetPort: grpc

---
# LoadBalancer service for external client access (optional)
apiVersion: v1
kind: Service
metadata:
  name: thunderdb-external
  namespace: thunderdb
  labels:
    app: thunderdb
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  selector:
    app: thunderdb
  ports:
    - name: pg
      port: 5432
      targetPort: pg
    - name: mysql
      port: 3306
      targetPort: mysql
    - name: http
      port: 8088
      targetPort: http
```

### Deploy to Kubernetes

Apply all manifests using kustomize:

```bash
kubectl apply -k deploy/k8s/
```

Or apply individually:

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secrets.yaml
kubectl apply -f deploy/k8s/statefulset.yaml
kubectl apply -f deploy/k8s/service.yaml
```

Verify the deployment:

```bash
kubectl -n thunderdb get pods -w
kubectl -n thunderdb get svc
kubectl -n thunderdb logs thunderdb-0
```

### Horizontal Scaling

ThunderDB uses Raft consensus, so scaling considerations differ from stateless applications:

- **Scaling up**: Add replicas to the StatefulSet and update the peer configuration. New nodes join the cluster automatically and begin receiving region replicas.
- **Scaling down**: Remove nodes gracefully by draining regions first. Never scale below the `replication_factor` (default: 3).
- **Odd replica counts**: Always use an odd number of replicas (3, 5, 7) for Raft quorum. A 3-node cluster tolerates 1 failure; a 5-node cluster tolerates 2.

```bash
# Scale to 5 replicas
kubectl -n thunderdb scale statefulset thunderdb --replicas=5

# Verify all pods are running and ready
kubectl -n thunderdb get pods
```

After scaling, verify cluster membership:

```bash
curl http://thunderdb.thunderdb.svc:8088/admin/cluster/members
```

---

## Debian Package

### Building the Package

ThunderDB includes a script to build Debian packages:

```bash
./scripts/build-deb.sh
```

This produces a `.deb` file in the `target/debian/` directory:

```
target/debian/thunderdb_0.1.0_amd64.deb
```

### Installing

```bash
sudo dpkg -i thunderdb_0.1.0_amd64.deb
```

If there are dependency issues:

```bash
sudo apt-get install -f
```

### Package Contents

The Debian package installs the following:

| Path | Description |
|------|-------------|
| `/usr/local/bin/thunderdb` | ThunderDB binary |
| `/etc/thunderdb/thunderdb.toml` | Default configuration file |
| `/lib/systemd/system/thunderdb.service` | systemd service file |
| `/var/lib/thunderdb/data/` | Data directory |
| `/var/lib/thunderdb/wal/` | WAL directory |
| `/var/log/thunderdb/` | Log directory |

The package also creates the `thunder` system user and group.

### Uninstalling

```bash
sudo dpkg -r thunderdb

# To also remove configuration and data:
sudo dpkg -P thunderdb
```

---

## systemd Service

ThunderDB ships with a systemd service file for production Linux deployments.

### Service File

```ini
# /lib/systemd/system/thunderdb.service
[Unit]
Description=ThunderDB Distributed HTAP Database
Documentation=https://thunderdb.io/docs
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=notify
User=thunder
Group=thunder
ExecStart=/usr/local/bin/thunderdb --config /etc/thunderdb/thunderdb.toml
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
TimeoutStartSec=120
TimeoutStopSec=60

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ReadWritePaths=/var/lib/thunderdb /var/log/thunderdb

# Resource limits
LimitNOFILE=65535
LimitNPROC=65535
LimitMEMLOCK=infinity

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=thunderdb

[Install]
WantedBy=multi-user.target
```

### Managing the Service

```bash
# Reload systemd after installing or modifying the service file
sudo systemctl daemon-reload

# Start ThunderDB
sudo systemctl start thunderdb

# Stop ThunderDB
sudo systemctl stop thunderdb

# Restart ThunderDB
sudo systemctl restart thunderdb

# Enable ThunderDB to start on boot
sudo systemctl enable thunderdb

# Disable auto-start on boot
sudo systemctl disable thunderdb

# Check service status
sudo systemctl status thunderdb

# View logs
sudo journalctl -u thunderdb -f
sudo journalctl -u thunderdb --since "1 hour ago"
```

### Configuration Reload

ThunderDB supports hot-reloading certain configuration parameters without a full restart:

```bash
sudo systemctl reload thunderdb
```

Hot-reloadable parameters include log level, slow query threshold, and connection limits. Changes to storage engine or cluster settings require a full restart.

---

## Multi-Node Cluster Setup

### Using the Cluster Script

ThunderDB provides a convenience script for setting up multi-node clusters:

```bash
./scripts/cluster.sh --nodes 3 --data-dir /var/lib/thunderdb
```

This script generates configuration files for each node and provides the commands to start them.

### Manual Cluster Configuration

For production clusters, configure each node manually.

**Node 1 (`thunderdb-1.toml`):**

```toml
[node]
node_id = 1

[network]
listen_addr = "10.0.1.1"
pg_port = 5432
mysql_port = 3306
resp_port = 6379
http_port = 8088
grpc_port = 9090

[storage]
data_dir = "/var/lib/thunderdb/data"
wal_dir = "/var/lib/thunderdb/wal"
buffer_pool_size = "4GB"
wal_buffer_size = "64MB"
page_size = "16KB"
checkpoint_interval = "60s"
compaction_threads = 4
direct_io = true
compression = true
compression_algorithm = "Lz4"
max_wal_size = "2GB"
sync_commit = true

[cluster]
cluster_name = "production"
peers = [
    "10.0.1.2:9090",
    "10.0.1.3:9090"
]
raft_election_timeout = "1s"
raft_heartbeat_interval = "100ms"
replication_factor = 3
max_region_size = "256MB"
min_region_size = "64MB"
auto_balance = true

[security]
authentication_enabled = true
tls_enabled = true
tls_cert_path = "/etc/thunderdb/tls/server.crt"
tls_key_path = "/etc/thunderdb/tls/server.key"
superuser = "admin"
superuser_password = "change-me-in-production"

[logging]
level = "info"
format = "json"
slow_query_enabled = true
slow_query_threshold = "1s"
```

**Node 2 (`thunderdb-2.toml`):**

```toml
[node]
node_id = 2

[network]
listen_addr = "10.0.1.2"
# ... same ports as node 1

[cluster]
cluster_name = "production"
peers = [
    "10.0.1.1:9090",
    "10.0.1.3:9090"
]
# ... same cluster settings
```

**Node 3 (`thunderdb-3.toml`):**

```toml
[node]
node_id = 3

[network]
listen_addr = "10.0.1.3"
# ... same ports as node 1

[cluster]
cluster_name = "production"
peers = [
    "10.0.1.1:9090",
    "10.0.1.2:9090"
]
# ... same cluster settings
```

### Starting the Cluster

Start nodes in any order. Raft handles leader election automatically:

```bash
# On node 1
./thunderdb --config /etc/thunderdb/thunderdb-1.toml

# On node 2
./thunderdb --config /etc/thunderdb/thunderdb-2.toml

# On node 3
./thunderdb --config /etc/thunderdb/thunderdb-3.toml
```

### Cluster Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cluster_name` | `"default"` | Cluster identifier. All nodes in a cluster must share the same name. |
| `peers` | `[]` | List of peer addresses in `host:grpc_port` format. |
| `raft_election_timeout` | `"1s"` | Time a follower waits before starting an election. Increase for high-latency networks. |
| `raft_heartbeat_interval` | `"100ms"` | Interval between leader heartbeats. Must be less than `raft_election_timeout`. |
| `replication_factor` | `3` | Number of replicas for each region. Cannot exceed the number of nodes. |
| `max_region_size` | `"256MB"` | Regions are split when they exceed this size. |
| `min_region_size` | `"64MB"` | Regions are merged when they fall below this size. |
| `auto_balance` | `true` | Automatically balance regions across nodes. |

### Verifying the Cluster

After all nodes are running, verify cluster health:

```bash
# Check cluster membership
curl http://10.0.1.1:8088/admin/cluster/members

# Check Raft status
curl http://10.0.1.1:8088/admin/cluster/raft

# Check region distribution
curl http://10.0.1.1:8088/admin/cluster/regions
```

Expected output for a healthy 3-node cluster:

```json
{
  "cluster_name": "production",
  "members": [
    {"node_id": 1, "addr": "10.0.1.1:9090", "role": "leader", "status": "healthy"},
    {"node_id": 2, "addr": "10.0.1.2:9090", "role": "follower", "status": "healthy"},
    {"node_id": 3, "addr": "10.0.1.3:9090", "role": "follower", "status": "healthy"}
  ],
  "leader_id": 1,
  "term": 1,
  "replication_factor": 3
}
```

---

## Production Deployment Checklist

Before going to production, verify the following:

- [ ] **Hardware**: SSD storage, adequate RAM (see [Configuration]({{< relref "../configuration" >}}))
- [ ] **OS tuning**: File descriptor limits (`ulimit -n 65535`), disable swap, set `vm.swappiness=1`
- [ ] **Storage**: Separate disks/volumes for data and WAL directories
- [ ] **Network**: All required ports open between cluster nodes; firewall rules for client access
- [ ] **Security**: TLS enabled, authentication enabled, superuser password changed, audit logging on
- [ ] **Monitoring**: Prometheus scraping metrics, Grafana dashboards deployed, alerting configured
- [ ] **Backups**: Automated backup schedule configured, recovery procedure tested
- [ ] **Configuration**: `sync_commit = true`, `direct_io = true`, appropriate buffer pool size
- [ ] **Cluster**: Odd number of nodes, `replication_factor` matches cluster size, peers configured correctly
- [ ] **systemd**: Service enabled, resource limits set, auto-restart configured
