---
title: "SDKs & Drivers"
weight: 3
description: "Connect to ThunderDB using the native Rust client, standard PostgreSQL/MySQL drivers, or Redis clients in Python, Node.js, Go, and Rust."
---

# SDKs & Drivers

ThunderDB implements the PostgreSQL, MySQL, and Redis (RESP) wire protocols natively. This means you can use any standard driver for these databases to connect to ThunderDB with zero modifications. ThunderDB also ships a native Rust client crate with additional features like connection pooling, cluster-aware routing, and vector type support.

---

## Driver Compatibility Matrix

| Language | PostgreSQL Driver | MySQL Driver | Redis Client | Native Client |
|---|---|---|---|---|
| **Rust** | `tokio-postgres` | `mysql_async` | `redis` crate | `thunder-client` |
| **Python** | `psycopg2` / `asyncpg` | `mysql-connector-python` | `redis-py` | -- |
| **Node.js** | `node-postgres` (pg) | `mysql2` | `ioredis` | -- |
| **Go** | `pgx` / `lib/pq` | `go-sql-driver/mysql` | `go-redis` | -- |
| **Java** | JDBC (PostgreSQL) | JDBC (MySQL) | Jedis / Lettuce | -- |
| **C#/.NET** | Npgsql | MySqlConnector | StackExchange.Redis | -- |

---

## Native Rust Client (`thunder-client`)

The `thunder-client` crate provides the most feature-complete integration with ThunderDB, including cluster-aware connection routing, automatic failover, native vector type support, and CDC stream subscriptions.

### Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
thunder-client = "0.9"
tokio = { version = "1", features = ["full"] }
```

### Connecting

```rust
use thunder_client::{ClientBuilder, Client};

#[tokio::main]
async fn main() -> Result<(), thunder_client::Error> {
    // Simple connection
    let client = ClientBuilder::new()
        .host("localhost")
        .port(5432)
        .user("thunder")
        .password("secret")
        .database("myapp")
        .build()
        .await?;

    println!("Connected to ThunderDB {}", client.server_version());
    Ok(())
}
```

### Connection Pooling

```rust
use thunder_client::{ClientBuilder, PoolConfig};

#[tokio::main]
async fn main() -> Result<(), thunder_client::Error> {
    let client = ClientBuilder::new()
        .host("localhost")
        .port(5432)
        .user("thunder")
        .password("secret")
        .database("myapp")
        .pool(PoolConfig {
            min_connections: 5,
            max_connections: 50,
            idle_timeout: std::time::Duration::from_secs(300),
            max_lifetime: std::time::Duration::from_secs(3600),
            acquire_timeout: std::time::Duration::from_secs(5),
        })
        .build()
        .await?;

    // Connections are automatically managed by the pool
    let rows = client.query("SELECT COUNT(*) FROM users", &[]).await?;
    println!("User count: {}", rows[0].get::<i64>(0));
    Ok(())
}
```

### Cluster-Aware Connection

```rust
use thunder_client::{ClientBuilder, ClusterConfig};

#[tokio::main]
async fn main() -> Result<(), thunder_client::Error> {
    let client = ClientBuilder::new()
        .cluster(ClusterConfig {
            seeds: vec![
                "10.0.1.10:5432".to_string(),
                "10.0.1.11:5432".to_string(),
                "10.0.2.10:5432".to_string(),
            ],
            // Route reads to followers, writes to leader
            read_preference: thunder_client::ReadPreference::Follower,
            // Automatically retry on failover
            auto_retry: true,
            max_retries: 3,
        })
        .user("thunder")
        .password("secret")
        .database("myapp")
        .build()
        .await?;

    // This query is automatically routed to a follower
    let rows = client.query("SELECT * FROM users LIMIT 10", &[]).await?;

    // This statement is automatically routed to the leader
    client.execute(
        "INSERT INTO users (name, email) VALUES ($1, $2)",
        &[&"Alice", &"alice@example.com"],
    ).await?;

    Ok(())
}
```

### Queries and Parameterized Statements

```rust
use thunder_client::Client;

