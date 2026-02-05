---
title: "Examples & Use Cases"
weight: 4
description: "End-to-end application examples demonstrating ThunderDB for e-commerce, analytics, RAG pipelines, data federation, CDC, caching, and IoT."
---

# Examples & Use Cases

This section provides complete, runnable examples for seven common application patterns. Each example includes the schema design, sample data, queries, and expected output so you can follow along against a local ThunderDB instance.

---

## 1. E-Commerce Application (OLTP)

An online store with users, products, orders, and real-time inventory management. This example demonstrates ThunderDB's transactional capabilities with row-oriented storage.

### Description

A typical e-commerce backend needs fast point lookups for product pages, ACID transactions for order placement (decrement inventory atomically), and efficient queries for user order history. ThunderDB's row-oriented engine handles all of these in a single system.

### Schema

```sql
-- Users table
CREATE TABLE users (
    id         BIGINT PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) UNIQUE NOT NULL,
    membership VARCHAR(20) DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Product catalog
CREATE TABLE products (
    id          BIGINT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    price       DECIMAL(10,2) NOT NULL,
    category    VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Inventory (separate for concurrency)
CREATE TABLE inventory (
    product_id BIGINT PRIMARY KEY REFERENCES products(id),
    quantity   INT32 NOT NULL CHECK (quantity >= 0),
    reserved   INT32 NOT NULL DEFAULT 0,
    warehouse  VARCHAR(50) NOT NULL
);

-- Orders
CREATE TABLE orders (
    id          BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES users(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    total       DECIMAL(10,2) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Order line items
CREATE TABLE order_items (
    id         BIGINT PRIMARY KEY,
    order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity   INT32 NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL
);

-- Indexes
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_products_category ON products (category);
```

### Sample Data

```sql
-- Users
INSERT INTO users (id, name, email, membership) VALUES
    (1, 'Alice Johnson', 'alice@example.com', 'gold'),
    (2, 'Bob Smith', 'bob@example.com', 'standard'),
    (3, 'Carol White', 'carol@example.com', 'gold'),
    (4, 'Dave Brown', 'dave@example.com', 'platinum');

-- Products
INSERT INTO products (id, name, description, price, category) VALUES
    (101, 'Wireless Mouse', 'Ergonomic wireless mouse with USB-C', 29.99, 'electronics'),
    (102, 'Mechanical Keyboard', 'Cherry MX Blue switches, RGB', 149.99, 'electronics'),
    (103, 'Python Cookbook', 'Advanced Python recipes, 3rd edition', 45.00, 'books'),
    (104, 'Standing Desk', 'Electric height-adjustable, 60 inch', 599.99, 'furniture'),
    (105, 'USB-C Hub', '7-port USB-C dock with HDMI', 79.99, 'electronics');

-- Inventory
INSERT INTO inventory (product_id, quantity, reserved, warehouse) VALUES
    (101, 500, 12, 'warehouse-east'),
    (102, 200, 5, 'warehouse-east'),
    (103, 1000, 0, 'warehouse-west'),
    (104, 50, 3, 'warehouse-west'),
    (105, 350, 8, 'warehouse-east');
```

### Queries

**Place an order (transactional):**

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Check inventory
SELECT quantity - reserved AS available
FROM inventory
WHERE product_id = 102;
-- Returns: available = 195

-- Reserve inventory
UPDATE inventory
SET reserved = reserved + 1
WHERE product_id = 102 AND (quantity - reserved) >= 1;

-- Create the order
INSERT INTO orders (id, customer_id, status, total)
VALUES (1001, 1, 'confirmed', 149.99);

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
VALUES (5001, 1001, 102, 1, 149.99);

COMMIT;
```

**User order history:**

```sql
SELECT
    o.id AS order_id,
    o.status,
    o.total,
    o.created_at,
    jsonb_agg(jsonb_build_object(
        'product', p.name,
        'quantity', oi.quantity,
        'price', oi.unit_price
    )) AS items
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.customer_id = 1
GROUP BY o.id, o.status, o.total, o.created_at
ORDER BY o.created_at DESC;
```

**Expected output:**

```
 order_id | status    | total  | created_at               | items
----------+-----------+--------+--------------------------+-----------------------------------------------
     1001 | confirmed | 149.99 | 2025-12-15 10:30:00+00   | [{"price": 149.99, "product": "Mechanical Keyboard", "quantity": 1}]
```

**Low-stock alert:**

```sql
SELECT
    p.id,
    p.name,
    p.category,
    i.quantity,
    i.reserved,
    i.quantity - i.reserved AS available,
    i.warehouse
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE (i.quantity - i.reserved) < 100
ORDER BY available ASC;
```

**Expected output:**

```
 id  | name          | category  | quantity | reserved | available | warehouse
-----+---------------+-----------+----------+----------+-----------+----------------
 104 | Standing Desk | furniture |       50 |        3 |        47 | warehouse-west
```

---

## 2. Analytics Dashboard (OLAP)

An analytics platform that ingests high volumes of events and serves aggregate dashboards. This example demonstrates ThunderDB's columnar storage engine for analytical workloads.

### Description

Analytics dashboards need to scan millions of rows, compute aggregations by various dimensions (time, geography, device), and return results in sub-second latency. ThunderDB's columnar engine stores data in compressed columns with BRIN indexes, making it ideal for time-series analytics.

### Schema

```sql
-- Columnar table for events (optimized for scans)
CREATE TABLE analytics_events (
    event_id    BIGINT PRIMARY KEY,
    user_id     BIGINT,
    session_id  UUID,
    event_type  VARCHAR(50) NOT NULL,
    page_url    VARCHAR(500),
    referrer    VARCHAR(500),
    device_type VARCHAR(20),
    country     VARCHAR(2),
    city        VARCHAR(100),
    properties  JSONB,
    occurred_at TIMESTAMPTZ NOT NULL
) ENGINE = COLUMNAR;

-- BRIN index on timestamp for efficient time range scans
CREATE INDEX idx_events_time ON analytics_events USING BRIN (occurred_at)
    WITH (pages_per_range = 32);

-- B-tree index for event type filtering
CREATE INDEX idx_events_type ON analytics_events (event_type);

