---
title: "API Reference"
weight: 1
description: "Complete reference for ThunderDB REST, gRPC, GraphQL, and WebSocket APIs with request/response examples."
---

# API Reference

ThunderDB exposes four API surfaces beyond its wire-protocol endpoints. This page documents every route, method, and message type with working examples.

| API | Transport | Default Port | Authentication |
|---|---|---|---|
| REST | HTTP/1.1 + HTTP/2 | `8088` | Bearer token, Basic Auth, mTLS |
| gRPC | HTTP/2 (Protobuf) | `9090` | Bearer token metadata, mTLS |
| GraphQL | HTTP (JSON) | `8088` (`/graphql`) | Bearer token, Basic Auth |
| WebSocket | WS / WSS | `8088` (`/ws/*`) | Token query param or first message |

All examples below assume ThunderDB is running on `localhost` with default ports and authentication disabled for brevity. In production, add the appropriate `Authorization` header or TLS configuration.

---

## REST API (port 8088)

Base URL: `http://localhost:8088`

### Health & Operations Endpoints

#### GET /admin/health

Returns overall cluster health status.

```bash
curl -s http://localhost:8088/admin/health | jq .
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "version": "0.9.0",
  "cluster_id": "thunder-prod-01",
  "uptime_seconds": 86421,
  "node_count": 5,
  "region_count": 3
}
```

#### GET /admin/live

Kubernetes-style liveness probe. Returns `200` if the process is running.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/admin/live
```

**Response (200 OK):**

```json
{
  "alive": true
}
```

#### GET /admin/ready

Kubernetes-style readiness probe. Returns `200` only when the node can accept queries (Raft leader elected, storage initialized).

```bash
curl -s http://localhost:8088/admin/ready | jq .
```

**Response (200 OK):**

```json
{
  "ready": true,
  "raft_state": "leader",
  "storage_ready": true,
  "last_applied_index": 148230
}
```

**Response (503 Service Unavailable):**

```json
{
  "ready": false,
  "raft_state": "follower",
  "storage_ready": true,
  "reason": "No leader elected yet"
}
```

#### GET /admin/metrics

Returns Prometheus-format metrics for scraping.

```bash
curl -s http://localhost:8088/admin/metrics
```

**Response (200 OK — text/plain):**

```
# HELP thunderdb_queries_total Total number of queries executed
# TYPE thunderdb_queries_total counter
thunderdb_queries_total{type="select"} 234892
thunderdb_queries_total{type="insert"} 89210
thunderdb_queries_total{type="update"} 12034
thunderdb_queries_total{type="delete"} 4501

# HELP thunderdb_query_duration_seconds Query execution duration histogram
# TYPE thunderdb_query_duration_seconds histogram
thunderdb_query_duration_seconds_bucket{le="0.001"} 180432
thunderdb_query_duration_seconds_bucket{le="0.01"} 220100
thunderdb_query_duration_seconds_bucket{le="0.1"} 234000
thunderdb_query_duration_seconds_bucket{le="1.0"} 234800
thunderdb_query_duration_seconds_bucket{le="+Inf"} 234892

# HELP thunderdb_active_connections Number of active client connections
# TYPE thunderdb_active_connections gauge
thunderdb_active_connections{protocol="postgresql"} 42
thunderdb_active_connections{protocol="mysql"} 18
thunderdb_active_connections{protocol="redis"} 105
thunderdb_active_connections{protocol="http"} 23
```

---

### Query Endpoints

#### POST /api/v1/query

Execute a SQL statement and return results as JSON.

```bash
curl -s http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT id, name, email FROM users WHERE active = true LIMIT 5"
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | SQL statement to execute |
| `params` | array | No | Positional bind parameters (`$1`, `$2`, ...) |
| `timeout_ms` | integer | No | Query timeout in milliseconds (default: 30000) |
| `consistency` | string | No | `strong` (default), `eventual`, or `stale` |

**Response (200 OK):**

```json
{
  "columns": ["id", "name", "email"],
  "column_types": ["Int64", "Varchar", "Varchar"],
  "rows": [
    [1, "Alice Johnson", "alice@example.com"],
    [2, "Bob Smith", "bob@example.com"],
    [3, "Carol White", "carol@example.com"]
  ],
  "row_count": 3,
  "execution_time_ms": 2.4
}
```

**Example with bind parameters:**

```bash
curl -s http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM orders WHERE customer_id = $1 AND total > $2",
    "params": [1001, 50.00]
  }' | jq .
```

#### POST /api/v1/query-explain

Return the query execution plan without running the query.

