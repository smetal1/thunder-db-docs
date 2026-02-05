---
title: "SQL Reference"
weight: 2
description: "Complete SQL language reference for ThunderDB covering DDL, DML, transactions, vector operations, foreign data wrappers, and built-in functions."
---

# SQL Reference

ThunderDB implements a rich SQL dialect that is largely compatible with PostgreSQL. This reference documents every statement, data type, operator, and function available in ThunderDB.

---

## Data Types

ThunderDB supports the following data types:

### Numeric Types

| Type | Size | Range | Description |
|---|---|---|---|
| `BOOLEAN` | 1 byte | `true` / `false` | Logical boolean |
| `INT8` (alias `TINYINT`) | 1 byte | -128 to 127 | 8-bit signed integer |
| `INT16` (alias `SMALLINT`) | 2 bytes | -32,768 to 32,767 | 16-bit signed integer |
| `INT32` (alias `INT`, `INTEGER`) | 4 bytes | -2^31 to 2^31-1 | 32-bit signed integer |
| `INT64` (alias `BIGINT`) | 8 bytes | -2^63 to 2^63-1 | 64-bit signed integer |
| `FLOAT32` (alias `REAL`, `FLOAT`) | 4 bytes | IEEE 754 single | 32-bit floating point |
| `FLOAT64` (alias `DOUBLE PRECISION`, `DOUBLE`) | 8 bytes | IEEE 754 double | 64-bit floating point |
| `DECIMAL(p, s)` (alias `NUMERIC`) | variable | Up to 38 digits | Exact decimal with precision `p` and scale `s` |

### String Types

| Type | Max Size | Description |
|---|---|---|
| `STRING` (alias `TEXT`) | 2 GB | Variable-length unlimited string |
| `CHAR(n)` | `n` bytes | Fixed-length string, blank-padded |
| `VARCHAR(n)` | `n` bytes | Variable-length string with max length |

### Binary Types

| Type | Max Size | Description |
|---|---|---|
| `BINARY` (alias `BYTEA`) | 2 GB | Variable-length binary data |

### Date & Time Types

| Type | Size | Description |
|---|---|---|
| `DATE` | 4 bytes | Calendar date (year, month, day) |
| `TIME` | 8 bytes | Time of day without timezone |
| `TIMESTAMP` | 8 bytes | Date and time without timezone |
| `TIMESTAMPTZ` (alias `TIMESTAMP WITH TIME ZONE`) | 8 bytes | Date and time with timezone |
| `INTERVAL` | 16 bytes | Time duration |

### Other Types

| Type | Size | Description |
|---|---|---|
| `UUID` | 16 bytes | Universally unique identifier |
| `JSON` | variable | JSON data stored as text |
| `JSONB` | variable | JSON data stored in decomposed binary format (indexable) |
| `ARRAY` | variable | One-dimensional array of any scalar type |
| `VECTOR(dim)` | `dim * 4` bytes | Fixed-dimension vector of `FLOAT32` elements |

### Type Casting

ThunderDB supports explicit casting with `CAST()` and the `::` operator:

```sql
SELECT CAST('2025-01-15' AS DATE);
SELECT '42'::INT64;
SELECT '[1.0, 2.0, 3.0]'::VECTOR(3);
```

---

## DDL (Data Definition Language)

### CREATE TABLE

Create a new table with specified columns, constraints, and storage engine.

**Syntax:**

```sql
CREATE TABLE [IF NOT EXISTS] [schema.]table_name (
    column_name data_type [NOT NULL] [DEFAULT expr] [PRIMARY KEY],
    ...
    [CONSTRAINT name PRIMARY KEY (col1, col2, ...)],
    [CONSTRAINT name UNIQUE (col1, col2, ...)],
    [CONSTRAINT name FOREIGN KEY (col) REFERENCES other_table(col)
        [ON DELETE CASCADE|SET NULL|RESTRICT]
        [ON UPDATE CASCADE|SET NULL|RESTRICT]],
    [CONSTRAINT name CHECK (expression)]
)
[ENGINE = ROW | COLUMNAR]
[PARTITION BY RANGE|HASH|LIST (column)]
[WITH (option = value, ...)];
```

**Storage Engines:**

| Engine | Best For | Description |
|---|---|---|
| `ROW` (default) | OLTP, transactional | Row-oriented storage, optimized for point lookups and writes |
| `COLUMNAR` | OLAP, analytics | Column-oriented storage, optimized for scans and aggregations |

**Examples:**