async fn query_examples(client: &Client) -> Result<(), thunder_client::Error> {
    // Simple query
    let rows = client.query(
        "SELECT id, name, email FROM users WHERE active = $1",
        &[&true],
    ).await?;

    for row in &rows {
        let id: i64 = row.get("id");
        let name: String = row.get("name");
        let email: String = row.get("email");
        println!("{}: {} <{}>", id, name, email);
    }

    // Query returning a single row
    let row = client.query_one(
        "SELECT COUNT(*) AS total FROM orders WHERE customer_id = $1",
        &[&42_i64],
    ).await?;
    let total: i64 = row.get("total");
    println!("Order count: {}", total);

    // Execute (INSERT/UPDATE/DELETE) returning affected rows
    let affected = client.execute(
        "UPDATE users SET active = false WHERE last_login < now() - INTERVAL '90 days'",
        &[],
    ).await?;
    println!("Deactivated {} users", affected);

    Ok(())
}
```

### Prepared Statements

```rust
use thunder_client::Client;

async fn prepared_example(client: &Client) -> Result<(), thunder_client::Error> {
    // Prepare a statement once
    let stmt = client.prepare(
        "SELECT id, name, price FROM products WHERE category = $1 AND price < $2"
    ).await?;

    // Execute multiple times with different parameters
    let electronics = client.query_prepared(&stmt, &[&"electronics", &500.0_f64]).await?;
    let books = client.query_prepared(&stmt, &[&"books", &30.0_f64]).await?;

    println!("Found {} electronics, {} books", electronics.len(), books.len());
    Ok(())
}
```

### Transactions

```rust
use thunder_client::{Client, IsolationLevel};

async fn transaction_example(client: &Client) -> Result<(), thunder_client::Error> {
    // Begin a transaction
    let txn = client.begin()
        .isolation_level(IsolationLevel::Serializable)
        .start()
        .await?;

    // Execute statements within the transaction
    txn.execute(
        "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
        &[&100.0_f64, &1_i64],
    ).await?;

    txn.execute(
        "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
        &[&100.0_f64, &2_i64],
    ).await?;

    txn.execute(
        "INSERT INTO transfers (from_id, to_id, amount) VALUES ($1, $2, $3)",
        &[&1_i64, &2_i64, &100.0_f64],
    ).await?;

    // Commit the transaction
    txn.commit().await?;
    println!("Transfer committed successfully");

    // Using savepoints
    let txn = client.begin().start().await?;
    txn.execute("INSERT INTO orders (customer_id, total) VALUES ($1, $2)", &[&42_i64, &299.99_f64]).await?;

    let sp = txn.savepoint("before_items").await?;
    // Try something risky
    let result = txn.execute(
        "INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)",
        &[&1_i64, &999_i64, &1_i32],
    ).await;

    if result.is_err() {
        // Roll back to the savepoint
        sp.rollback().await?;
        // Try with a different product
        txn.execute(
            "INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)",
            &[&1_i64, &42_i64, &1_i32],
        ).await?;
    }

    txn.commit().await?;
    Ok(())
}
```

### Vector Operations

```rust
use thunder_client::{Client, Vector};

async fn vector_examples(client: &Client) -> Result<(), thunder_client::Error> {
    // Insert a vector
    let embedding = Vector::from(vec![0.1_f32, -0.23, 0.98, 0.45, 0.67]);
    client.execute(
        "INSERT INTO documents (id, title, embedding) VALUES ($1, $2, $3)",
        &[&1_i64, &"Quantum Computing", &embedding],
    ).await?;

    // Similarity search
    let query_vec = Vector::from(vec![0.15_f32, -0.20, 0.95, 0.50, 0.60]);
    let results = client.query(
        "SELECT id, title, embedding <-> $1 AS distance
         FROM documents
         ORDER BY embedding <-> $1
         LIMIT 10",
        &[&query_vec],
    ).await?;

    for row in &results {
        let id: i64 = row.get("id");
        let title: String = row.get("title");
        let distance: f64 = row.get("distance");
        println!("[{:.4}] {} - {}", distance, id, title);
    }

    Ok(())
}
```

### CDC Stream Subscription

```rust
use thunder_client::{Client, CdcEvent};
use futures::StreamExt;