-- Daily revenue materialization
CREATE TABLE daily_revenue (
    date      DATE PRIMARY KEY,
    revenue   DECIMAL(12,2) NOT NULL,
    orders    INT32 NOT NULL,
    avg_order DECIMAL(10,2) NOT NULL
) ENGINE = COLUMNAR;
```

### Sample Data

```sql
INSERT INTO analytics_events (event_id, user_id, session_id, event_type, page_url, device_type, country, city, properties, occurred_at) VALUES
    (1, 1001, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'page_view', '/products/102', 'desktop', 'US', 'New York', '{"duration_ms": 4500}', '2025-12-15 10:00:00+00'),
    (2, 1001, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'add_to_cart', '/products/102', 'desktop', 'US', 'New York', '{"product_id": 102, "price": 149.99}', '2025-12-15 10:02:00+00'),
    (3, 1002, 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'page_view', '/products/101', 'mobile', 'GB', 'London', '{"duration_ms": 2100}', '2025-12-15 10:05:00+00'),
    (4, 1003, 'c3d4e5f6-a7b8-9012-cdef-123456789012', 'purchase', '/checkout', 'desktop', 'US', 'San Francisco', '{"order_id": 1001, "total": 149.99}', '2025-12-15 10:10:00+00'),
    (5, 1002, 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'page_view', '/', 'mobile', 'GB', 'London', '{"duration_ms": 800}', '2025-12-15 10:12:00+00'),
    (6, 1004, 'd4e5f6a7-b8c9-0123-defa-234567890123', 'signup', '/register', 'tablet', 'DE', 'Berlin', '{"source": "google_ads"}', '2025-12-15 10:15:00+00'),
    (7, 1004, 'd4e5f6a7-b8c9-0123-defa-234567890123', 'page_view', '/products', 'tablet', 'DE', 'Berlin', '{"duration_ms": 3200}', '2025-12-15 10:16:00+00'),
    (8, 1001, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'purchase', '/checkout', 'desktop', 'US', 'New York', '{"order_id": 1002, "total": 79.99}', '2025-12-15 10:20:00+00');

INSERT INTO daily_revenue (date, revenue, orders, avg_order) VALUES
    ('2025-12-01', 12450.00, 85, 146.47),
    ('2025-12-02', 14200.50, 102, 139.22),
    ('2025-12-03', 11890.25, 78, 152.44),
    ('2025-12-04', 15600.00, 112, 139.29),
    ('2025-12-05', 13100.75, 91, 143.96),
    ('2025-12-06', 9800.00, 65, 150.77),
    ('2025-12-07', 8200.50, 58, 141.39),
    ('2025-12-08', 13900.25, 95, 146.32),
    ('2025-12-09', 16200.00, 118, 137.29),
    ('2025-12-10', 14800.50, 105, 140.96);
```

### Queries

**Hourly event counts by type (time-series):**

```sql
SELECT
    date_trunc('hour', occurred_at) AS hour,
    event_type,
    COUNT(*) AS event_count
FROM analytics_events
WHERE occurred_at >= '2025-12-15' AND occurred_at < '2025-12-16'
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Expected output:**

```
 hour                     | event_type   | event_count
--------------------------+--------------+------------
 2025-12-15 10:00:00+00   | add_to_cart  |           1
 2025-12-15 10:00:00+00   | page_view    |           4
 2025-12-15 10:00:00+00   | purchase     |           2
 2025-12-15 10:00:00+00   | signup       |           1
```

**Conversion funnel analysis:**

```sql
WITH funnel AS (
    SELECT
        COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN user_id END) AS viewers,
        COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN user_id END) AS added_to_cart,
        COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN user_id END) AS purchasers
    FROM analytics_events
    WHERE occurred_at >= '2025-12-15' AND occurred_at < '2025-12-16'
)
SELECT
    viewers,
    added_to_cart,
    purchasers,
    ROUND(100.0 * added_to_cart / NULLIF(viewers, 0), 1) AS view_to_cart_pct,
    ROUND(100.0 * purchasers / NULLIF(added_to_cart, 0), 1) AS cart_to_purchase_pct
FROM funnel;
```

**Expected output:**

```
 viewers | added_to_cart | purchasers | view_to_cart_pct | cart_to_purchase_pct
---------+---------------+------------+------------------+---------------------
       3 |             1 |          2 |             33.3 |                200.0
```

**Revenue trend with 7-day moving average:**

```sql
SELECT
    date,
    revenue,
    orders,
    ROUND(AVG(revenue) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ), 2) AS revenue_7d_avg,
    ROUND(AVG(orders) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ), 0) AS orders_7d_avg
FROM daily_revenue
ORDER BY date;
```

**Expected output:**

```
 date       | revenue   | orders | revenue_7d_avg | orders_7d_avg
------------+-----------+--------+----------------+--------------
 2025-12-01 | 12450.00  |     85 |      12450.00  |           85
 2025-12-02 | 14200.50  |    102 |      13325.25  |           94
 2025-12-03 | 11890.25  |     78 |      12846.92  |           88
 2025-12-04 | 15600.00  |    112 |      13535.19  |           94
 2025-12-05 | 13100.75  |     91 |      13448.30  |           94
 2025-12-06 |  9800.00  |     65 |      12840.25  |           89
 2025-12-07 |  8200.50  |     58 |      12177.43  |           84
 2025-12-08 | 13900.25  |     95 |      12384.61  |           86
 2025-12-09 | 16200.00  |    118 |      12670.25  |           88
 2025-12-10 | 14800.50  |    105 |      13086.00  |           92
```

**Device and country breakdown:**

```sql
SELECT
    device_type,
    country,
    COUNT(*) AS events,
    COUNT(DISTINCT user_id) AS unique_users,
    COUNT(DISTINCT session_id) AS sessions
FROM analytics_events
WHERE occurred_at >= '2025-12-15' AND occurred_at < '2025-12-16'
GROUP BY device_type, country
ORDER BY events DESC;
```

**Expected output:**

```
 device_type | country | events | unique_users | sessions
-------------+---------+--------+--------------+---------
 desktop     | US      |      4 |            2 |        2
 mobile      | GB      |      2 |            1 |        1
 tablet      | DE      |      2 |            1 |        1
```