```sql
-- Basic table
CREATE TABLE users (
    id        BIGINT PRIMARY KEY,
    name      VARCHAR(255) NOT NULL,
    email     VARCHAR(255) NOT NULL UNIQUE,
    active    BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table with composite primary key
CREATE TABLE order_items (
    order_id   BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity   INT32 NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Columnar table for analytics
CREATE TABLE analytics_events (
    event_id    BIGINT PRIMARY KEY,
    user_id     BIGINT,
    event_type  VARCHAR(50) NOT NULL,
    properties  JSONB,
    occurred_at TIMESTAMPTZ NOT NULL
) ENGINE = COLUMNAR;

-- Partitioned table
CREATE TABLE logs (
    id         BIGINT PRIMARY KEY,
    level      VARCHAR(10),
    message    TEXT,
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- Table with vector column
CREATE TABLE documents (
    id        BIGINT PRIMARY KEY,
    title     VARCHAR(500),
    body      TEXT,
    embedding VECTOR(1536),
    metadata  JSONB
);

-- Table with array columns
CREATE TABLE tags (
    id     BIGINT PRIMARY KEY,
    name   VARCHAR(100),
    labels ARRAY<VARCHAR(50)>
);

-- Conditional creation
CREATE TABLE IF NOT EXISTS sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    token      VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
```

### DROP TABLE

Remove a table and its data.

**Syntax:**

```sql
DROP TABLE [IF EXISTS] [schema.]table_name [CASCADE | RESTRICT];
```

**Examples:**

```sql
-- Drop a table (error if it does not exist)
DROP TABLE sessions;

-- Drop only if it exists
DROP TABLE IF EXISTS sessions;

-- Drop and cascade to dependent objects (indexes, foreign keys)
DROP TABLE users CASCADE;
```

### ALTER TABLE

Modify an existing table structure.

**Syntax:**

```sql
ALTER TABLE [schema.]table_name
    ADD COLUMN column_name data_type [constraints]
    | DROP COLUMN column_name [CASCADE]
    | ALTER COLUMN column_name SET DATA TYPE data_type
    | ALTER COLUMN column_name SET DEFAULT expr
    | ALTER COLUMN column_name DROP DEFAULT
    | ALTER COLUMN column_name SET NOT NULL
    | ALTER COLUMN column_name DROP NOT NULL
    | ADD CONSTRAINT constraint_def
    | DROP CONSTRAINT constraint_name
    | RENAME TO new_table_name
    | RENAME COLUMN old_name TO new_name;
```

**Examples:**

```sql
-- Add a column
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Drop a column
ALTER TABLE users DROP COLUMN phone;

-- Change column type
ALTER TABLE users ALTER COLUMN name SET DATA TYPE VARCHAR(500);

-- Add a check constraint
ALTER TABLE orders ADD CONSTRAINT positive_total CHECK (total >= 0);

-- Rename a table
ALTER TABLE users RENAME TO customers;

-- Rename a column
ALTER TABLE orders RENAME COLUMN total TO order_total;
```

### CREATE INDEX

Create an index on one or more columns for faster lookups.

**Syntax:**

```sql
CREATE [UNIQUE] INDEX [IF NOT EXISTS] index_name
    ON [schema.]table_name
    USING method (column_name [ASC|DESC] [NULLS FIRST|LAST], ...)
    [WITH (option = value, ...)]
    [WHERE predicate];
```

**Supported Index Methods:**

| Method | Use Case | Description |
|---|---|---|
| `BTREE` (default) | Equality, range, ordering | Balanced tree, supports `<`, `<=`, `=`, `>=`, `>` |
| `HASH` | Equality only | Hash table, supports only `=` |
| `HNSW` | Vector ANN search | Hierarchical navigable small world graph |
| `IVF_PQ` | Large-scale vector search | Inverted file with product quantization |
| `GIN` | Full-text, JSONB, arrays | Generalized inverted index |
| `BRIN` | Large ordered datasets | Block range index, very compact |

**Examples:**

```sql
-- B-tree index (default)
CREATE INDEX idx_orders_customer ON orders (customer_id);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Composite index
CREATE INDEX idx_orders_customer_date ON orders (customer_id, created_at DESC);

-- Partial index (conditional)
CREATE INDEX idx_orders_pending ON orders (created_at)
    WHERE status = 'pending';

-- HNSW vector index
CREATE INDEX idx_docs_embedding ON documents
    USING HNSW (embedding)
    WITH (m = 16, ef_construction = 200, distance_metric = 'cosine');

-- IVF-PQ vector index for large datasets
CREATE INDEX idx_docs_embedding_ivf ON documents
    USING IVF_PQ (embedding)
    WITH (nlist = 1024, m_pq = 64, distance_metric = 'l2');

-- GIN index for JSONB
CREATE INDEX idx_events_properties ON analytics_events USING GIN (properties);

-- GIN index for full-text search
CREATE INDEX idx_docs_body_fts ON documents USING GIN (to_tsvector('english', body));

-- BRIN index for time-series data
CREATE INDEX idx_logs_created ON logs USING BRIN (created_at)
    WITH (pages_per_range = 32);
```

### DROP INDEX

Remove an index.

**Syntax:**

```sql
DROP INDEX [IF EXISTS] index_name [CASCADE | RESTRICT];
```

**Examples:**