async fn cdc_example(client: &Client) -> Result<(), thunder_client::Error> {
    // Subscribe to changes on the orders table
    let mut stream = client.subscribe_cdc("orders")
        .events(vec!["insert", "update"])
        .filter("total > 100")
        .start()
        .await?;

    // Process events as they arrive
    while let Some(event) = stream.next().await {
        let event = event?;
        match event {
            CdcEvent::Insert { table, row, lsn, .. } => {
                println!("New order in {}: {:?} (LSN: {})", table, row, lsn);
            }
            CdcEvent::Update { table, old_row, new_row, changed_columns, .. } => {
                println!("Updated order in {}: {:?} -> {:?} (changed: {:?})",
                    table, old_row, new_row, changed_columns);
            }
            _ => {}
        }
    }

    Ok(())
}
```

---

## PostgreSQL Drivers

Because ThunderDB speaks the PostgreSQL wire protocol, any PostgreSQL driver connects without modifications. Below are examples for popular languages.

### Python (psycopg2)

```bash
pip install psycopg2-binary
```

```python
import psycopg2

# Connect to ThunderDB via PostgreSQL protocol
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    user="thunder",
    password="secret",
    dbname="myapp"
)

# Create a table
with conn.cursor() as cur:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    conn.commit()

# Insert data
with conn.cursor() as cur:
    cur.execute(
        "INSERT INTO users (id, name, email) VALUES (%s, %s, %s)",
        (1, "Alice Johnson", "alice@example.com")
    )
    conn.commit()

# Batch insert
with conn.cursor() as cur:
    users = [
        (2, "Bob Smith", "bob@example.com"),
        (3, "Carol White", "carol@example.com"),
        (4, "Dave Brown", "dave@example.com"),
    ]
    cur.executemany(
        "INSERT INTO users (id, name, email) VALUES (%s, %s, %s)",
        users
    )
    conn.commit()

# Query data
with conn.cursor() as cur:
    cur.execute("SELECT id, name, email FROM users WHERE active = %s", (True,))
    rows = cur.fetchall()
    for row in rows:
        print(f"User {row[0]}: {row[1]} <{row[2]}>")

# Transactions
try:
    with conn.cursor() as cur:
        cur.execute("UPDATE accounts SET balance = balance - 100 WHERE id = 1")
        cur.execute("UPDATE accounts SET balance = balance + 100 WHERE id = 2")
        conn.commit()
except Exception as e:
    conn.rollback()
    print(f"Transaction failed: {e}")

conn.close()
```

### Python (asyncpg -- async)

```bash
pip install asyncpg
```

```python
import asyncio
import asyncpg

async def main():
    # Create a connection pool
    pool = await asyncpg.create_pool(
        host="localhost",
        port=5432,
        user="thunder",
        password="secret",
        database="myapp",
        min_size=5,
        max_size=20,
    )

    # Query with pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, email FROM users WHERE active = $1",
            True
        )
        for row in rows:
            print(f"User {row['id']}: {row['name']} <{row['email']}>")

    # Transaction
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
                100, 1
            )
            await conn.execute(
                "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
                100, 2
            )

    await pool.close()

asyncio.run(main())
```

### Node.js (node-postgres / pg)

```bash
npm install pg
```

```javascript
const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'thunder',
  password: 'secret',
  database: 'myapp',
  max: 20,
  idleTimeoutMillis: 30000,
});

async function main() {
  // Create a table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Insert data with parameterized query
  await pool.query(
    'INSERT INTO users (id, name, email) VALUES ($1, $2, $3)',
    [1, 'Alice Johnson', 'alice@example.com']
  );

  // Query data
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE active = $1',
    [true]
  );
  for (const row of result.rows) {
    console.log(`User ${row.id}: ${row.name} <${row.email}>`);
  }

  // Transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [100, 1]
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [100, 2]
    );
    await client.query('COMMIT');
    console.log('Transfer committed');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Transaction failed:', e.message);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch(console.error);