```bash
curl -s http://localhost:8088/api/v1/query-explain \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.customer_id GROUP BY u.name",
    "analyze": false,
    "verbose": true
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `sql` | string | Yes | SQL statement to explain |
| `analyze` | boolean | No | If `true`, actually execute and report real timings |
| `verbose` | boolean | No | If `true`, include additional planner details |
| `format` | string | No | Output format: `text` (default), `json`, `dot` |

**Response (200 OK):**

```json
{
  "plan": {
    "node_type": "Projection",
    "output": ["u.name", "COUNT(o.id)"],
    "children": [
      {
        "node_type": "HashAggregate",
        "group_by": ["u.name"],
        "children": [
          {
            "node_type": "HashJoin",
            "join_type": "inner",
            "condition": "u.id = o.customer_id",
            "estimated_rows": 15000,
            "children": [
              {
                "node_type": "SeqScan",
                "table": "users",
                "estimated_rows": 5000
              },
              {
                "node_type": "SeqScan",
                "table": "orders",
                "estimated_rows": 50000
              }
            ]
          }
        ]
      }
    ]
  },
  "planning_time_ms": 0.8
}
```

#### POST /api/v1/prepared

Create, execute, or deallocate a prepared statement.

**Create a prepared statement:**

```bash
curl -s http://localhost:8088/api/v1/prepared \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "name": "get_user_orders",
    "sql": "SELECT * FROM orders WHERE customer_id = $1 AND status = $2"
  }' | jq .
```

**Response (200 OK):**

```json
{
  "name": "get_user_orders",
  "param_types": ["Int64", "Varchar"],
  "created": true
}
```

**Execute a prepared statement:**

```bash
curl -s http://localhost:8088/api/v1/prepared \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute",
    "name": "get_user_orders",
    "params": [1001, "shipped"]
  }' | jq .
```

**Response (200 OK):**

```json
{
  "columns": ["id", "customer_id", "product_id", "quantity", "total", "status", "created_at"],
  "rows": [
    [5012, 1001, 42, 2, 99.98, "shipped", "2025-12-01T14:30:00Z"]
  ],
  "row_count": 1,
  "execution_time_ms": 0.9
}
```

**Deallocate a prepared statement:**

```bash
curl -s http://localhost:8088/api/v1/prepared \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deallocate",
    "name": "get_user_orders"
  }' | jq .
```

**Response (200 OK):**

```json
{
  "name": "get_user_orders",
  "deallocated": true
}
```

---

### Transaction Endpoints

#### POST /api/v1/transactions

Begin a new transaction and receive a transaction ID.

```bash
curl -s http://localhost:8088/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "isolation_level": "serializable",
    "read_only": false,
    "timeout_ms": 60000
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `isolation_level` | string | No | `read_committed` (default), `repeatable_read`, `serializable` |
| `read_only` | boolean | No | If `true`, the transaction only permits reads |
| `timeout_ms` | integer | No | Auto-rollback timeout (default: 60000) |

**Response (200 OK):**

```json
{
  "txn_id": "txn_a1b2c3d4e5f6",
  "isolation_level": "serializable",
  "read_only": false,
  "started_at": "2025-12-15T10:30:00.123Z"
}
```

**Execute within a transaction:**

```bash
curl -s http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -H "X-Thunder-Txn-Id: txn_a1b2c3d4e5f6" \
  -d '{
    "sql": "UPDATE accounts SET balance = balance - 100 WHERE id = 1"
  }' | jq .

curl -s http://localhost:8088/api/v1/query \
  -H "Content-Type: application/json" \
  -H "X-Thunder-Txn-Id: txn_a1b2c3d4e5f6" \
  -d '{
    "sql": "UPDATE accounts SET balance = balance + 100 WHERE id = 2"
  }' | jq .
```

#### POST /api/v1/transactions/{txn_id}/commit

Commit a transaction.

```bash
curl -s -X POST http://localhost:8088/api/v1/transactions/txn_a1b2c3d4e5f6/commit | jq .
```

**Response (200 OK):**

```json
{
  "txn_id": "txn_a1b2c3d4e5f6",
  "status": "committed",
  "committed_at": "2025-12-15T10:30:01.456Z",
  "rows_affected": 2
}
```

#### POST /api/v1/transactions/{txn_id}/rollback

Roll back a transaction.

```bash
curl -s -X POST http://localhost:8088/api/v1/transactions/txn_a1b2c3d4e5f6/rollback | jq .
```

**Response (200 OK):**

```json
{
  "txn_id": "txn_a1b2c3d4e5f6",
  "status": "rolled_back",
  "rolled_back_at": "2025-12-15T10:30:01.789Z"
}
```

---

### Table Management Endpoints

#### GET /api/v1/tables

List all tables in the current database.