```sql
DROP INDEX idx_orders_customer;
DROP INDEX IF EXISTS idx_docs_embedding;
```

---

## DML (Data Manipulation Language)

### INSERT

Insert one or more rows into a table.

**Syntax:**

```sql
INSERT INTO [schema.]table_name [(column1, column2, ...)]
    VALUES (value1, value2, ...) [, (value1, value2, ...), ...]
    [ON CONFLICT (column) DO NOTHING | DO UPDATE SET col = expr, ...]
    [RETURNING column1, column2, ...];
```

**Examples:**

```sql
-- Insert a single row
INSERT INTO users (id, name, email)
VALUES (1, 'Alice Johnson', 'alice@example.com');

-- Insert multiple rows
INSERT INTO users (id, name, email) VALUES
    (2, 'Bob Smith', 'bob@example.com'),
    (3, 'Carol White', 'carol@example.com'),
    (4, 'Dave Brown', 'dave@example.com');

-- Insert with default values
INSERT INTO users (id, name, email)
VALUES (5, 'Eve Green', 'eve@example.com');
-- active defaults to true, created_at defaults to now()

-- Upsert (insert or update on conflict)
INSERT INTO users (id, name, email)
VALUES (1, 'Alice J. Updated', 'alice@example.com')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Insert and return the inserted row
INSERT INTO orders (customer_id, product_id, quantity, total)
VALUES (1, 42, 3, 149.97)
RETURNING id, created_at;

-- Insert from a SELECT
INSERT INTO order_archive (id, customer_id, total, created_at)
SELECT id, customer_id, total, created_at
FROM orders
WHERE created_at < '2025-01-01';

-- Insert a vector
INSERT INTO documents (id, title, embedding)
VALUES (1, 'Quantum Computing', '[0.1, -0.23, 0.98, ...]'::VECTOR(1536));
```

### UPDATE

Modify existing rows in a table.

**Syntax:**

```sql
UPDATE [schema.]table_name
SET column1 = expr1, column2 = expr2, ...
[FROM other_table]
[WHERE condition]
[RETURNING column1, column2, ...];
```

**Examples:**

```sql
-- Update a single row
UPDATE users SET name = 'Alice Johnson-Smith' WHERE id = 1;

-- Update multiple columns
UPDATE orders
SET status = 'shipped', shipped_at = now()
WHERE id = 5012;

-- Update with expression
UPDATE products
SET price = price * 1.10
WHERE category = 'electronics';

-- Update with subquery
UPDATE orders
SET status = 'vip'
WHERE customer_id IN (
    SELECT id FROM users WHERE membership = 'gold'
);

-- Update with FROM clause (join-based update)
UPDATE order_items oi
SET unit_price = p.price
FROM products p
WHERE oi.product_id = p.id
  AND p.price_updated_at > oi.created_at;

-- Update and return modified rows
UPDATE users
SET active = false
WHERE last_login < now() - INTERVAL '90 days'
RETURNING id, name, email;
```

### DELETE

Remove rows from a table.

**Syntax:**

```sql
DELETE FROM [schema.]table_name
[USING other_table]
[WHERE condition]
[RETURNING column1, column2, ...];
```

**Examples:**

```sql
-- Delete a single row
DELETE FROM users WHERE id = 42;

-- Delete with condition
DELETE FROM sessions WHERE expires_at < now();

-- Delete with subquery
DELETE FROM orders
WHERE customer_id IN (
    SELECT id FROM users WHERE active = false
);

-- Delete with USING (join-based delete)
DELETE FROM order_items oi
USING orders o
WHERE oi.order_id = o.id AND o.status = 'cancelled';

-- Delete all rows (truncate-like)
DELETE FROM temp_imports;

-- Delete and return removed rows
DELETE FROM users
WHERE active = false
RETURNING id, name, email;
```

### SELECT

Query data from one or more tables.

**Syntax:**

```sql
SELECT [DISTINCT] column_expr [AS alias], ...
FROM [schema.]table_name [AS alias]
    [JOIN type join_table ON condition]
    [WHERE condition]
    [GROUP BY column_or_expr, ...]
    [HAVING condition]
    [ORDER BY column_or_expr [ASC|DESC] [NULLS FIRST|LAST], ...]
    [LIMIT count]
    [OFFSET count];
```

#### Basic Queries

```sql
-- Select all columns
SELECT * FROM users;

-- Select specific columns
SELECT name, email FROM users;

-- Select with alias
SELECT
    name AS customer_name,
    email AS customer_email
FROM users;

-- Select with expression
SELECT
    name,
    price,
    price * 0.9 AS discounted_price
FROM products;

-- Distinct values
SELECT DISTINCT category FROM products;

-- Count rows
SELECT COUNT(*) FROM orders;
```

#### WHERE Clause