```

### Go (pgx)

```bash
go get github.com/jackc/pgx/v5
```

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
)

func main() {
    ctx := context.Background()

    // Create connection pool
    poolConfig, err := pgxpool.ParseConfig(
        "postgresql://thunder:secret@localhost:5432/myapp?pool_max_conns=20",
    )
    if err != nil {
        log.Fatal(err)
    }

    pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
    if err != nil {
        log.Fatal(err)
    }
    defer pool.Close()

    // Create a table
    _, err = pool.Exec(ctx, `
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    `)
    if err != nil {
        log.Fatal(err)
    }

    // Insert data
    _, err = pool.Exec(ctx,
        "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
        1, "Alice Johnson", "alice@example.com",
    )
    if err != nil {
        log.Fatal(err)
    }

    // Query data
    rows, err := pool.Query(ctx,
        "SELECT id, name, email FROM users WHERE active = $1",
        true,
    )
    if err != nil {
        log.Fatal(err)
    }
    defer rows.Close()

    for rows.Next() {
        var id int64
        var name, email string
        if err := rows.Scan(&id, &name, &email); err != nil {
            log.Fatal(err)
        }
        fmt.Printf("User %d: %s <%s>\n", id, name, email)
    }

    // Transaction
    tx, err := pool.Begin(ctx)
    if err != nil {
        log.Fatal(err)
    }
    defer tx.Rollback(ctx) // No-op if committed

    _, err = tx.Exec(ctx,
        "UPDATE accounts SET balance = balance - $1 WHERE id = $2", 100, 1)
    if err != nil {
        log.Fatal(err)
    }

    _, err = tx.Exec(ctx,
        "UPDATE accounts SET balance = balance + $1 WHERE id = $2", 100, 2)
    if err != nil {
        log.Fatal(err)
    }

    if err := tx.Commit(ctx); err != nil {
        log.Fatal(err)
    }
    fmt.Println("Transfer committed")
}
```

### Rust (tokio-postgres)

```toml
[dependencies]
tokio-postgres = "0.7"
tokio = { version = "1", features = ["full"] }
```

```rust
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to ThunderDB via PostgreSQL protocol
    let (client, connection) = tokio_postgres::connect(
        "host=localhost port=5432 user=thunder password=secret dbname=myapp",
        NoTls,
    ).await?;

    // Spawn the connection handler
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });

    // Create a table
    client.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )",
        &[],
    ).await?;

    // Insert data
    client.execute(
        "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
        &[&1_i64, &"Alice Johnson", &"alice@example.com"],
    ).await?;

    // Query data
    let rows = client.query(
        "SELECT id, name, email FROM users WHERE active = $1",
        &[&true],
    ).await?;

    for row in &rows {
        let id: i64 = row.get(0);
        let name: &str = row.get(1);
        let email: &str = row.get(2);
        println!("User {}: {} <{}>", id, name, email);
    }

    // Transaction
    let txn = client.transaction().await?;
    txn.execute(
        "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
        &[&100.0_f64, &1_i64],
    ).await?;
    txn.execute(
        "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
        &[&100.0_f64, &2_i64],
    ).await?;
    txn.commit().await?;
    println!("Transfer committed");

    Ok(())
}
```

---

## MySQL Drivers

ThunderDB implements the MySQL wire protocol, allowing any MySQL driver to connect.

### Python (mysql-connector-python)

```bash
pip install mysql-connector-python
```