---

## 3. AI/ML RAG Pipeline (Vector Search)

A retrieval-augmented generation (RAG) system that stores document embeddings alongside metadata and performs semantic search to provide context for LLM responses.

### Description

RAG applications need to store text chunks with their vector embeddings, perform fast approximate nearest-neighbor (ANN) searches, and return the most relevant passages along with metadata. ThunderDB's native vector support eliminates the need for a separate vector database.

### Schema

```sql
-- Knowledge base documents
CREATE TABLE kb_documents (
    id          BIGINT PRIMARY KEY,
    title       VARCHAR(500) NOT NULL,
    source_url  VARCHAR(1000),
    doc_type    VARCHAR(50),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Document chunks with embeddings
CREATE TABLE kb_chunks (
    id          BIGINT PRIMARY KEY,
    doc_id      BIGINT NOT NULL REFERENCES kb_documents(id),
    chunk_index INT32 NOT NULL,
    content     TEXT NOT NULL,
    token_count INT32,
    embedding   VECTOR(1536),
    metadata    JSONB
);

-- HNSW index for fast ANN search
CREATE INDEX idx_chunks_embedding ON kb_chunks
    USING HNSW (embedding)
    WITH (m = 16, ef_construction = 200, distance_metric = 'cosine');

CREATE INDEX idx_chunks_doc ON kb_chunks (doc_id);

-- Chat history for context
CREATE TABLE chat_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
    id         BIGINT PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id),
    role       VARCHAR(20) NOT NULL,
    content    TEXT NOT NULL,
    sources    JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Sample Data

```sql
-- Documents
INSERT INTO kb_documents (id, title, source_url, doc_type) VALUES
    (1, 'ThunderDB Architecture Overview', 'https://docs.thunderdb.io/architecture', 'documentation'),
    (2, 'Raft Consensus Protocol Explained', 'https://docs.thunderdb.io/architecture/raft', 'documentation'),
    (3, 'ThunderDB Query Optimization Guide', 'https://docs.thunderdb.io/developer/optimization', 'guide');

-- Chunks (embeddings truncated for readability -- actual embeddings are 1536-dim)
INSERT INTO kb_chunks (id, doc_id, chunk_index, content, token_count, embedding, metadata) VALUES
    (1, 1, 0,
     'ThunderDB uses a hybrid storage architecture with both row-oriented and columnar engines. The row engine is optimized for OLTP point lookups while the columnar engine excels at analytical scans.',
     38, '[0.021, -0.034, 0.089, ...]'::VECTOR(1536),
     '{"section": "storage", "heading": "Hybrid Storage"}'),
    (2, 1, 1,
     'Data is automatically sharded across cluster nodes using consistent hashing. Each shard is replicated to three nodes for fault tolerance.',
     28, '[0.015, -0.067, 0.043, ...]'::VECTOR(1536),
     '{"section": "sharding", "heading": "Data Distribution"}'),
    (3, 2, 0,
     'ThunderDB uses the Raft consensus protocol for leader election and log replication. Each Raft group manages a set of shards and ensures strong consistency.',
     32, '[-0.012, 0.045, 0.078, ...]'::VECTOR(1536),
     '{"section": "consensus", "heading": "Raft Overview"}'),
    (4, 2, 1,
     'When a leader fails, Raft triggers an election. Followers with the most up-to-date log are preferred. Election completes within 150-300ms in typical deployments.',
     34, '[-0.008, 0.052, 0.061, ...]'::VECTOR(1536),
     '{"section": "consensus", "heading": "Leader Election"}'),
    (5, 3, 0,
     'Use EXPLAIN ANALYZE to profile query execution. The output shows physical operators, estimated vs actual row counts, and time spent in each stage.',
     28, '[0.033, -0.019, 0.071, ...]'::VECTOR(1536),
     '{"section": "optimization", "heading": "Query Profiling"}');
```

### Queries

**Semantic search -- find relevant chunks for a user question:**

```sql
-- User question: "How does ThunderDB handle node failures?"
-- First, generate the embedding for the question using your embedding model,
-- then search:

SET hnsw.ef_search = 128;

SELECT
    c.id AS chunk_id,
    d.title AS document,
    c.content,
    c.metadata->>'heading' AS section,
    1 - (c.embedding <=> $1) AS similarity
FROM kb_chunks c
JOIN kb_documents d ON c.doc_id = d.id
ORDER BY c.embedding <=> $1
LIMIT 5;
```

**Expected output** (similarity scores depend on actual embeddings):

```
 chunk_id | document                          | content                                                    | section          | similarity
----------+-----------------------------------+------------------------------------------------------------+------------------+-----------
        4 | Raft Consensus Protocol Explained | When a leader fails, Raft triggers an election...          | Leader Election  |     0.9234
        3 | Raft Consensus Protocol Explained | ThunderDB uses the Raft consensus protocol...              | Raft Overview    |     0.8876
        2 | ThunderDB Architecture Overview   | Data is automatically sharded across cluster nodes...      | Data Distribution|     0.8543
        1 | ThunderDB Architecture Overview   | ThunderDB uses a hybrid storage architecture...            | Hybrid Storage   |     0.7891
        5 | ThunderDB Query Optimization Guide| Use EXPLAIN ANALYZE to profile query execution...          | Query Profiling  |     0.5123
```

**Filtered semantic search (search only documentation):**

```sql
SELECT
    c.id AS chunk_id,
    c.content,
    1 - (c.embedding <=> $1) AS similarity
FROM kb_chunks c
JOIN kb_documents d ON c.doc_id = d.id
WHERE d.doc_type = 'documentation'
ORDER BY c.embedding <=> $1
LIMIT 3;
```

**Store chat history with sources:**

```sql
-- Create a session
INSERT INTO chat_sessions (id, user_id)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 1001);

-- Store user message
INSERT INTO chat_messages (id, session_id, role, content)
VALUES (1, '550e8400-e29b-41d4-a716-446655440000', 'user',
        'How does ThunderDB handle node failures?');