```sql
-- Comparison operators
SELECT * FROM products WHERE price > 100;
SELECT * FROM products WHERE price BETWEEN 50 AND 200;
SELECT * FROM users WHERE name LIKE 'A%';
SELECT * FROM users WHERE name ILIKE '%smith%';  -- case-insensitive
SELECT * FROM users WHERE email IS NOT NULL;

-- Logical operators
SELECT * FROM products
WHERE category = 'electronics' AND price < 500;

SELECT * FROM products
WHERE category = 'electronics' OR category = 'books';

-- IN operator
SELECT * FROM orders WHERE status IN ('pending', 'processing', 'shipped');

-- NOT operator
SELECT * FROM orders WHERE status NOT IN ('cancelled', 'refunded');

-- EXISTS subquery
SELECT * FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.customer_id = u.id
);

-- ANY / ALL
SELECT * FROM products
WHERE price > ALL (SELECT price FROM products WHERE category = 'books');

-- JSONB operators
SELECT * FROM analytics_events
WHERE properties->>'source' = 'mobile';

SELECT * FROM analytics_events
WHERE properties @> '{"os": "ios"}'::JSONB;
```

#### JOIN Types

```sql
-- INNER JOIN
SELECT u.name, o.id AS order_id, o.total
FROM users u
INNER JOIN orders o ON u.id = o.customer_id;

-- LEFT JOIN
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.customer_id
GROUP BY u.name;

-- RIGHT JOIN
SELECT u.name, o.id AS order_id
FROM orders o
RIGHT JOIN users u ON u.id = o.customer_id;

-- FULL OUTER JOIN
SELECT u.name, o.id AS order_id
FROM users u
FULL OUTER JOIN orders o ON u.id = o.customer_id;

-- CROSS JOIN
SELECT u.name, p.name AS product_name
FROM users u
CROSS JOIN products p;

-- Self-join
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- Multiple joins
SELECT
    u.name AS customer,
    p.name AS product,
    oi.quantity,
    oi.unit_price
FROM orders o
JOIN users u ON o.customer_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
WHERE o.status = 'shipped';
```

#### GROUP BY and HAVING

```sql
-- Basic aggregation
SELECT category, COUNT(*) AS product_count, AVG(price) AS avg_price
FROM products
GROUP BY category;

-- Group by with HAVING
SELECT customer_id, SUM(total) AS lifetime_value
FROM orders
GROUP BY customer_id
HAVING SUM(total) > 10000
ORDER BY lifetime_value DESC;

-- Group by with expressions
SELECT
    date_trunc('month', created_at) AS month,
    COUNT(*) AS order_count,
    SUM(total) AS revenue
FROM orders
WHERE created_at >= '2025-01-01'
GROUP BY date_trunc('month', created_at)
ORDER BY month;

-- Multiple aggregations
SELECT
    category,
    COUNT(*) AS count,
    MIN(price) AS min_price,
    MAX(price) AS max_price,
    AVG(price) AS avg_price,
    SUM(price) AS total_value
FROM products
GROUP BY category
ORDER BY total_value DESC;
```

#### ORDER BY, LIMIT, and OFFSET

```sql
-- Order ascending (default)
SELECT * FROM products ORDER BY price;

-- Order descending
SELECT * FROM products ORDER BY price DESC;

-- Multiple order columns
SELECT * FROM products ORDER BY category ASC, price DESC;

-- Null handling
SELECT * FROM products ORDER BY discount NULLS LAST;

-- Pagination
SELECT * FROM products
ORDER BY id
LIMIT 20 OFFSET 40;  -- Page 3, 20 items per page

-- Top-N query
SELECT * FROM orders
ORDER BY total DESC
LIMIT 10;
```

#### Subqueries and CTEs

```sql
-- Scalar subquery
SELECT name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS order_count
FROM users u;

-- Derived table (subquery in FROM)
SELECT top_customers.name, top_customers.total_spent
FROM (
    SELECT u.name, SUM(o.total) AS total_spent
    FROM users u
    JOIN orders o ON u.id = o.customer_id
    GROUP BY u.name
    ORDER BY total_spent DESC
    LIMIT 100
) AS top_customers;

-- Common Table Expression (CTE)
WITH monthly_revenue AS (
    SELECT
        date_trunc('month', created_at) AS month,
        SUM(total) AS revenue
    FROM orders
    GROUP BY 1
)
SELECT
    month,
    revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue,
    revenue - LAG(revenue) OVER (ORDER BY month) AS revenue_change
FROM monthly_revenue
ORDER BY month;

-- Recursive CTE (hierarchical data)
WITH RECURSIVE org_tree AS (
    -- Base case: top-level managers
    SELECT id, name, manager_id, 0 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive step
    SELECT e.id, e.name, e.manager_id, t.depth + 1
    FROM employees e
    JOIN org_tree t ON e.manager_id = t.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

#### Window Functions

```sql
-- Row number
SELECT
    name,
    category,
    price,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) AS rank
FROM products;