```bash
curl -s http://localhost:8088/api/v1/tables | jq .
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `schema` | string | Filter by schema name (default: `public`) |
| `include_system` | boolean | Include internal system tables |

**Response (200 OK):**

```json
{
  "tables": [
    {
      "name": "users",
      "schema": "public",
      "engine": "row",
      "row_count": 5200,
      "size_bytes": 1048576,
      "created_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "orders",
      "schema": "public",
      "engine": "row",
      "row_count": 52000,
      "size_bytes": 15728640,
      "created_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "analytics_events",
      "schema": "public",
      "engine": "columnar",
      "row_count": 12000000,
      "size_bytes": 536870912,
      "created_at": "2025-11-05T00:00:00Z"
    }
  ]
}
```

#### GET /api/v1/tables/{table}

Get detailed schema information for a specific table.

```bash
curl -s http://localhost:8088/api/v1/tables/users | jq .
```

**Response (200 OK):**

```json
{
  "name": "users",
  "schema": "public",
  "engine": "row",
  "columns": [
    {"name": "id", "type": "Int64", "nullable": false, "primary_key": true, "default": "nextval('users_id_seq')"},
    {"name": "name", "type": "Varchar(255)", "nullable": false, "primary_key": false, "default": null},
    {"name": "email", "type": "Varchar(255)", "nullable": false, "primary_key": false, "default": null},
    {"name": "active", "type": "Boolean", "nullable": false, "primary_key": false, "default": "true"},
    {"name": "created_at", "type": "TimestampTz", "nullable": false, "primary_key": false, "default": "now()"}
  ],
  "indexes": [
    {"name": "users_pkey", "columns": ["id"], "type": "btree", "unique": true},
    {"name": "users_email_idx", "columns": ["email"], "type": "btree", "unique": true}
  ],
  "row_count": 5200,
  "size_bytes": 1048576,
  "created_at": "2025-11-01T00:00:00Z",
  "last_modified_at": "2025-12-15T10:00:00Z"
}
```

#### POST /api/v1/tables

Create a new table.

```bash
curl -s http://localhost:8088/api/v1/tables \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products",
    "schema": "public",
    "engine": "row",
    "columns": [
      {"name": "id", "type": "Int64", "primary_key": true},
      {"name": "name", "type": "Varchar(255)", "nullable": false},
      {"name": "description", "type": "Text", "nullable": true},
      {"name": "price", "type": "Decimal(10,2)", "nullable": false},
      {"name": "category", "type": "Varchar(100)", "nullable": true},
      {"name": "embedding", "type": "Vector(768)", "nullable": true},
      {"name": "created_at", "type": "TimestampTz", "default": "now()"}
    ],
    "if_not_exists": true
  }' | jq .
```

**Response (201 Created):**

```json
{
  "name": "products",
  "schema": "public",
  "created": true,
  "message": "Table 'public.products' created successfully"
}
```

#### DELETE /api/v1/tables/{table}

Drop a table.

```bash
curl -s -X DELETE "http://localhost:8088/api/v1/tables/products?if_exists=true&cascade=false" | jq .
```

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `if_exists` | boolean | Suppress error if table does not exist |
| `cascade` | boolean | Drop dependent objects (indexes, foreign keys) |

**Response (200 OK):**

```json
{
  "name": "products",
  "dropped": true,
  "message": "Table 'public.products' dropped successfully"
}
```

---

### Index Endpoints

#### GET /api/v1/indexes

List all indexes, optionally filtered by table.

```bash
curl -s "http://localhost:8088/api/v1/indexes?table=users" | jq .
```

**Response (200 OK):**

```json
{
  "indexes": [
    {
      "name": "users_pkey",
      "table": "users",
      "columns": ["id"],
      "type": "btree",
      "unique": true,
      "size_bytes": 131072
    },
    {
      "name": "users_email_idx",
      "table": "users",
      "columns": ["email"],
      "type": "btree",
      "unique": true,
      "size_bytes": 262144
    }
  ]
}
```

#### POST /api/v1/indexes

Create a new index.

```bash
curl -s http://localhost:8088/api/v1/indexes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products_embedding_idx",
    "table": "products",
    "columns": ["embedding"],
    "type": "hnsw",
    "options": {
      "m": 16,
      "ef_construction": 200,
      "distance_metric": "cosine"
    },
    "if_not_exists": true
  }' | jq .
```

**Supported Index Types:**

| Type | Use Case | Options |
|---|---|---|
| `btree` | General-purpose ordered index | `fillfactor` |
| `hash` | Equality lookups only | `fillfactor` |
| `hnsw` | Vector ANN search | `m`, `ef_construction`, `distance_metric` |
| `ivf_pq` | Large-scale vector search | `nlist`, `nprobe`, `m_pq`, `distance_metric` |
| `gin` | Full-text search, JSONB | `fastupdate` |
| `brin` | Large ordered datasets | `pages_per_range` |

**Response (201 Created):**

```json
{
  "name": "products_embedding_idx",
  "table": "products",
  "type": "hnsw",
  "created": true,
  "build_time_ms": 4521
}
```

#### DELETE /api/v1/indexes/{index_name}

Drop an index.

```bash
curl -s -X DELETE "http://localhost:8088/api/v1/indexes/products_embedding_idx?if_exists=true" | jq .
```

**Response (200 OK):**

```json
{
  "name": "products_embedding_idx",
  "dropped": true
}
```

---

### Vector Search Endpoint

#### POST /api/v1/vector-search

Perform an approximate nearest-neighbor search on a vector column.

```bash
curl -s http://localhost:8088/api/v1/vector-search \
  -H "Content-Type: application/json" \
  -d '{
    "table": "documents",
    "vector_column": "embedding",
    "query_vector": [0.1, -0.23, 0.98, 0.45, 0.67],
    "top_k": 10,
    "distance_metric": "cosine",
    "ef_search": 100,
    "filter": "category = '\''science'\'' AND published = true",
    "select_columns": ["id", "title", "category"]
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `table` | string | Yes | Table containing the vector column |
| `vector_column` | string | Yes | Name of the VECTOR column |
| `query_vector` | array[float] | Yes | Query embedding |
| `top_k` | integer | No | Number of results (default: 10) |
| `distance_metric` | string | No | `cosine` (default), `l2`, `inner_product` |
| `ef_search` | integer | No | HNSW search beam width (default: 64) |
| `nprobe` | integer | No | IVF-PQ number of clusters to probe (default: 10) |
| `filter` | string | No | SQL WHERE clause for pre-filtering |
| `select_columns` | array[string] | No | Columns to return (default: all) |