```python
import mysql.connector

# Connect to ThunderDB via MySQL protocol
conn = mysql.connector.connect(
    host="localhost",
    port=3306,
    user="thunder",
    password="secret",
    database="myapp"
)

cursor = conn.cursor()

# Create a table
cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT now()
    )
""")
conn.commit()

# Insert data
cursor.execute(
    "INSERT INTO products (id, name, price, category) VALUES (%s, %s, %s, %s)",
    (1, "Wireless Mouse", 29.99, "electronics")
)
conn.commit()

# Batch insert
products = [
    (2, "USB-C Cable", 12.99, "electronics"),
    (3, "Python Cookbook", 45.00, "books"),
    (4, "Standing Desk", 599.99, "furniture"),
]
cursor.executemany(
    "INSERT INTO products (id, name, price, category) VALUES (%s, %s, %s, %s)",
    products
)
conn.commit()

# Query data
cursor.execute(
    "SELECT id, name, price FROM products WHERE category = %s ORDER BY price",
    ("electronics",)
)
for row in cursor.fetchall():
    print(f"Product {row[0]}: {row[1]} - ${row[2]}")

cursor.close()
conn.close()
```

### Node.js (mysql2)

```bash
npm install mysql2
```

```javascript
const mysql = require('mysql2/promise');

async function main() {
  // Create connection pool
  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'thunder',
    password: 'secret',
    database: 'myapp',
    connectionLimit: 20,
    waitForConnections: true,
  });

  // Create a table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      category VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Insert data with parameterized query
  await pool.query(
    'INSERT INTO products (id, name, price, category) VALUES (?, ?, ?, ?)',
    [1, 'Wireless Mouse', 29.99, 'electronics']
  );

  // Query data
  const [rows] = await pool.query(
    'SELECT id, name, price FROM products WHERE category = ? ORDER BY price',
    ['electronics']
  );
  for (const row of rows) {
    console.log(`Product ${row.id}: ${row.name} - $${row.price}`);
  }

  // Transaction
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]
    );
    await conn.query(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]
    );
    await conn.commit();
    console.log('Transfer committed');
  } catch (e) {
    await conn.rollback();
    console.error('Transaction failed:', e.message);
  } finally {
    conn.release();
  }

  await pool.end();
}

main().catch(console.error);
```

### Go (go-sql-driver/mysql)

```bash
go get github.com/go-sql-driver/mysql
```

```go
package main

import (
    "database/sql"
    "fmt"
    "log"

    _ "github.com/go-sql-driver/mysql"
)

func main() {
    // Connect to ThunderDB via MySQL protocol
    db, err := sql.Open("mysql", "thunder:secret@tcp(localhost:3306)/myapp")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    db.SetMaxOpenConns(20)
    db.SetMaxIdleConns(5)

    // Create a table
    _, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS products (
            id BIGINT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            category VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    `)
    if err != nil {
        log.Fatal(err)
    }

    // Insert data
    _, err = db.Exec(
        "INSERT INTO products (id, name, price, category) VALUES (?, ?, ?, ?)",
        1, "Wireless Mouse", 29.99, "electronics",
    )
    if err != nil {
        log.Fatal(err)
    }

    // Query data
    rows, err := db.Query(
        "SELECT id, name, price FROM products WHERE category = ? ORDER BY price",
        "electronics",
    )
    if err != nil {
        log.Fatal(err)
    }
    defer rows.Close()

    for rows.Next() {
        var id int64
        var name string
        var price float64
        if err := rows.Scan(&id, &name, &price); err != nil {
            log.Fatal(err)
        }
        fmt.Printf("Product %d: %s - $%.2f\n", id, name, price)
    }

    // Transaction
    tx, err := db.Begin()
    if err != nil {
        log.Fatal(err)
    }

    _, err = tx.Exec("UPDATE accounts SET balance = balance - ? WHERE id = ?", 100, 1)
    if err != nil {
        tx.Rollback()
        log.Fatal(err)
    }

    _, err = tx.Exec("UPDATE accounts SET balance = balance + ? WHERE id = ?", 100, 2)
    if err != nil {
        tx.Rollback()
        log.Fatal(err)
    }

    if err := tx.Commit(); err != nil {
        log.Fatal(err)
    }
    fmt.Println("Transfer committed")
}
```

---

## Redis Clients

ThunderDB implements the RESP (Redis Serialization Protocol), supporting common Redis commands for key-value operations, data structures, and pub/sub. You can use ThunderDB as a Redis-compatible cache with the bonus of SQL queryability over the cached data.

### Python (redis-py)

```bash
pip install redis
```

```python
import redis