-- Store assistant response with source references
INSERT INTO chat_messages (id, session_id, role, content, sources)
VALUES (2, '550e8400-e29b-41d4-a716-446655440000', 'assistant',
        'ThunderDB handles node failures through the Raft consensus protocol. When a leader node fails, Raft automatically triggers a leader election among the remaining nodes. Followers with the most up-to-date log are preferred as candidates. In typical deployments, a new leader is elected within 150-300ms, minimizing downtime.',
        '[{"chunk_id": 4, "document": "Raft Consensus Protocol Explained", "similarity": 0.9234},
          {"chunk_id": 3, "document": "Raft Consensus Protocol Explained", "similarity": 0.8876}]');

-- Retrieve conversation history
SELECT role, content, sources
FROM chat_messages
WHERE session_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at;
```

**Expected output:**

```
 role      | content                                                              | sources
-----------+----------------------------------------------------------------------+----------------------------------------------------
 user      | How does ThunderDB handle node failures?                             | null
 assistant | ThunderDB handles node failures through the Raft consensus protocol. | [{"chunk_id": 4, "document": "Raft Consensus ...}]
           | When a leader node fails, Raft automatically triggers...             |
```

---

## 4. Multi-Database Federation (FDW)

Joining data from PostgreSQL, MySQL, and MongoDB in a single ThunderDB query without ETL pipelines.

### Description

Many organizations have data spread across multiple database systems. ThunderDB's foreign data wrappers let you query and join data from PostgreSQL, MySQL, MongoDB, and S3 as if it were local. ThunderDB pushes predicates down to remote systems to minimize data transfer.

### Schema

```sql
-- Connect to external PostgreSQL (user accounts)
CREATE SERVER pg_accounts
    TYPE 'postgresql'
    OPTIONS (
        host '10.0.1.50', port '5432',
        dbname 'accounts', user 'readonly', password 'secret'
    );

CREATE FOREIGN TABLE remote_users (
    id         BIGINT,
    name       VARCHAR(255),
    email      VARCHAR(255),
    plan       VARCHAR(20),
    created_at TIMESTAMPTZ
) SERVER pg_accounts
OPTIONS (schema 'public', table 'users');

-- Connect to external MySQL (legacy orders)
CREATE SERVER mysql_orders
    TYPE 'mysql'
    OPTIONS (
        host '10.0.2.50', port '3306',
        dbname 'legacy_shop', user 'reader', password 'secret'
    );

CREATE FOREIGN TABLE legacy_orders (
    order_id     INT32,
    customer_email VARCHAR(255),
    total        DECIMAL(10,2),
    status       VARCHAR(20),
    order_date   DATE
) SERVER mysql_orders
OPTIONS (table 'orders');

-- Connect to external MongoDB (activity logs)
CREATE SERVER mongo_activity
    TYPE 'mongodb'
    OPTIONS (
        connection_string 'mongodb://10.0.3.50:27017/activity',
        user 'reader', password 'secret'
    );

CREATE FOREIGN TABLE activity_logs (
    _id        VARCHAR(24),
    user_email VARCHAR(255),
    action     VARCHAR(50),
    details    JSONB,
    timestamp  TIMESTAMPTZ
) SERVER mongo_activity
OPTIONS (collection 'user_actions');

-- Local ThunderDB table (enrichment data)
CREATE TABLE user_segments (
    user_email VARCHAR(255) PRIMARY KEY,
    segment    VARCHAR(50) NOT NULL,
    score      FLOAT64 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Sample Data

The foreign tables reference data in their respective external systems. The local table has:

```sql
INSERT INTO user_segments (user_email, segment, score) VALUES
    ('alice@example.com', 'high_value', 95.2),
    ('bob@example.com', 'at_risk', 32.1),
    ('carol@example.com', 'growing', 67.8),
    ('dave@example.com', 'new', 15.5);
```

### Queries

**Cross-database customer 360 view:**

```sql
SELECT
    u.name,
    u.email,
    u.plan,
    s.segment,
    s.score AS engagement_score,
    COUNT(DISTINCT o.order_id) AS total_orders,
    COALESCE(SUM(o.total), 0) AS lifetime_value,
    COUNT(DISTINCT a._id) AS activity_count,
    MAX(a.timestamp) AS last_activity
FROM remote_users u
LEFT JOIN legacy_orders o ON u.email = o.customer_email
LEFT JOIN activity_logs a ON u.email = a.user_email
LEFT JOIN user_segments s ON u.email = s.user_email
GROUP BY u.name, u.email, u.plan, s.segment, s.score
ORDER BY lifetime_value DESC;
```

**Expected output:**

```
 name          | email              | plan     | segment    | engagement_score | total_orders | lifetime_value | activity_count | last_activity
---------------+--------------------+----------+------------+------------------+--------------+----------------+----------------+----------------------
 Alice Johnson | alice@example.com  | premium  | high_value |             95.2 |           12 |        2845.50 |             89 | 2025-12-15 09:45:00
 Carol White   | carol@example.com  | standard | growing    |             67.8 |            5 |         723.25 |             34 | 2025-12-14 18:22:00
 Bob Smith     | bob@example.com    | standard | at_risk    |             32.1 |            2 |         129.98 |              5 | 2025-11-20 11:10:00
 Dave Brown    | dave@example.com   | free     | new        |             15.5 |            0 |           0.00 |              2 | 2025-12-15 08:00:00
```

**Find at-risk users with declining activity:**

```sql
WITH user_monthly_activity AS (
    SELECT
        user_email,
        date_trunc('month', timestamp) AS month,
        COUNT(*) AS actions
    FROM activity_logs
    WHERE timestamp >= now() - INTERVAL '3 months'
    GROUP BY user_email, date_trunc('month', timestamp)
)
SELECT
    u.name,
    u.email,
    s.segment,
    s.score,
    curr.actions AS current_month_actions,
    prev.actions AS prev_month_actions,
    ROUND(100.0 * (curr.actions - prev.actions) / NULLIF(prev.actions, 0), 1) AS activity_change_pct
FROM remote_users u
JOIN user_segments s ON u.email = s.user_email
LEFT JOIN user_monthly_activity curr
    ON u.email = curr.user_email AND curr.month = date_trunc('month', now())
LEFT JOIN user_monthly_activity prev
    ON u.email = prev.user_email AND prev.month = date_trunc('month', now() - INTERVAL '1 month')
WHERE s.segment = 'at_risk'
   OR (curr.actions < prev.actions * 0.5)
ORDER BY s.score ASC;
```

---

## 5. Real-Time Sync (CDC)

Streaming changes from a production PostgreSQL database into ThunderDB for real-time analytics, search, and enrichment.

### Description

Change Data Capture (CDC) lets you subscribe to row-level changes on ThunderDB tables and consume them as a structured event stream. This example shows how to set up a pipeline that mirrors production data changes into an analytics-optimized representation and triggers downstream actions.

### Schema

```sql
-- Source table (receives real-time changes)
CREATE TABLE orders (
    id          BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    product_id  BIGINT NOT NULL,
    quantity    INT32 NOT NULL,
    total       DECIMAL(10,2) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Analytics target (columnar for fast aggregation)
CREATE TABLE orders_analytics (
    order_id     BIGINT PRIMARY KEY,
    customer_id  BIGINT NOT NULL,
    product_id   BIGINT NOT NULL,
    quantity     INT32 NOT NULL,
    total        DECIMAL(10,2) NOT NULL,
    status       VARCHAR(20) NOT NULL,
    day          DATE NOT NULL,
    hour         INT32 NOT NULL,
    is_high_value BOOLEAN NOT NULL
) ENGINE = COLUMNAR;
```

### Setting Up CDC Subscriptions

**Via REST API -- subscribe to order changes:**

```bash
# Create a webhook subscription for order inserts and updates
curl -s http://localhost:8088/api/v1/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders_to_analytics",
    "table": "orders",
    "events": ["insert", "update"],
    "delivery": "webhook",
    "endpoint": "https://analytics-worker.internal/hooks/order-events",
    "include_old_values": true,
    "batch_size": 50,
    "batch_timeout_ms": 2000,
    "retry_policy": {
      "max_retries": 10,
      "backoff_ms": 500,
      "backoff_multiplier": 2.0
    }
  }' | jq .
```

**Via WebSocket -- consume events in real time:**

```bash
wscat -c ws://localhost:8088/ws/events
```

```json
{
  "type": "subscribe",
  "id": "orders_stream",
  "table": "orders",
  "events": ["insert", "update", "delete"],
  "filter": "total > 0"
}
```

### Simulating Changes

```sql
-- New orders arrive
INSERT INTO orders (id, customer_id, product_id, quantity, total, status) VALUES
    (2001, 101, 42, 2, 299.98, 'pending'),
    (2002, 102, 15, 1, 45.00, 'pending'),
    (2003, 103, 42, 5, 749.95, 'pending');

-- Order status updates
UPDATE orders SET status = 'confirmed', updated_at = now() WHERE id = 2001;
UPDATE orders SET status = 'shipped', updated_at = now() WHERE id = 2001;
UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = 2002;
```

### CDC Event Payloads

**Insert event received via WebSocket:**

```json
{
  "type": "event",
  "id": "orders_stream",
  "table": "orders",
  "operation": "insert",
  "row": {
    "id": 2001,
    "customer_id": 101,
    "product_id": 42,
    "quantity": 2,
    "total": 299.98,
    "status": "pending",
    "created_at": "2025-12-15T10:30:00Z",
    "updated_at": "2025-12-15T10:30:00Z"
  },
  "lsn": "0/2A000010",
  "timestamp": "2025-12-15T10:30:00.001Z"
}
```

**Update event with old values:**

```json
{
  "type": "event",
  "id": "orders_stream",
  "table": "orders",
  "operation": "update",
  "old_row": {
    "id": 2001,
    "status": "pending",
    "updated_at": "2025-12-15T10:30:00Z"
  },
  "new_row": {
    "id": 2001,
    "status": "confirmed",
    "updated_at": "2025-12-15T10:31:00Z"
  },
  "changed_columns": ["status", "updated_at"],
  "lsn": "0/2A000020",
  "timestamp": "2025-12-15T10:31:00.001Z"
}
```

### Analytics Query on Synced Data

```sql
-- Transform and insert into analytics table
INSERT INTO orders_analytics (order_id, customer_id, product_id, quantity, total, status, day, hour, is_high_value)
SELECT
    id, customer_id, product_id, quantity, total, status,
    created_at::DATE AS day,
    EXTRACT(HOUR FROM created_at)::INT32 AS hour,
    total > 200.00 AS is_high_value
FROM orders;

-- Real-time dashboard query
SELECT
    day,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
    COUNT(*) FILTER (WHERE status = 'shipped') AS shipped,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
    SUM(total) AS total_revenue,
    SUM(total) FILTER (WHERE is_high_value) AS high_value_revenue
FROM orders_analytics
WHERE day = CURRENT_DATE
GROUP BY day;
```

**Expected output:**

```
 day        | total_orders | confirmed | shipped | cancelled | total_revenue | high_value_revenue
------------+--------------+-----------+---------+-----------+---------------+-------------------
 2025-12-15 |            3 |         1 |       1 |         1 |       1094.93 |            1049.93
```

---

## 6. Caching Layer (RESP Protocol)

Using ThunderDB as a Redis-compatible cache that also supports SQL queries over cached data.

### Description

ThunderDB's Redis protocol support lets you use it as a drop-in replacement for Redis in caching scenarios. The unique advantage is that data written via Redis commands can also be queried via SQL, enabling analytics over cached data and eliminating cache-database synchronization issues.

### Schema

ThunderDB automatically maps Redis data structures to internal tables. You can also create explicit tables and access them through both SQL and Redis protocols.

```sql
-- Explicit table for session data (accessible via both SQL and RESP)
CREATE TABLE sessions (
    key        VARCHAR(255) PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    user_name  VARCHAR(255),
    user_email VARCHAR(255),
    role       VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Cache table for frequently accessed products
CREATE TABLE product_cache (
    key        VARCHAR(255) PRIMARY KEY,
    name       VARCHAR(255),
    price      DECIMAL(10,2),
    stock      INT32,
    category   VARCHAR(100),
    cached_at  TIMESTAMPTZ DEFAULT now(),
    ttl        INT32
);
```

### Redis Operations

**Session management via Redis:**

```python
import redis
import json

r = redis.Redis(host='localhost', port=6379, password='secret', decode_responses=True)

# Store a session (expires in 1 hour)
session_data = {
    "user_id": 1001,
    "user_name": "Alice Johnson",
    "user_email": "alice@example.com",
    "role": "admin"
}
r.setex("session:abc123", 3600, json.dumps(session_data))
r.setex("session:def456", 3600, json.dumps({
    "user_id": 1002,
    "user_name": "Bob Smith",
    "user_email": "bob@example.com",
    "role": "viewer"
}))
r.setex("session:ghi789", 3600, json.dumps({
    "user_id": 1003,
    "user_name": "Carol White",
    "user_email": "carol@example.com",
    "role": "editor"
}))

# Read a session
session = json.loads(r.get("session:abc123"))
print(f"User: {session['user_name']} ({session['role']})")

# Product caching
products = {
    "product:101": {"name": "Wireless Mouse", "price": 29.99, "stock": 500, "category": "electronics"},
    "product:102": {"name": "Mechanical Keyboard", "price": 149.99, "stock": 200, "category": "electronics"},
    "product:103": {"name": "Python Cookbook", "price": 45.00, "stock": 1000, "category": "books"},
}

pipe = r.pipeline()
for key, data in products.items():
    pipe.hset(key, mapping=data)
    pipe.expire(key, 900)  # 15-minute cache TTL
pipe.execute()

# Rate limiting
user_key = "ratelimit:user:1001:api"
current = r.incr(user_key)
if current == 1:
    r.expire(user_key, 60)  # Reset counter every 60 seconds

if current > 100:
    print("Rate limited!")
else:
    print(f"Request {current}/100")

# Leaderboard
r.zadd("leaderboard:monthly", {"alice": 2500, "bob": 1800, "carol": 3200, "dave": 950})
top_3 = r.zrevrange("leaderboard:monthly", 0, 2, withscores=True)
for rank, (player, score) in enumerate(top_3, 1):
    print(f"#{rank} {player}: {score}")
```

### SQL Queries Over Cached Data

The unique power of ThunderDB: query data written via Redis using SQL.

```sql
-- Find all active sessions
SELECT key, user_name, role, created_at
FROM thunder_cache.string_keys
WHERE key LIKE 'session:%'
  AND expires_at > now()
ORDER BY created_at DESC;
```

**Expected output:**

```
 key             | user_name     | role   | created_at
-----------------+---------------+--------+-------------------------
 session:ghi789  | Carol White   | editor | 2025-12-15 10:30:02+00
 session:def456  | Bob Smith     | viewer | 2025-12-15 10:30:01+00
 session:abc123  | Alice Johnson | admin  | 2025-12-15 10:30:00+00
```

```sql
-- Analytics: sessions by role
SELECT
    json_extract(value, '$.role') AS role,
    COUNT(*) AS session_count
FROM thunder_cache.string_keys
WHERE key LIKE 'session:%' AND expires_at > now()
GROUP BY json_extract(value, '$.role');
```

**Expected output:**

```
 role   | session_count
--------+--------------
 admin  |            1
 editor |            1
 viewer |            1
```

```sql
-- Product cache analytics: total value by category
SELECT
    category,
    COUNT(*) AS product_count,
    SUM(price::DECIMAL) AS total_value,
    SUM(stock::INT32) AS total_stock
FROM thunder_cache.hash_keys
WHERE key LIKE 'product:%'
GROUP BY category;
```

**Expected output:**

```
 category    | product_count | total_value | total_stock
-------------+---------------+-------------+------------
 electronics |             2 |      179.98 |         700
 books       |             1 |       45.00 |        1000
```

```sql
-- Leaderboard query via SQL (sorted set data)
SELECT member, score
FROM thunder_cache.sorted_set_members
WHERE key = 'leaderboard:monthly'
ORDER BY score DESC
LIMIT 5;
```

**Expected output:**

```
 member | score
--------+------
 carol  |  3200
 alice  |  2500
 bob    |  1800
 dave   |   950
```

---

## 7. IoT Data Platform

A time-series ingestion and analysis platform for sensor data from industrial IoT devices with real-time alerting.

### Description

IoT platforms need to ingest high volumes of time-series data, run continuous aggregate queries for dashboards, and trigger alerts when sensor readings exceed thresholds. ThunderDB's columnar engine with BRIN indexes handles time-series data efficiently, and CDC subscriptions power the alerting system.

### Schema

```sql
-- Device registry
CREATE TABLE devices (
    device_id   VARCHAR(50) PRIMARY KEY,
    device_type VARCHAR(50) NOT NULL,
    location    VARCHAR(100) NOT NULL,
    zone        VARCHAR(50) NOT NULL,
    installed_at TIMESTAMPTZ NOT NULL,
    status      VARCHAR(20) DEFAULT 'active'
);

-- Sensor readings (columnar, time-series optimized)
CREATE TABLE sensor_readings (
    reading_id  BIGINT PRIMARY KEY,
    device_id   VARCHAR(50) NOT NULL,
    metric      VARCHAR(50) NOT NULL,
    value       FLOAT64 NOT NULL,
    unit        VARCHAR(20) NOT NULL,
    quality     VARCHAR(10) DEFAULT 'good',
    recorded_at TIMESTAMPTZ NOT NULL
) ENGINE = COLUMNAR;

-- BRIN index for time-range queries (very compact)
CREATE INDEX idx_readings_time ON sensor_readings USING BRIN (recorded_at)
    WITH (pages_per_range = 16);

CREATE INDEX idx_readings_device ON sensor_readings (device_id);
CREATE INDEX idx_readings_metric ON sensor_readings (metric);

-- Alert rules
CREATE TABLE alert_rules (
    id          BIGINT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    device_id   VARCHAR(50),
    metric      VARCHAR(50) NOT NULL,
    condition   VARCHAR(20) NOT NULL,
    threshold   FLOAT64 NOT NULL,
    severity    VARCHAR(20) NOT NULL,
    enabled     BOOLEAN DEFAULT true
);

-- Alert history
CREATE TABLE alert_history (
    id          BIGINT PRIMARY KEY,
    rule_id     BIGINT NOT NULL REFERENCES alert_rules(id),
    device_id   VARCHAR(50) NOT NULL,
    metric      VARCHAR(50) NOT NULL,
    value       FLOAT64 NOT NULL,
    threshold   FLOAT64 NOT NULL,
    severity    VARCHAR(20) NOT NULL,
    message     TEXT,
    triggered_at TIMESTAMPTZ DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);
```

### Sample Data

```sql
-- Devices
INSERT INTO devices (device_id, device_type, location, zone, installed_at) VALUES
    ('sensor-001', 'temperature', 'Building A, Floor 1', 'zone-north', '2025-01-15'),
    ('sensor-002', 'temperature', 'Building A, Floor 2', 'zone-north', '2025-01-15'),
    ('sensor-003', 'humidity', 'Building A, Floor 1', 'zone-north', '2025-01-15'),
    ('sensor-004', 'temperature', 'Building B, Floor 1', 'zone-south', '2025-03-01'),
    ('sensor-005', 'pressure', 'Building B, Floor 1', 'zone-south', '2025-03-01'),
    ('sensor-006', 'vibration', 'Building B, Machine Room', 'zone-south', '2025-06-01');

-- Sensor readings (simulated time-series data)
INSERT INTO sensor_readings (reading_id, device_id, metric, value, unit, quality, recorded_at) VALUES
    (1, 'sensor-001', 'temperature', 22.5, 'celsius', 'good', '2025-12-15 10:00:00+00'),
    (2, 'sensor-001', 'temperature', 22.7, 'celsius', 'good', '2025-12-15 10:01:00+00'),
    (3, 'sensor-001', 'temperature', 23.1, 'celsius', 'good', '2025-12-15 10:02:00+00'),
    (4, 'sensor-001', 'temperature', 28.5, 'celsius', 'good', '2025-12-15 10:03:00+00'),
    (5, 'sensor-001', 'temperature', 31.2, 'celsius', 'good', '2025-12-15 10:04:00+00'),
    (6, 'sensor-002', 'temperature', 21.0, 'celsius', 'good', '2025-12-15 10:00:00+00'),
    (7, 'sensor-002', 'temperature', 21.2, 'celsius', 'good', '2025-12-15 10:01:00+00'),
    (8, 'sensor-002', 'temperature', 21.1, 'celsius', 'good', '2025-12-15 10:02:00+00'),
    (9, 'sensor-003', 'humidity', 45.0, 'percent', 'good', '2025-12-15 10:00:00+00'),
    (10, 'sensor-003', 'humidity', 46.5, 'percent', 'good', '2025-12-15 10:01:00+00'),
    (11, 'sensor-003', 'humidity', 48.2, 'percent', 'good', '2025-12-15 10:02:00+00'),
    (12, 'sensor-004', 'temperature', 19.8, 'celsius', 'good', '2025-12-15 10:00:00+00'),
    (13, 'sensor-005', 'pressure', 1013.25, 'hpa', 'good', '2025-12-15 10:00:00+00'),
    (14, 'sensor-005', 'pressure', 1013.10, 'hpa', 'good', '2025-12-15 10:01:00+00'),
    (15, 'sensor-006', 'vibration', 0.5, 'mm/s', 'good', '2025-12-15 10:00:00+00'),
    (16, 'sensor-006', 'vibration', 2.8, 'mm/s', 'degraded', '2025-12-15 10:01:00+00'),
    (17, 'sensor-006', 'vibration', 5.2, 'mm/s', 'degraded', '2025-12-15 10:02:00+00');

-- Alert rules
INSERT INTO alert_rules (id, name, device_id, metric, condition, threshold, severity) VALUES
    (1, 'High temperature', NULL, 'temperature', 'greater_than', 30.0, 'warning'),
    (2, 'Critical temperature', NULL, 'temperature', 'greater_than', 40.0, 'critical'),
    (3, 'High vibration', 'sensor-006', 'vibration', 'greater_than', 3.0, 'warning'),
    (4, 'Low humidity', NULL, 'humidity', 'less_than', 30.0, 'info');
```

### Queries

**Real-time dashboard: latest reading per device:**

```sql
SELECT DISTINCT ON (device_id, metric)
    d.device_id,
    d.device_type,
    d.location,
    r.metric,
    r.value,
    r.unit,
    r.quality,
    r.recorded_at
FROM sensor_readings r
JOIN devices d ON r.device_id = d.device_id
WHERE d.status = 'active'
ORDER BY device_id, metric, recorded_at DESC;
```

**Expected output:**

```
 device_id   | device_type | location                  | metric      | value   | unit    | quality  | recorded_at
-------------+-------------+---------------------------+-------------+---------+---------+----------+-------------------------
 sensor-001  | temperature | Building A, Floor 1       | temperature |    31.2 | celsius | good     | 2025-12-15 10:04:00+00
 sensor-002  | temperature | Building A, Floor 2       | temperature |    21.1 | celsius | good     | 2025-12-15 10:02:00+00
 sensor-003  | humidity    | Building A, Floor 1       | humidity    |    48.2 | percent | good     | 2025-12-15 10:02:00+00
 sensor-004  | temperature | Building B, Floor 1       | temperature |    19.8 | celsius | good     | 2025-12-15 10:00:00+00
 sensor-005  | pressure    | Building B, Floor 1       | pressure    | 1013.10 | hpa     | good     | 2025-12-15 10:01:00+00
 sensor-006  | vibration   | Building B, Machine Room  | vibration   |     5.2 | mm/s    | degraded | 2025-12-15 10:02:00+00
```

**Time-series aggregation: 5-minute averages:**

```sql
SELECT
    device_id,
    metric,
    date_trunc('minute', recorded_at)
        - (EXTRACT(MINUTE FROM recorded_at)::INT32 % 5) * INTERVAL '1 minute' AS bucket,
    ROUND(AVG(value)::DECIMAL, 2) AS avg_value,
    ROUND(MIN(value)::DECIMAL, 2) AS min_value,
    ROUND(MAX(value)::DECIMAL, 2) AS max_value,
    COUNT(*) AS sample_count
FROM sensor_readings
WHERE device_id = 'sensor-001'
  AND recorded_at >= '2025-12-15 10:00:00'
  AND recorded_at < '2025-12-15 10:10:00'
GROUP BY device_id, metric, bucket
ORDER BY bucket;
```

**Expected output:**

```
 device_id  | metric      | bucket                   | avg_value | min_value | max_value | sample_count
------------+-------------+--------------------------+-----------+-----------+-----------+-------------
 sensor-001 | temperature | 2025-12-15 10:00:00+00   |     25.60 |     22.50 |     31.20 |            5
```

**Anomaly detection: readings that deviate significantly from recent average:**

```sql
WITH recent_stats AS (
    SELECT
        device_id,
        metric,
        AVG(value) AS avg_value,
        STDDEV(value) AS stddev_value
    FROM sensor_readings
    WHERE recorded_at >= now() - INTERVAL '1 hour'
    GROUP BY device_id, metric
)
SELECT
    r.device_id,
    d.location,
    r.metric,
    r.value,
    r.unit,
    ROUND((r.value - s.avg_value) / NULLIF(s.stddev_value, 0), 2) AS z_score,
    r.recorded_at
FROM sensor_readings r
JOIN recent_stats s ON r.device_id = s.device_id AND r.metric = s.metric
JOIN devices d ON r.device_id = d.device_id
WHERE ABS(r.value - s.avg_value) > 2 * s.stddev_value
  AND r.recorded_at >= now() - INTERVAL '10 minutes'
ORDER BY ABS((r.value - s.avg_value) / NULLIF(s.stddev_value, 0)) DESC;
```

**Expected output:**

```
 device_id  | location                 | metric      | value | unit  | z_score | recorded_at
------------+--------------------------+-------------+-------+-------+---------+-------------------------
 sensor-001 | Building A, Floor 1      | temperature | 31.20 | celsius |   2.35 | 2025-12-15 10:04:00+00
 sensor-006 | Building B, Machine Room | vibration   |  5.20 | mm/s    |   2.12 | 2025-12-15 10:02:00+00
```

**Trigger alerts for threshold violations:**

```sql
-- Find readings that violate alert rules
INSERT INTO alert_history (id, rule_id, device_id, metric, value, threshold, severity, message)
SELECT
    nextval('alert_history_id_seq'),
    ar.id,
    r.device_id,
    r.metric,
    r.value,
    ar.threshold,
    ar.severity,
    CONCAT(
        ar.name, ': ', r.device_id,
        ' reading ', r.value, ' ', r.unit,
        ' exceeds threshold ', ar.threshold
    )
FROM sensor_readings r
JOIN alert_rules ar ON r.metric = ar.metric
    AND (ar.device_id IS NULL OR ar.device_id = r.device_id)
    AND ar.enabled = true
WHERE r.recorded_at >= now() - INTERVAL '5 minutes'
  AND (
    (ar.condition = 'greater_than' AND r.value > ar.threshold)
    OR (ar.condition = 'less_than' AND r.value < ar.threshold)
  );

-- View recent alerts
SELECT
    ah.severity,
    ah.device_id,
    d.location,
    ah.metric,
    ah.value,
    ah.threshold,
    ah.message,
    ah.triggered_at
FROM alert_history ah
JOIN devices d ON ah.device_id = d.device_id
WHERE ah.triggered_at >= now() - INTERVAL '1 hour'
  AND ah.resolved_at IS NULL
ORDER BY
    CASE ah.severity
        WHEN 'critical' THEN 1
        WHEN 'warning' THEN 2
        WHEN 'info' THEN 3
    END,
    ah.triggered_at DESC;
```

**Expected output:**

```
 severity | device_id  | location                 | metric      | value | threshold | message                                                          | triggered_at
----------+------------+--------------------------+-------------+-------+-----------+------------------------------------------------------------------+-------------------------
 warning  | sensor-001 | Building A, Floor 1      | temperature | 31.20 |      30.0 | High temperature: sensor-001 reading 31.2 celsius exceeds 30.0   | 2025-12-15 10:04:00+00
 warning  | sensor-006 | Building B, Machine Room | vibration   |  5.20 |       3.0 | High vibration: sensor-006 reading 5.2 mm/s exceeds threshold 3.0| 2025-12-15 10:02:00+00
```

**Set up CDC for real-time alerting:**

```bash
# Subscribe to sensor_readings for real-time alert evaluation
curl -s http://localhost:8088/api/v1/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sensor_alert_pipeline",
    "table": "sensor_readings",
    "events": ["insert"],
    "delivery": "webhook",
    "endpoint": "https://alerting.internal/hooks/evaluate",
    "filter": "quality != '\''bad'\''",
    "batch_size": 10,
    "batch_timeout_ms": 1000
  }' | jq .
```

**Zone-level summary for facility management:**

```sql
SELECT
    d.zone,
    d.device_type,
    COUNT(DISTINCT d.device_id) AS device_count,
    ROUND(AVG(r.value)::DECIMAL, 2) AS avg_reading,
    ROUND(MIN(r.value)::DECIMAL, 2) AS min_reading,
    ROUND(MAX(r.value)::DECIMAL, 2) AS max_reading,
    COUNT(*) AS total_readings,
    COUNT(*) FILTER (WHERE r.quality = 'degraded') AS degraded_readings
FROM devices d
JOIN sensor_readings r ON d.device_id = r.device_id
WHERE r.recorded_at >= now() - INTERVAL '1 hour'
GROUP BY d.zone, d.device_type
ORDER BY d.zone, d.device_type;
```

**Expected output:**

```
 zone       | device_type | device_count | avg_reading | min_reading | max_reading | total_readings | degraded_readings
------------+-------------+--------------+-------------+-------------+-------------+----------------+------------------
 zone-north | humidity    |            1 |       46.57 |       45.00 |       48.20 |              3 |                 0
 zone-north | temperature |            2 |       23.64 |       21.00 |       31.20 |              8 |                 0
 zone-south | pressure    |            1 |     1013.18 |     1013.10 |     1013.25 |              2 |                 0
 zone-south | temperature |            1 |       19.80 |       19.80 |       19.80 |              1 |                 0
 zone-south | vibration   |            1 |        2.83 |        0.50 |        5.20 |              3 |                 2
```