**Response (200 OK):**

```json
{
  "results": [
    {"id": 42, "title": "Quantum Computing Basics", "category": "science", "distance": 0.0312},
    {"id": 87, "title": "Introduction to Particle Physics", "category": "science", "distance": 0.0587},
    {"id": 15, "title": "The Standard Model Explained", "category": "science", "distance": 0.0823},
    {"id": 103, "title": "Cosmology for Beginners", "category": "science", "distance": 0.0991},
    {"id": 56, "title": "String Theory Overview", "category": "science", "distance": 0.1102}
  ],
  "count": 5,
  "distance_metric": "cosine",
  "execution_time_ms": 3.2
}
```

---

### Cluster Management Endpoints

#### GET /api/v1/cluster/nodes

List all nodes in the cluster.

```bash
curl -s http://localhost:8088/api/v1/cluster/nodes | jq .
```

**Response (200 OK):**

```json
{
  "nodes": [
    {
      "id": "node-1",
      "address": "10.0.1.10:5432",
      "role": "leader",
      "region": "us-east-1",
      "status": "healthy",
      "raft_term": 42,
      "last_heartbeat": "2025-12-15T10:30:00Z",
      "storage_used_bytes": 2147483648,
      "storage_total_bytes": 107374182400
    },
    {
      "id": "node-2",
      "address": "10.0.1.11:5432",
      "role": "follower",
      "region": "us-east-1",
      "status": "healthy",
      "raft_term": 42,
      "last_heartbeat": "2025-12-15T10:30:00Z",
      "storage_used_bytes": 2147483648,
      "storage_total_bytes": 107374182400
    },
    {
      "id": "node-3",
      "address": "10.0.2.10:5432",
      "role": "follower",
      "region": "us-west-2",
      "status": "healthy",
      "raft_term": 42,
      "last_heartbeat": "2025-12-15T10:29:59Z",
      "storage_used_bytes": 1073741824,
      "storage_total_bytes": 107374182400
    }
  ]
}
```

#### GET /api/v1/cluster/regions

List configured regions and their properties.

```bash
curl -s http://localhost:8088/api/v1/cluster/regions | jq .
```

**Response (200 OK):**

```json
{
  "regions": [
    {
      "name": "us-east-1",
      "node_count": 2,
      "leader_count": 1,
      "total_storage_bytes": 214748364800,
      "used_storage_bytes": 4294967296,
      "status": "healthy"
    },
    {
      "name": "us-west-2",
      "node_count": 1,
      "leader_count": 0,
      "total_storage_bytes": 107374182400,
      "used_storage_bytes": 1073741824,
      "status": "healthy"
    }
  ]
}
```

#### POST /api/v1/cluster/rebalance

Trigger a manual shard rebalance across the cluster.

```bash
curl -s -X POST http://localhost:8088/api/v1/cluster/rebalance \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "even_distribution",
    "max_concurrent_moves": 4,
    "dry_run": true
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `strategy` | string | No | `even_distribution` (default), `minimize_moves`, `region_aware` |
| `max_concurrent_moves` | integer | No | Max simultaneous shard transfers (default: 2) |
| `dry_run` | boolean | No | If `true`, return plan without executing |

**Response (200 OK):**

```json
{
  "dry_run": true,
  "moves": [
    {
      "shard": "shard-007",
      "from_node": "node-1",
      "to_node": "node-3",
      "estimated_size_bytes": 536870912,
      "estimated_duration_seconds": 120
    }
  ],
  "total_moves": 1,
  "estimated_total_duration_seconds": 120
}
```

---

### CDC (Change Data Capture) Subscription Endpoints

#### GET /api/v1/subscriptions

List all active CDC subscriptions.

```bash
curl -s http://localhost:8088/api/v1/subscriptions | jq .
```

**Response (200 OK):**

```json
{
  "subscriptions": [
    {
      "id": "sub_abc123",
      "name": "orders_to_warehouse",
      "table": "orders",
      "events": ["insert", "update"],
      "delivery": "webhook",
      "endpoint": "https://warehouse.internal/api/order-events",
      "status": "active",
      "created_at": "2025-12-01T00:00:00Z",
      "last_delivered_at": "2025-12-15T10:29:58Z",
      "delivered_count": 12840
    }
  ]
}
```

#### POST /api/v1/subscriptions

Create a new CDC subscription.

```bash
curl -s http://localhost:8088/api/v1/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user_changes_stream",
    "table": "users",
    "events": ["insert", "update", "delete"],
    "delivery": "webhook",
    "endpoint": "https://app.internal/hooks/user-changes",
    "filter": "active = true",
    "include_old_values": true,
    "batch_size": 100,
    "batch_timeout_ms": 5000,
    "retry_policy": {
      "max_retries": 5,
      "backoff_ms": 1000,
      "backoff_multiplier": 2.0
    }
  }' | jq .