-- Running total
SELECT
    id,
    created_at,
    total,
    SUM(total) OVER (ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS running_total
FROM orders;

-- Moving average
SELECT
    date,
    revenue,
    AVG(revenue) OVER (
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS seven_day_avg
FROM daily_revenue;

-- Rank and Dense Rank
SELECT
    name,
    category,
    price,
    RANK() OVER (PARTITION BY category ORDER BY price DESC) AS rank,
    DENSE_RANK() OVER (PARTITION BY category ORDER BY price DESC) AS dense_rank
FROM products;

-- Lead and Lag
SELECT
    month,
    revenue,
    LAG(revenue, 1) OVER (ORDER BY month) AS prev_month,
    LEAD(revenue, 1) OVER (ORDER BY month) AS next_month
FROM monthly_revenue;

-- NTILE (buckets)
SELECT
    name,
    price,
    NTILE(4) OVER (ORDER BY price) AS price_quartile
FROM products;

-- First/Last value
SELECT DISTINCT
    category,
    FIRST_VALUE(name) OVER (PARTITION BY category ORDER BY price ASC) AS cheapest,
    FIRST_VALUE(name) OVER (PARTITION BY category ORDER BY price DESC) AS most_expensive
FROM products;
```

#### Set Operations

```sql
-- UNION (deduplicated)
SELECT name, email FROM users
UNION
SELECT name, email FROM archived_users;

-- UNION ALL (keep duplicates)
SELECT id, total FROM orders_2024
UNION ALL
SELECT id, total FROM orders_2025;

-- INTERSECT
SELECT customer_id FROM orders
INTERSECT
SELECT id FROM users WHERE active = true;

-- EXCEPT
SELECT id FROM users
EXCEPT
SELECT customer_id FROM orders;
```

---

## Transactions

ThunderDB supports full ACID transactions with multiple isolation levels.

### BEGIN

Start a new transaction.

```sql
BEGIN;
-- or
BEGIN TRANSACTION;
-- or with isolation level
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

### COMMIT

Commit the current transaction, making all changes permanent.

```sql
COMMIT;
-- or
COMMIT TRANSACTION;
```

### ROLLBACK

Roll back the current transaction, discarding all changes.

```sql
ROLLBACK;
-- or
ROLLBACK TRANSACTION;
```

### SAVEPOINT

Create a savepoint within a transaction for partial rollback.

```sql
-- Create a savepoint
SAVEPOINT my_savepoint;

-- Roll back to savepoint (undo changes since savepoint, but keep transaction open)
ROLLBACK TO SAVEPOINT my_savepoint;

-- Release a savepoint (no longer needed)
RELEASE SAVEPOINT my_savepoint;
```

### SET TRANSACTION ISOLATION LEVEL

Set the isolation level for the current transaction.

```sql
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

**Isolation Levels:**

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Write Skew |
|---|---|---|---|---|
| `READ COMMITTED` | No | Possible | Possible | Possible |
| `REPEATABLE READ` | No | No | Possible | Possible |
| `SERIALIZABLE` | No | No | No | No |

### Transaction Examples

```sql
-- Simple transaction
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
INSERT INTO transfers (from_id, to_id, amount) VALUES (1, 2, 100);
COMMIT;

-- Transaction with savepoint
BEGIN;
INSERT INTO orders (customer_id, total) VALUES (42, 299.99);
SAVEPOINT before_items;
INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 10, 2);
-- Oops, wrong product
ROLLBACK TO SAVEPOINT before_items;
INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 15, 2);
COMMIT;

-- Read-only transaction for consistent analytics
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION READ ONLY;
SELECT COUNT(*) FROM orders WHERE status = 'pending';
SELECT SUM(total) FROM orders WHERE status = 'pending';
-- Both queries see the same snapshot
COMMIT;

-- Serializable transaction for inventory check
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT quantity FROM inventory WHERE product_id = 42;
-- Application checks if quantity >= requested amount
UPDATE inventory SET quantity = quantity - 5 WHERE product_id = 42;
INSERT INTO orders (customer_id, product_id, quantity) VALUES (1, 42, 5);
COMMIT;
-- If another transaction modified inventory concurrently, this will
-- fail with a serialization error and should be retried
```

---

## Vector Operations

ThunderDB natively supports vector embeddings for similarity search, enabling AI/ML workloads alongside traditional SQL.

### Creating Tables with Vector Columns

```sql
-- 1536-dimensional vectors (OpenAI text-embedding-3-small)
CREATE TABLE documents (
    id        BIGINT PRIMARY KEY,
    title     VARCHAR(500),
    body      TEXT,
    embedding VECTOR(1536)
);

-- 768-dimensional vectors (sentence-transformers)
CREATE TABLE products (
    id          BIGINT PRIMARY KEY,
    name        VARCHAR(255),
    description TEXT,
    image_embed VECTOR(512),
    text_embed  VECTOR(768)
);
```

### Inserting Vectors

```sql
-- Insert with array literal
INSERT INTO documents (id, title, embedding)
VALUES (1, 'Hello World', '[0.1, -0.2, 0.3, ...]'::VECTOR(1536));