# Connect to ThunderDB via Redis protocol
r = redis.Redis(
    host="localhost",
    port=6379,
    password="secret",
    decode_responses=True
)

# String operations
r.set("user:1:name", "Alice Johnson")
r.set("user:1:email", "alice@example.com")
r.setex("session:abc123", 3600, "user:1")  # Expires in 1 hour

name = r.get("user:1:name")
print(f"Name: {name}")

# Hash operations
r.hset("product:42", mapping={
    "name": "Wireless Mouse",
    "price": "29.99",
    "category": "electronics",
    "stock": "150"
})

product = r.hgetall("product:42")
print(f"Product: {product}")

# List operations (message queue pattern)
r.lpush("task_queue", "process_order:1001")
r.lpush("task_queue", "send_email:user:1")

task = r.rpop("task_queue")
print(f"Next task: {task}")

# Set operations
r.sadd("user:1:tags", "premium", "early-adopter", "beta-tester")
r.sadd("user:2:tags", "premium", "enterprise")

common_tags = r.sinter("user:1:tags", "user:2:tags")
print(f"Common tags: {common_tags}")

# Sorted set (leaderboard)
r.zadd("leaderboard", {"alice": 2500, "bob": 1800, "carol": 3200})
top_players = r.zrevrange("leaderboard", 0, 2, withscores=True)
print(f"Top players: {top_players}")

# Pub/Sub
pubsub = r.pubsub()
pubsub.subscribe("order_events")

# In another thread/process:
# r.publish("order_events", '{"order_id": 1001, "status": "shipped"}')

# Pipeline (batch commands)
pipe = r.pipeline()
pipe.set("counter:visits", 0)
pipe.incr("counter:visits")
pipe.incr("counter:visits")
pipe.incr("counter:visits")
pipe.get("counter:visits")
results = pipe.execute()
print(f"Visit count: {results[-1]}")
```

### Node.js (ioredis)

```bash
npm install ioredis
```

```javascript
const Redis = require('ioredis');

async function main() {
  // Connect to ThunderDB via Redis protocol
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    password: 'secret',
  });

  // String operations
  await redis.set('user:1:name', 'Alice Johnson');
  await redis.setex('session:abc123', 3600, 'user:1');

  const name = await redis.get('user:1:name');
  console.log(`Name: ${name}`);

  // Hash operations
  await redis.hset('product:42', {
    name: 'Wireless Mouse',
    price: '29.99',
    category: 'electronics',
    stock: '150',
  });

  const product = await redis.hgetall('product:42');
  console.log('Product:', product);

  // Sorted set (leaderboard)
  await redis.zadd('leaderboard', 2500, 'alice', 1800, 'bob', 3200, 'carol');
  const topPlayers = await redis.zrevrange('leaderboard', 0, 2, 'WITHSCORES');
  console.log('Top players:', topPlayers);

  // Pipeline
  const pipeline = redis.pipeline();
  pipeline.set('counter:api_calls', 0);
  pipeline.incr('counter:api_calls');
  pipeline.incr('counter:api_calls');
  pipeline.incr('counter:api_calls');
  pipeline.get('counter:api_calls');
  const results = await pipeline.exec();
  console.log('API call count:', results[results.length - 1][1]);

  // Pub/Sub
  const subscriber = new Redis({ host: 'localhost', port: 6379, password: 'secret' });
  subscriber.subscribe('order_events', (err) => {
    if (err) console.error('Subscribe error:', err);
  });
  subscriber.on('message', (channel, message) => {
    console.log(`[${channel}] ${message}`);
  });

  // Publish from main connection
  await redis.publish('order_events', JSON.stringify({
    order_id: 1001,
    status: 'shipped',
  }));

  // Clean up
  subscriber.disconnect();
  redis.disconnect();
}