```

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable subscription name |
| `table` | string | Yes | Table to watch |
| `events` | array[string] | Yes | Event types: `insert`, `update`, `delete` |
| `delivery` | string | Yes | `webhook`, `websocket`, or `grpc_stream` |
| `endpoint` | string | Conditional | URL for webhook delivery |
| `filter` | string | No | SQL WHERE clause to filter events |
| `include_old_values` | boolean | No | Include pre-update row values for updates/deletes |
| `batch_size` | integer | No | Max events per delivery batch (default: 1) |
| `batch_timeout_ms` | integer | No | Max wait before flushing batch (default: 1000) |
| `retry_policy` | object | No | Retry configuration for failed deliveries |

**Response (201 Created):**

```json
{
  "id": "sub_def456",
  "name": "user_changes_stream",
  "table": "users",
  "status": "active",
  "created_at": "2025-12-15T10:30:00Z"
}
```

#### DELETE /api/v1/subscriptions/{subscription_id}

Delete a CDC subscription.

```bash
curl -s -X DELETE http://localhost:8088/api/v1/subscriptions/sub_def456 | jq .
```

**Response (200 OK):**

```json
{
  "id": "sub_def456",
  "deleted": true,
  "message": "Subscription 'user_changes_stream' deleted successfully"
}
```

---

### Error Responses

All REST endpoints return errors in a consistent format:

```json
{
  "error": {
    "code": "INVALID_SQL",
    "message": "Syntax error at position 15: unexpected token 'FORM'",
    "detail": "Did you mean 'FROM'?",
    "request_id": "req_7f8a9b0c"
  }
}
```

**Common HTTP Status Codes:**

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `400` | Bad request (invalid SQL, missing params) |
| `401` | Unauthorized (missing or invalid credentials) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Resource not found (table, index, subscription) |
| `409` | Conflict (table already exists, transaction conflict) |
| `422` | Unprocessable entity (valid JSON but semantic error) |
| `429` | Rate limited |
| `500` | Internal server error |
| `503` | Service unavailable (node not ready) |

---

## gRPC API (port 9090)

ThunderDB exposes gRPC services on port `9090` using Protocol Buffers. The proto definitions are available at `thunder-proto/src/thunder.proto` in the source repository.

### ThunderQuery Service

```protobuf
service ThunderQuery {
  // Execute a SQL statement and return results
  rpc Execute(QueryRequest) returns (QueryResponse);

  // Return the execution plan for a SQL statement
  rpc Explain(ExplainRequest) returns (ExplainResponse);

  // Begin a new transaction
  rpc BeginTransaction(BeginTransactionRequest) returns (BeginTransactionResponse);

  // Commit a transaction
  rpc Commit(CommitRequest) returns (CommitResponse);

  // Rollback a transaction
  rpc Rollback(RollbackRequest) returns (RollbackResponse);

  // Stream query results for large result sets
  rpc ExecuteStream(QueryRequest) returns (stream QueryRow);
}
```

#### Message Definitions

```protobuf
message QueryRequest {
  string sql = 1;
  repeated Value params = 2;
  string txn_id = 3;          // Optional: execute within a transaction
  uint32 timeout_ms = 4;      // Optional: query timeout
  Consistency consistency = 5; // Optional: read consistency level
}

message QueryResponse {
  repeated string columns = 1;
  repeated string column_types = 2;
  repeated Row rows = 3;
  uint64 row_count = 4;
  double execution_time_ms = 5;
}

message Row {
  repeated Value values = 1;
}

message Value {
  oneof kind {
    bool bool_value = 1;
    int64 int_value = 2;
    double float_value = 3;
    string string_value = 4;
    bytes bytes_value = 5;
    NullValue null_value = 6;
    VectorValue vector_value = 7;
  }
}

message VectorValue {
  repeated float elements = 1;
}

enum Consistency {
  STRONG = 0;
  EVENTUAL = 1;
  STALE = 2;
}

message ExplainRequest {
  string sql = 1;
  bool analyze = 2;
  bool verbose = 3;
  string format = 4; // "text", "json", "dot"
}

message ExplainResponse {
  string plan_text = 1;
  bytes plan_json = 2;
  double planning_time_ms = 3;
  double execution_time_ms = 4; // Only populated when analyze = true
}

message BeginTransactionRequest {
  IsolationLevel isolation_level = 1;
  bool read_only = 2;
  uint32 timeout_ms = 3;
}

message BeginTransactionResponse {
  string txn_id = 1;
  IsolationLevel isolation_level = 2;
  google.protobuf.Timestamp started_at = 3;
}

enum IsolationLevel {
  READ_COMMITTED = 0;
  REPEATABLE_READ = 1;
  SERIALIZABLE = 2;
}

message CommitRequest {
  string txn_id = 1;
}

message CommitResponse {
  string txn_id = 1;
  bool success = 2;
  uint64 rows_affected = 3;
  google.protobuf.Timestamp committed_at = 4;
}

message RollbackRequest {
  string txn_id = 1;
}

message RollbackResponse {
  string txn_id = 1;
  bool success = 2;
}
```

#### gRPC Example with grpcurl

```bash
# Execute a query
grpcurl -plaintext -d '{
  "sql": "SELECT id, name FROM users LIMIT 5"
}' localhost:9090 thunder.ThunderQuery/Execute

# Explain a query
grpcurl -plaintext -d '{
  "sql": "SELECT * FROM orders WHERE customer_id = 1001",
  "analyze": true
}' localhost:9090 thunder.ThunderQuery/Explain