-- Insert from application (using bind parameter)
INSERT INTO documents (id, title, embedding)
VALUES ($1, $2, $3);
-- where $3 is a float array of length 1536
```

### Similarity Operators

| Operator | Distance Metric | Description |
|---|---|---|
| `<->` | L2 (Euclidean) | Euclidean distance between two vectors |
| `<=>` | Cosine | Cosine distance (1 - cosine similarity) |
| `<#>` | Inner Product | Negative inner product (for max inner product search) |

### Vector Search Queries

```sql
-- K-nearest neighbors with L2 distance
SELECT id, title, embedding <-> $1 AS distance
FROM documents
ORDER BY embedding <-> $1
LIMIT 10;

-- Cosine similarity search
SELECT id, title, 1 - (embedding <=> $1) AS similarity
FROM documents
ORDER BY embedding <=> $1
LIMIT 10;

-- Inner product search (for normalized vectors)
SELECT id, title, embedding <#> $1 AS score
FROM documents
ORDER BY embedding <#> $1
LIMIT 10;

-- Filtered vector search (hybrid search)
SELECT id, title, embedding <-> $1 AS distance
FROM documents
WHERE category = 'science' AND published = true
ORDER BY embedding <-> $1
LIMIT 10;

-- Vector search with metadata join
SELECT
    d.id,
    d.title,
    d.embedding <-> $1 AS distance,
    a.name AS author
FROM documents d
JOIN authors a ON d.author_id = a.id
WHERE d.embedding <-> $1 < 0.5
ORDER BY d.embedding <-> $1
LIMIT 20;
```

### Creating Vector Indexes

```sql
-- HNSW index (recommended for most use cases)
CREATE INDEX idx_docs_embed ON documents
    USING HNSW (embedding)
    WITH (
        m = 16,                    -- Max connections per node
        ef_construction = 200,     -- Build-time beam width
        distance_metric = 'cosine' -- 'l2', 'cosine', or 'inner_product'
    );

-- IVF-PQ index (for datasets > 1M vectors)
CREATE INDEX idx_docs_embed_ivf ON documents
    USING IVF_PQ (embedding)
    WITH (
        nlist = 1024,              -- Number of clusters
        m_pq = 64,                 -- Number of PQ sub-quantizers
        distance_metric = 'l2'
    );
```

### Tuning ANN Search

```sql
-- Set HNSW search beam width for the current session
SET hnsw.ef_search = 128;  -- Higher = more accurate but slower

-- Set IVF-PQ probe count
SET ivf.nprobe = 20;  -- Higher = more accurate but slower

-- Then run your query
SELECT id, title, embedding <-> $1 AS distance
FROM documents
ORDER BY embedding <-> $1
LIMIT 10;
```

---

## Foreign Data Wrappers (FDW)

ThunderDB can query data stored in external systems and join it with local tables. This enables data federation without ETL.

### CREATE SERVER

Define a connection to an external data source.

```sql
-- PostgreSQL server
CREATE SERVER pg_production
    TYPE 'postgresql'
    OPTIONS (
        host '10.0.1.50',
        port '5432',
        dbname 'production',
        user 'readonly',
        password 'secret'
    );

-- MySQL server
CREATE SERVER mysql_legacy
    TYPE 'mysql'
    OPTIONS (
        host '10.0.2.50',
        port '3306',
        dbname 'legacy_app',
        user 'reader',
        password 'secret'
    );

-- MongoDB server
CREATE SERVER mongo_logs
    TYPE 'mongodb'
    OPTIONS (
        connection_string 'mongodb://10.0.3.50:27017/logs',
        auth_database 'admin',
        user 'reader',
        password 'secret'
    );

-- Amazon S3 (Parquet files)
CREATE SERVER s3_data_lake
    TYPE 's3'
    OPTIONS (
        region 'us-east-1',
        bucket 'my-data-lake',
        access_key_id 'AKIAIOSFODNN7EXAMPLE',
        secret_access_key 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    );
```

### CREATE FOREIGN TABLE

Map a remote table or collection to a local table definition.

```sql
-- From PostgreSQL
CREATE FOREIGN TABLE remote_users (
    id     BIGINT,
    name   VARCHAR(255),
    email  VARCHAR(255),
    active BOOLEAN
) SERVER pg_production
OPTIONS (schema 'public', table 'users');

-- From MySQL
CREATE FOREIGN TABLE legacy_orders (
    order_id   INT32,
    customer   VARCHAR(100),
    total      DECIMAL(10,2),
    order_date DATE
) SERVER mysql_legacy
OPTIONS (table 'orders');

-- From MongoDB
CREATE FOREIGN TABLE mongo_access_logs (
    _id        VARCHAR(24),
    user_id    BIGINT,
    endpoint   VARCHAR(255),
    status     INT32,
    timestamp  TIMESTAMPTZ
) SERVER mongo_logs
OPTIONS (collection 'access_logs');

-- From S3 Parquet files
CREATE FOREIGN TABLE s3_events (
    event_id   BIGINT,
    event_type VARCHAR(50),
    payload    JSONB,
    created_at TIMESTAMPTZ
) SERVER s3_data_lake
OPTIONS (path 'events/year=2025/', format 'parquet');
```