main().catch(console.error);
```

### Go (go-redis)

```bash
go get github.com/redis/go-redis/v9
```

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/redis/go-redis/v9"
)

func main() {
    ctx := context.Background()

    // Connect to ThunderDB via Redis protocol
    rdb := redis.NewClient(&redis.Options{
        Addr:     "localhost:6379",
        Password: "secret",
        PoolSize: 20,
    })
    defer rdb.Close()

    // String operations
    err := rdb.Set(ctx, "user:1:name", "Alice Johnson", 0).Err()
    if err != nil {
        log.Fatal(err)
    }

    name, err := rdb.Get(ctx, "user:1:name").Result()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Name: %s\n", name)

    // Hash operations
    err = rdb.HSet(ctx, "product:42", map[string]interface{}{
        "name":     "Wireless Mouse",
        "price":    "29.99",
        "category": "electronics",
        "stock":    "150",
    }).Err()
    if err != nil {
        log.Fatal(err)
    }

    product, err := rdb.HGetAll(ctx, "product:42").Result()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Product: %v\n", product)

    // Sorted set (leaderboard)
    rdb.ZAdd(ctx, "leaderboard",
        redis.Z{Score: 2500, Member: "alice"},
        redis.Z{Score: 1800, Member: "bob"},
        redis.Z{Score: 3200, Member: "carol"},
    )

    topPlayers, err := rdb.ZRevRangeWithScores(ctx, "leaderboard", 0, 2).Result()
    if err != nil {
        log.Fatal(err)
    }
    for _, player := range topPlayers {
        fmt.Printf("%s: %.0f\n", player.Member, player.Score)
    }

    // Pipeline
    pipe := rdb.Pipeline()
    pipe.Set(ctx, "counter:requests", 0, 0)
    pipe.Incr(ctx, "counter:requests")
    pipe.Incr(ctx, "counter:requests")
    pipe.Incr(ctx, "counter:requests")
    getCmd := pipe.Get(ctx, "counter:requests")
    _, err = pipe.Exec(ctx)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Request count: %s\n", getCmd.Val())

    // Pub/Sub
    pubsub := rdb.Subscribe(ctx, "order_events")
    defer pubsub.Close()

    go func() {
        ch := pubsub.Channel()
        for msg := range ch {
            fmt.Printf("[%s] %s\n", msg.Channel, msg.Payload)
        }
    }()

    // Publish
    rdb.Publish(ctx, "order_events", `{"order_id": 1001, "status": "shipped"}`)
}
```

---

## Connection String Reference

ThunderDB accepts connection strings in the standard formats for each protocol:

### PostgreSQL Format

```
postgresql://thunder:secret@localhost:5432/myapp?sslmode=require&connect_timeout=10
```

| Parameter | Description | Default |
|---|---|---|
| `sslmode` | `disable`, `require`, `verify-ca`, `verify-full` | `disable` |
| `connect_timeout` | Connection timeout in seconds | `10` |
| `application_name` | Application identifier for monitoring | -- |
| `options` | Additional server options | -- |
| `target_session_attrs` | `read-write`, `read-only`, `any` | `any` |

### MySQL Format

```
thunder:secret@tcp(localhost:3306)/myapp?tls=true&timeout=10s
```

### Redis Format

```
redis://:secret@localhost:6379/0
```

---

## Best Practices

1. **Use connection pools** -- Always pool connections in production. Most drivers support this natively.
2. **Use parameterized queries** -- Never concatenate user input into SQL strings. Use bind parameters (`$1`, `%s`, `?`) to prevent SQL injection.
3. **Choose the right protocol** -- Use PostgreSQL for full SQL features, MySQL for compatibility with existing apps, Redis for caching workloads.
4. **Set timeouts** -- Configure connection and query timeouts appropriate for your workload.
5. **Handle transaction retries** -- When using `SERIALIZABLE` isolation, be prepared to retry transactions on serialization failures.
6. **Close connections** -- Always close connections and release pool resources when done.
7. **Use prepared statements** -- For repeated queries, prepared statements avoid repeated parsing and planning overhead.
8. **Monitor connections** -- Watch `thunderdb_active_connections` metrics to ensure pools are properly sized.