# Begin a transaction
grpcurl -plaintext -d '{
  "isolation_level": "SERIALIZABLE"
}' localhost:9090 thunder.ThunderQuery/BeginTransaction

# Commit a transaction
grpcurl -plaintext -d '{
  "txn_id": "txn_a1b2c3d4e5f6"
}' localhost:9090 thunder.ThunderQuery/Commit

# Rollback a transaction
grpcurl -plaintext -d '{
  "txn_id": "txn_a1b2c3d4e5f6"
}' localhost:9090 thunder.ThunderQuery/Rollback
```

### Cluster Service

```protobuf
service Cluster {
  // Get all nodes in the cluster
  rpc GetNodes(GetNodesRequest) returns (GetNodesResponse);

  // Get all regions
  rpc GetRegions(GetRegionsRequest) returns (GetRegionsResponse);

  // Propose a configuration change to the Raft cluster
  rpc Propose(ProposeRequest) returns (ProposeResponse);

  // Stream cluster events (leader changes, node joins/leaves)
  rpc WatchEvents(WatchEventsRequest) returns (stream ClusterEvent);
}
```

#### Message Definitions

```protobuf
message GetNodesRequest {
  string region = 1; // Optional: filter by region
}

message GetNodesResponse {
  repeated Node nodes = 1;
}

message Node {
  string id = 1;
  string address = 2;
  string role = 3;          // "leader", "follower", "learner"
  string region = 4;
  string status = 5;        // "healthy", "suspect", "down"
  uint64 raft_term = 6;
  google.protobuf.Timestamp last_heartbeat = 7;
  uint64 storage_used_bytes = 8;
  uint64 storage_total_bytes = 9;
}

message GetRegionsRequest {}

message GetRegionsResponse {
  repeated Region regions = 1;
}

message Region {
  string name = 1;
  uint32 node_count = 2;
  uint32 leader_count = 3;
  uint64 total_storage_bytes = 4;
  uint64 used_storage_bytes = 5;
  string status = 6;
}

message ProposeRequest {
  oneof proposal {
    AddNodeProposal add_node = 1;
    RemoveNodeProposal remove_node = 2;
    TransferLeaderProposal transfer_leader = 3;
  }
}

message AddNodeProposal {
  string node_id = 1;
  string address = 2;
  string region = 3;
  bool as_learner = 4;
}

message RemoveNodeProposal {
  string node_id = 1;
  bool force = 2;
}

message TransferLeaderProposal {
  string target_node_id = 1;
}

message ProposeResponse {
  bool accepted = 1;
  string proposal_id = 2;
  string message = 3;
}

message WatchEventsRequest {
  repeated string event_types = 1; // Filter: "leader_change", "node_join", "node_leave", "rebalance"
}

message ClusterEvent {
  string event_type = 1;
  google.protobuf.Timestamp timestamp = 2;
  map<string, string> metadata = 3;
}
```

#### gRPC Cluster Examples

```bash
# Get all cluster nodes
grpcurl -plaintext localhost:9090 thunder.Cluster/GetNodes

# Get all regions
grpcurl -plaintext localhost:9090 thunder.Cluster/GetRegions

# Add a new node to the cluster
grpcurl -plaintext -d '{
  "add_node": {
    "node_id": "node-4",
    "address": "10.0.3.10:5432",
    "region": "eu-west-1",
    "as_learner": true
  }
}' localhost:9090 thunder.Cluster/Propose

# Watch cluster events
grpcurl -plaintext -d '{
  "event_types": ["leader_change", "node_join"]
}' localhost:9090 thunder.Cluster/WatchEvents
```

---

## GraphQL API (port 8088)

The GraphQL endpoint is available at `http://localhost:8088/graphql`. An interactive GraphiQL explorer is served at `http://localhost:8088/graphiql` when development mode is enabled.

### Schema Overview

```graphql
type Query {
  # List all tables in the database
  tables(schema: String): [Table!]!

  # Execute a read-only SQL query
  query(sql: String!, params: [JSON]): QueryResult!

  # Return the execution plan for a SQL query
  explain(sql: String!, analyze: Boolean, verbose: Boolean): ExplainResult!

  # Get cluster node information
  nodes: [Node!]!
}

type Mutation {
  # Create a new table
  createTable(input: CreateTableInput!): TableResult!

  # Drop an existing table
  dropTable(name: String!, ifExists: Boolean, cascade: Boolean): DropResult!

  # Execute a write SQL statement (INSERT, UPDATE, DELETE)
  execute(sql: String!, params: [JSON]): ExecuteResult!

  # Execute multiple statements in a transaction
  executeTransaction(
    statements: [StatementInput!]!
    isolationLevel: IsolationLevel
  ): TransactionResult!
}

type Subscription {
  # Watch for new row inserts on a table
  onRowInserted(table: String!, filter: String): RowEvent!

  # Watch for row updates on a table
  onRowUpdated(table: String!, filter: String): RowUpdateEvent!

  # Watch for row deletions on a table
  onRowDeleted(table: String!, filter: String): RowEvent!
}
```

### Types