### Querying Foreign Tables

Foreign tables behave like regular tables in queries. ThunderDB pushes down predicates and projections to minimize data transfer.

```sql
-- Query a foreign table directly
SELECT * FROM remote_users WHERE active = true LIMIT 100;

-- Join local and foreign tables
SELECT
    u.name,
    u.email,
    COUNT(o.order_id) AS total_orders,
    SUM(o.total) AS lifetime_value
FROM remote_users u
JOIN legacy_orders o ON u.name = o.customer
GROUP BY u.name, u.email
ORDER BY lifetime_value DESC
LIMIT 20;

-- Cross-database federation: PostgreSQL + MySQL + MongoDB in one query
SELECT
    u.name,
    o.total AS order_total,
    COUNT(l._id) AS access_count
FROM remote_users u
JOIN legacy_orders o ON u.name = o.customer
LEFT JOIN mongo_access_logs l ON u.id = l.user_id
GROUP BY u.name, o.total
ORDER BY access_count DESC;

-- Query S3 Parquet files
SELECT
    event_type,
    COUNT(*) AS event_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
FROM s3_events
WHERE created_at >= '2025-12-01'
GROUP BY event_type
ORDER BY event_count DESC;
```

### DROP SERVER and DROP FOREIGN TABLE

```sql
-- Drop a foreign table
DROP FOREIGN TABLE IF EXISTS remote_users;

-- Drop a server (must drop foreign tables first, or use CASCADE)
DROP SERVER IF EXISTS pg_production CASCADE;
```

---

## Built-in Functions

### Aggregate Functions

| Function | Description |
|---|---|
| `COUNT(*)` | Count of rows |
| `COUNT(expr)` | Count of non-null values |
| `COUNT(DISTINCT expr)` | Count of distinct non-null values |
| `SUM(expr)` | Sum of values |
| `AVG(expr)` | Average of values |
| `MIN(expr)` | Minimum value |
| `MAX(expr)` | Maximum value |
| `ARRAY_AGG(expr)` | Collect values into an array |
| `STRING_AGG(expr, delimiter)` | Concatenate strings with delimiter |
| `BOOL_AND(expr)` | True if all values are true |
| `BOOL_OR(expr)` | True if any value is true |
| `STDDEV(expr)` | Sample standard deviation |
| `VARIANCE(expr)` | Sample variance |
| `PERCENTILE_CONT(fraction)` | Continuous percentile |
| `PERCENTILE_DISC(fraction)` | Discrete percentile |

### String Functions

| Function | Description | Example |
|---|---|---|
| `LENGTH(s)` | String length | `LENGTH('hello')` = 5 |
| `UPPER(s)` | Uppercase | `UPPER('hello')` = `'HELLO'` |
| `LOWER(s)` | Lowercase | `LOWER('HELLO')` = `'hello'` |
| `TRIM(s)` | Remove whitespace | `TRIM('  hi  ')` = `'hi'` |
| `LTRIM(s)` | Left trim | `LTRIM('  hi')` = `'hi'` |
| `RTRIM(s)` | Right trim | `RTRIM('hi  ')` = `'hi'` |
| `SUBSTRING(s, start, len)` | Extract substring | `SUBSTRING('hello', 2, 3)` = `'ell'` |
| `REPLACE(s, from, to)` | Replace occurrences | `REPLACE('hello', 'l', 'r')` = `'herro'` |
| `CONCAT(s1, s2, ...)` | Concatenate strings | `CONCAT('a', 'b', 'c')` = `'abc'` |
| `SPLIT_PART(s, delim, n)` | Split and extract | `SPLIT_PART('a.b.c', '.', 2)` = `'b'` |
| `REGEXP_MATCH(s, pattern)` | Regex match | `REGEXP_MATCH('abc123', '\d+')` = `{'123'}` |
| `REGEXP_REPLACE(s, p, r)` | Regex replace | `REGEXP_REPLACE('abc', '[a-z]', 'X', 'g')` = `'XXX'` |
| `STARTS_WITH(s, prefix)` | Prefix check | `STARTS_WITH('hello', 'he')` = `true` |
| `MD5(s)` | MD5 hash | `MD5('hello')` = `'5d41402abc4b2a76...'` |

### Date & Time Functions