```graphql
type Table {
  name: String!
  schema: String!
  engine: String!
  columns: [Column!]!
  indexes: [Index!]!
  rowCount: Int!
  sizeBytes: Int!
}

type Column {
  name: String!
  type: String!
  nullable: Boolean!
  primaryKey: Boolean!
  default: String
}

type Index {
  name: String!
  columns: [String!]!
  type: String!
  unique: Boolean!
}

type QueryResult {
  columns: [String!]!
  columnTypes: [String!]!
  rows: [[JSON]]!
  rowCount: Int!
  executionTimeMs: Float!
}

type ExplainResult {
  plan: JSON!
  planningTimeMs: Float!
  executionTimeMs: Float
}

type ExecuteResult {
  rowsAffected: Int!
  executionTimeMs: Float!
}

type TableResult {
  name: String!
  created: Boolean!
}

type DropResult {
  name: String!
  dropped: Boolean!
}

type TransactionResult {
  committed: Boolean!
  results: [ExecuteResult!]!
  totalExecutionTimeMs: Float!
}

type RowEvent {
  table: String!
  operation: String!
  row: JSON!
  timestamp: String!
  lsn: String!
}

type RowUpdateEvent {
  table: String!
  operation: String!
  oldRow: JSON
  newRow: JSON!
  changedColumns: [String!]!
  timestamp: String!
  lsn: String!
}

type Node {
  id: String!
  address: String!
  role: String!
  region: String!
  status: String!
}

input CreateTableInput {
  name: String!
  schema: String
  engine: String
  columns: [ColumnInput!]!
  ifNotExists: Boolean
}

input ColumnInput {
  name: String!
  type: String!
  nullable: Boolean
  primaryKey: Boolean
  default: String
}

input StatementInput {
  sql: String!
  params: [JSON]
}

enum IsolationLevel {
  READ_COMMITTED
  REPEATABLE_READ
  SERIALIZABLE
}
```

### Query Examples

**List all tables:**

```graphql
query {
  tables {
    name
    engine
    rowCount
    columns {
      name
      type
      nullable
    }
  }
}
```

```bash
curl -s http://localhost:8088/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ tables { name engine rowCount columns { name type nullable } } }"
  }' | jq .
```

**Execute a query:**

```graphql
query {
  query(sql: "SELECT name, email FROM users WHERE active = true LIMIT 3") {
    columns
    rows
    rowCount
    executionTimeMs
  }
}
```

```bash
curl -s http://localhost:8088/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ query(sql: \"SELECT name, email FROM users WHERE active = true LIMIT 3\") { columns rows rowCount executionTimeMs } }"
  }' | jq .
```

**Explain a query:**

```graphql
query {
  explain(sql: "SELECT * FROM orders WHERE total > 100", analyze: true) {
    plan
    planningTimeMs
    executionTimeMs
  }
}
```

### Mutation Examples

**Create a table:**

```graphql
mutation {
  createTable(input: {
    name: "events"
    engine: "columnar"
    columns: [
      { name: "id", type: "Int64", primaryKey: true }
      { name: "event_type", type: "Varchar(50)", nullable: false }
      { name: "payload", type: "Jsonb" }
      { name: "created_at", type: "TimestampTz", default: "now()" }
    ]
    ifNotExists: true
  }) {
    name
    created
  }
}
```

```bash
curl -s http://localhost:8088/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { createTable(input: { name: \"events\", engine: \"columnar\", columns: [{ name: \"id\", type: \"Int64\", primaryKey: true }, { name: \"event_type\", type: \"Varchar(50)\", nullable: false }, { name: \"payload\", type: \"Jsonb\" }, { name: \"created_at\", type: \"TimestampTz\", default: \"now()\" }], ifNotExists: true }) { name created } }"
  }' | jq .
```

**Execute a write statement:**

```graphql
mutation {
  execute(
    sql: "INSERT INTO events (id, event_type, payload) VALUES (1, 'signup', '{\"user_id\": 42}')"
  ) {
    rowsAffected
    executionTimeMs
  }
}
```

**Execute a transaction:**

```graphql
mutation {
  executeTransaction(
    statements: [
      { sql: "UPDATE accounts SET balance = balance - 500 WHERE id = 1" }
      { sql: "UPDATE accounts SET balance = balance + 500 WHERE id = 2" }
      { sql: "INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 500)" }
    ]
    isolationLevel: SERIALIZABLE
  ) {
    committed
    results {
      rowsAffected
    }
    totalExecutionTimeMs
  }
}
```

### Subscription Examples

GraphQL subscriptions use WebSocket transport (graphql-ws protocol).

**Subscribe to new order inserts:**

```graphql
subscription {
  onRowInserted(table: "orders", filter: "total > 1000") {
    table
    operation
    row
    timestamp
  }
}
```

**Subscribe to user profile updates:**

```graphql
subscription {
  onRowUpdated(table: "users") {
    table
    oldRow
    newRow
    changedColumns
    timestamp
  }
}
```

**Subscribe to deletions:**

```graphql
subscription {
  onRowDeleted(table: "sessions") {
    table
    row
    timestamp
    lsn
  }
}
```

**JavaScript client example using graphql-ws:**