| Function | Description | Example |
|---|---|---|
| `now()` | Current timestamp with timezone | `2025-12-15 10:30:00+00` |
| `current_date` | Current date | `2025-12-15` |
| `current_time` | Current time | `10:30:00+00` |
| `date_trunc(field, ts)` | Truncate to precision | `date_trunc('month', ts)` |
| `date_part(field, ts)` | Extract field | `date_part('year', ts)` = 2025 |
| `EXTRACT(field FROM ts)` | Extract field (SQL standard) | `EXTRACT(MONTH FROM ts)` = 12 |
| `age(ts1, ts2)` | Interval between timestamps | `age(now(), created_at)` |
| `ts + INTERVAL '...'` | Add interval | `now() + INTERVAL '7 days'` |
| `ts - INTERVAL '...'` | Subtract interval | `now() - INTERVAL '1 hour'` |
| `to_char(ts, format)` | Format timestamp | `to_char(now(), 'YYYY-MM-DD')` |
| `to_timestamp(str, fmt)` | Parse timestamp | `to_timestamp('2025-01-15', 'YYYY-MM-DD')` |
| `generate_series(start, stop, step)` | Generate time series | See example below |

```sql
-- Generate a time series
SELECT ts::DATE AS day
FROM generate_series(
    '2025-01-01'::TIMESTAMP,
    '2025-01-31'::TIMESTAMP,
    '1 day'::INTERVAL
) AS ts;
```

### JSON / JSONB Functions

| Function / Operator | Description | Example |
|---|---|---|
| `->` | Get JSON element by key (returns JSON) | `data->'name'` |
| `->>` | Get JSON element by key (returns text) | `data->>'name'` |
| `#>` | Get JSON element by path (returns JSON) | `data#>'{address,city}'` |
| `#>>` | Get JSON element by path (returns text) | `data#>>'{address,city}'` |
| `@>` | Contains | `data @> '{"active": true}'` |
| `<@` | Contained by | `'{"a":1}' <@ data` |
| `?` | Key exists | `data ? 'email'` |
| `jsonb_build_object(k,v,...)` | Construct JSONB | `jsonb_build_object('name', 'Alice')` |
| `jsonb_agg(expr)` | Aggregate into JSON array | `jsonb_agg(name)` |
| `jsonb_object_agg(k, v)` | Aggregate into JSON object | `jsonb_object_agg(key, value)` |
| `jsonb_array_elements(j)` | Expand JSON array to rows | `jsonb_array_elements('[1,2,3]')` |
| `jsonb_each(j)` | Expand JSON object to key-value rows | `jsonb_each('{"a":1}')` |
| `jsonb_set(j, path, val)` | Set value at path | `jsonb_set(data, '{name}', '"Bob"')` |
| `jsonb_strip_nulls(j)` | Remove null keys | `jsonb_strip_nulls(data)` |

### Mathematical Functions

| Function | Description |
|---|---|
| `ABS(x)` | Absolute value |
| `CEIL(x)` / `CEILING(x)` | Round up |
| `FLOOR(x)` | Round down |
| `ROUND(x, d)` | Round to `d` decimal places |
| `TRUNC(x, d)` | Truncate to `d` decimal places |
| `MOD(x, y)` | Modulo |
| `POWER(x, y)` | x raised to power y |
| `SQRT(x)` | Square root |
| `LN(x)` | Natural logarithm |
| `LOG(base, x)` | Logarithm with base |
| `EXP(x)` | Exponential (e^x) |
| `RANDOM()` | Random value between 0 and 1 |
| `GREATEST(a, b, ...)` | Maximum of values |
| `LEAST(a, b, ...)` | Minimum of values |

### Conditional Expressions

```sql
-- CASE expression
SELECT name,
    CASE
        WHEN price < 10 THEN 'budget'
        WHEN price < 100 THEN 'mid-range'
        ELSE 'premium'
    END AS tier
FROM products;

-- COALESCE (first non-null)
SELECT COALESCE(nickname, name, 'Anonymous') AS display_name
FROM users;

-- NULLIF (return null if equal)
SELECT NULLIF(discount, 0) AS effective_discount
FROM products;

-- IIF (inline if)
SELECT name, IIF(active, 'Active', 'Inactive') AS status
FROM users;
```

---

## System Commands

```sql
-- Show server version
SELECT version();

-- Show current database
SELECT current_database();

-- Show current user
SELECT current_user;

-- Show all tables
SHOW TABLES;

-- Show table schema
DESCRIBE users;
-- or
\d users

-- Show running queries
SELECT * FROM thunder_catalog.running_queries;

-- Show cluster status
SELECT * FROM thunder_catalog.cluster_nodes;

-- Show replication status
SELECT * FROM thunder_catalog.replication_status;

-- Cancel a running query
SELECT thunder_cancel_query('query_id_here');

-- Analyze table statistics (for query planner)
ANALYZE users;

-- Vacuum (reclaim storage)
VACUUM users;
VACUUM FULL users;  -- Rewrites table, reclaims maximum space
```