```javascript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:8088/graphql',
});

// Subscribe to order inserts
const unsubscribe = client.subscribe(
  {
    query: `subscription {
      onRowInserted(table: "orders") {
        row
        timestamp
      }
    }`,
  },
  {
    next(data) {
      console.log('New order:', data.data.onRowInserted);
    },
    error(err) {
      console.error('Subscription error:', err);
    },
    complete() {
      console.log('Subscription complete');
    },
  }
);
```

---

## WebSocket API (port 8088)

ThunderDB provides raw WebSocket endpoints for streaming queries and event subscriptions without the GraphQL layer.

### WS /ws/query

Stream query results row by row over a persistent WebSocket connection. Useful for large result sets or continuous queries.

**Connect:**

```bash
wscat -c ws://localhost:8088/ws/query
```

**Send a query:**

```json
{
  "type": "query",
  "id": "q1",
  "sql": "SELECT * FROM orders WHERE status = 'pending'",
  "params": []
}
```

**Receive responses:**

```json
{"type": "metadata", "id": "q1", "columns": ["id", "customer_id", "total", "status", "created_at"], "column_types": ["Int64", "Int64", "Decimal", "Varchar", "TimestampTz"]}
{"type": "row", "id": "q1", "data": [1001, 42, 299.99, "pending", "2025-12-15T10:00:00Z"]}
{"type": "row", "id": "q1", "data": [1002, 87, 149.50, "pending", "2025-12-15T10:05:00Z"]}
{"type": "complete", "id": "q1", "row_count": 2, "execution_time_ms": 4.2}
```

**Cancel a running query:**

```json
{
  "type": "cancel",
  "id": "q1"
}
```

### WS /ws/events

Subscribe to real-time CDC events on one or more tables.

**Connect:**

```bash
wscat -c ws://localhost:8088/ws/events
```

**Subscribe to events:**

```json
{
  "type": "subscribe",
  "id": "sub1",
  "table": "orders",
  "events": ["insert", "update", "delete"],
  "filter": "total > 100"
}
```

**Receive events:**

```json
{
  "type": "event",
  "id": "sub1",
  "table": "orders",
  "operation": "insert",
  "row": {"id": 1003, "customer_id": 55, "total": 520.00, "status": "new", "created_at": "2025-12-15T10:30:00Z"},
  "lsn": "0/1A2B3C4D",
  "timestamp": "2025-12-15T10:30:00.123Z"
}
```

```json
{
  "type": "event",
  "id": "sub1",
  "table": "orders",
  "operation": "update",
  "old_row": {"id": 1003, "status": "new"},
  "new_row": {"id": 1003, "status": "processing"},
  "changed_columns": ["status"],
  "lsn": "0/1A2B3C5E",
  "timestamp": "2025-12-15T10:30:05.456Z"
}
```

**Unsubscribe:**

```json
{
  "type": "unsubscribe",
  "id": "sub1"
}
```

### WS /ws/replication

Internal replication stream used by ThunderDB nodes for WAL shipping. This endpoint is primarily for cluster-internal use but can be consumed by external tools for logical replication.

**Connect:**

```bash
wscat -c ws://localhost:8088/ws/replication
```

**Start replication from a specific LSN:**

```json
{
  "type": "start_replication",
  "slot": "my_replication_slot",
  "start_lsn": "0/1A000000",
  "options": {
    "output_format": "json",
    "include_transaction_boundaries": true
  }
}
```

**Receive WAL entries:**

```json
{"type": "begin", "txn_id": "txn_001", "lsn": "0/1A000010", "timestamp": "2025-12-15T10:30:00Z"}
{"type": "insert", "table": "orders", "lsn": "0/1A000020", "row": {"id": 1003, "total": 520.00}}
{"type": "commit", "txn_id": "txn_001", "lsn": "0/1A000030", "timestamp": "2025-12-15T10:30:00.001Z"}
```

**Acknowledge processed LSN (to advance the replication slot):**

```json
{
  "type": "ack",
  "lsn": "0/1A000030"
}
```

---

## Rate Limiting

ThunderDB enforces per-client rate limits on the HTTP API layer. Default limits:

| Endpoint Category | Requests/sec | Burst |
|---|---|---|
| `/admin/*` | 100 | 200 |
| `/api/v1/query` | 1000 | 2000 |
| `/api/v1/vector-search` | 500 | 1000 |
| `/api/v1/cluster/*` | 50 | 100 |
| All other endpoints | 500 | 1000 |

Rate-limited responses return `429 Too Many Requests` with a `Retry-After` header:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 1
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1702641001
```

Rate limits are configurable in `thunderdb.toml` under the `[http.rate_limit]` section. See the [Configuration Guide](../../administrator/configuration/) for details.

---

## Pagination

For endpoints that return lists (tables, indexes, subscriptions, nodes), ThunderDB supports cursor-based pagination:

```bash
# First page
curl -s "http://localhost:8088/api/v1/tables?limit=10" | jq .

# Next page using cursor from previous response
curl -s "http://localhost:8088/api/v1/tables?limit=10&cursor=eyJvZmZzZXQiOjEwfQ==" | jq .
```

Response includes pagination metadata:

```json
{
  "tables": [...],
  "pagination": {
    "total": 47,
    "limit": 10,
    "has_more": true,
    "next_cursor": "eyJvZmZzZXQiOjEwfQ=="
  }
}
```
