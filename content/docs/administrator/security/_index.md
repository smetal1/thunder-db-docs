---
title: "Security"
weight: 5
description: "Secure ThunderDB with authentication, TLS encryption, role-based access control, audit logging, and encryption at rest."
---

# Security

This guide covers all aspects of securing a ThunderDB deployment, from client authentication and TLS encryption to role-based access control, audit logging, and encryption at rest. Follow these practices to protect your data in production environments.

---

## Authentication

ThunderDB supports authentication across all wire protocols, using protocol-native mechanisms that maintain compatibility with existing client libraries and tools.

### Enabling Authentication

```toml
[security]
authentication_enabled = true
superuser = "admin"
superuser_password = "change-me-in-production"
```

For production, use a hashed password via environment variable instead of plaintext in the configuration file:

```bash
export THUNDERDB_SUPERUSER_PASSWORD_HASH="argon2:\$argon2id\$v=19\$m=65536,t=3,p=4\$randomsalt\$hashedpassword"
```

### PostgreSQL Authentication

ThunderDB supports PostgreSQL-compatible authentication methods:

| Method | Description | Security Level |
|--------|-------------|---------------|
| `md5` | MD5 challenge-response | Moderate (legacy compatibility) |
| `scram-sha-256` | SCRAM-SHA-256 (RFC 5802) | High (recommended) |

**Connecting with SCRAM-SHA-256 (default):**

```bash
psql "host=localhost port=5432 user=admin password=mypassword sslmode=require"
```

**Connecting with MD5 (legacy):**

```bash
# MD5 is supported for backward compatibility but SCRAM-SHA-256 is preferred.
# The client library negotiates the strongest available method automatically.
psql "host=localhost port=5432 user=admin password=mypassword"
```

### MySQL Authentication

ThunderDB supports MySQL-compatible authentication plugins:

| Plugin | Description | Security Level |
|--------|-------------|---------------|
| `mysql_native_password` | SHA1-based authentication | Moderate (legacy compatibility) |
| `caching_sha2_password` | SHA-256 based authentication | High (recommended) |

**Connecting with SHA-256:**

```bash
mysql -h localhost -P 3306 -u admin -p --ssl-mode=REQUIRED
```

**Connecting with native password (legacy):**

```bash
mysql -h localhost -P 3306 -u admin -p --default-auth=mysql_native_password
```

### Password Hashing

ThunderDB uses Argon2id for internal password storage, which is the current state-of-the-art password hashing algorithm. Argon2id is resistant to both side-channel attacks and GPU-based cracking.

**Generate a password hash:**

```bash
thunderdb --hash-password
# Enter password: ********
# Confirm password: ********
# Hash: argon2:$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$hash...
```

**Use the hash in configuration:**

```bash
# Via environment variable (recommended)
export THUNDERDB_SUPERUSER_PASSWORD_HASH="argon2:\$argon2id\$v=19\$m=65536,t=3,p=4\$c2FsdHNhbHRzYWx0\$hash..."

# Or via configuration file (less secure, as the hash is stored in a file)
# [security]
# superuser_password_hash = "argon2:$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$hash..."
```

**Argon2id parameters used by ThunderDB:**

| Parameter | Value | Description |
|-----------|-------|-------------|
| Memory (`m`) | 65536 KB (64 MB) | Memory cost |
| Iterations (`t`) | 3 | Time cost (number of passes) |
| Parallelism (`p`) | 4 | Degree of parallelism |
| Salt length | 16 bytes | Random salt per password |
| Hash length | 32 bytes | Output hash length |

### Creating Additional Users

After connecting as the superuser, create additional users via SQL:

```sql
-- Create a user with a password
CREATE USER app_user WITH PASSWORD 'secure-password-here';

-- Create a read-only user
CREATE USER readonly_user WITH PASSWORD 'another-password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Create an admin user
CREATE USER dba_user WITH PASSWORD 'dba-password' SUPERUSER;
```

---

## TLS/SSL Configuration

TLS encrypts all traffic between clients and ThunderDB, protecting data in transit. ThunderDB applies TLS uniformly across all wire protocols (PostgreSQL, MySQL, RESP, HTTP, and gRPC).

### Generating Certificates

For production, use certificates signed by a trusted Certificate Authority. For development and testing, generate self-signed certificates:

```bash
# Generate a CA key and certificate
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/CN=ThunderDB CA/O=ThunderDB/C=US"

# Generate a server key and certificate signing request
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/CN=thunderdb.example.com/O=ThunderDB/C=US"

# Create a SAN (Subject Alternative Name) extension file
cat > san.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
subjectAltName=@alt_names

[alt_names]
DNS.1 = thunderdb.example.com
DNS.2 = *.thunderdb.example.com
DNS.3 = localhost
IP.1 = 127.0.0.1
IP.2 = 10.0.1.1
IP.3 = 10.0.1.2
IP.4 = 10.0.1.3
EOF

# Sign the server certificate
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -days 365 -extfile san.ext

# Set permissions
chmod 600 server.key
chmod 644 server.crt ca.crt
chown thunder:thunder server.key server.crt
```

### Enabling TLS

```toml
[security]
tls_enabled = true
tls_cert_path = "/etc/thunderdb/tls/server.crt"
tls_key_path = "/etc/thunderdb/tls/server.key"
```

### Connecting with TLS

**PostgreSQL:**

```bash
psql "host=localhost port=5432 user=admin sslmode=verify-full sslrootcert=ca.crt"
```

| sslmode | Description |
|---------|-------------|
| `disable` | No TLS (not recommended) |
| `require` | TLS required, no certificate verification |
| `verify-ca` | TLS required, verify server certificate against CA |
| `verify-full` | TLS required, verify certificate and hostname (recommended) |

**MySQL:**

```bash
mysql -h localhost -P 3306 -u admin -p \
  --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca=ca.crt
```

**RESP (Redis):**

```bash
redis-cli -h localhost -p 6379 --tls --cacert ca.crt
```

**HTTP:**

```bash
curl --cacert ca.crt https://localhost:8088/admin/health
```

**gRPC:**

```bash
grpcurl -cacert ca.crt localhost:9090 thunderdb.v1.ThunderDB/Health
```

### Certificate Rotation

ThunderDB supports certificate rotation without downtime:

1. Place the new certificate and key files at the configured paths.
2. Send a reload signal:

   ```bash
   sudo systemctl reload thunderdb
   # or
   curl -X POST http://localhost:8088/admin/reload-tls
   ```

3. New connections use the updated certificate. Existing connections continue with the old certificate until they reconnect.

---

## Role-Based Access Control (RBAC)

ThunderDB implements a role-based access control system that controls what operations users can perform on which database objects.

### Built-in Roles

| Role | Description |
|------|-------------|
| `SUPERUSER` | Full access to all operations and objects. Can manage users and roles. |
| `ADMIN` | Can create/drop databases, manage schemas and users (except superusers). |
| `READ_WRITE` | Can SELECT, INSERT, UPDATE, DELETE on granted objects. |
| `READ_ONLY` | Can SELECT on granted objects. |

### Managing Roles

```sql
-- Create a custom role
CREATE ROLE analytics_team;

-- Grant permissions to the role
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_team;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO analytics_team;
GRANT USAGE ON SCHEMA analytics TO analytics_team;

-- Assign the role to a user
GRANT analytics_team TO analyst_user;

-- Revoke permissions
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM analytics_team;

-- Drop a role
DROP ROLE analytics_team;
```

### Object-Level Permissions

```sql
-- Grant table-level access
GRANT SELECT, INSERT ON TABLE orders TO app_user;
GRANT SELECT ON TABLE products TO readonly_user;

-- Grant schema-level access
GRANT ALL PRIVILEGES ON SCHEMA app TO app_user;
GRANT USAGE ON SCHEMA app TO readonly_user;

-- Grant database-level access
GRANT CONNECT ON DATABASE production TO app_user;

-- View current grants
SELECT * FROM information_schema.role_table_grants
WHERE grantee = 'app_user';
```

### Row-Level Security (Future)

Row-level security policies are planned for a future release, enabling fine-grained access control at the row level.

---

## Audit Logging

Audit logging records security-relevant events for compliance and forensic analysis.

### Enabling Audit Logging

```toml
[security]
audit_log_enabled = true
audit_log_path = "/var/log/thunderdb/audit.log"

# Events to audit:
# "auth"      - Authentication attempts (success and failure)
# "ddl"       - Data Definition Language (CREATE, ALTER, DROP)
# "dml"       - Data Manipulation Language (INSERT, UPDATE, DELETE)
# "dcl"       - Data Control Language (GRANT, REVOKE)
# "admin"     - Administrative operations (backup, restore, config changes)
# "all"       - All events
audit_log_events = ["auth", "ddl", "dcl", "admin"]
```

### Audit Log Format

Audit events are written as JSON lines:

```json
{"timestamp":"2026-01-15T10:30:45.123Z","event":"auth","status":"success","user":"admin","client":"10.0.1.50:54321","protocol":"pg","method":"scram-sha-256"}
{"timestamp":"2026-01-15T10:30:46.456Z","event":"auth","status":"failure","user":"unknown_user","client":"10.0.1.99:12345","protocol":"pg","method":"scram-sha-256","reason":"user not found"}
{"timestamp":"2026-01-15T10:31:15.789Z","event":"ddl","user":"admin","client":"10.0.1.50:54321","protocol":"pg","statement":"CREATE TABLE orders (id BIGINT PRIMARY KEY, customer_id BIGINT, amount DECIMAL(10,2))"}
{"timestamp":"2026-01-15T10:32:00.012Z","event":"dcl","user":"admin","client":"10.0.1.50:54321","protocol":"pg","statement":"GRANT SELECT ON orders TO readonly_user"}
{"timestamp":"2026-01-15T10:33:00.345Z","event":"admin","user":"admin","client":"10.0.1.50:54321","protocol":"http","action":"backup_started","backup_id":"bk-20260115-103300"}
```

### Audit Log Fields

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp of the event. |
| `event` | Event category: `auth`, `ddl`, `dml`, `dcl`, `admin`. |
| `status` | `success` or `failure` (for auth events). |
| `user` | Username that performed the action. |
| `client` | Client IP address and port. |
| `protocol` | Wire protocol used (`pg`, `mysql`, `resp`, `http`, `grpc`). |
| `method` | Authentication method (for auth events). |
| `statement` | SQL statement (for DDL/DML/DCL events). |
| `action` | Administrative action (for admin events). |
| `reason` | Failure reason (for failed events). |

### Audit Log Rotation

Configure log rotation to prevent the audit log from consuming excessive disk space:

```
# /etc/logrotate.d/thunderdb-audit
/var/log/thunderdb/audit.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 thunder thunder
}
```

---

## Encryption at Rest

ThunderDB supports encrypting data files at rest using AES-256-GCM, protecting data even if physical storage media is compromised.

### Enabling Encryption at Rest

```toml
[security]
encryption_at_rest = true

# Encryption key source:
# "file"   - Read the key from a file
# "env"    - Read the key from an environment variable
# "kms"    - Use AWS KMS, GCP KMS, or Azure Key Vault
encryption_key_source = "file"

# Path to the encryption key file (256-bit key, base64 encoded)
encryption_key_path = "/etc/thunderdb/encryption.key"

# For KMS:
# encryption_kms_key_id = "arn:aws:kms:us-east-1:123456789:key/abcd-1234"
```

### Generating an Encryption Key

```bash
# Generate a 256-bit (32-byte) encryption key
openssl rand -base64 32 > /etc/thunderdb/encryption.key
chmod 600 /etc/thunderdb/encryption.key
chown thunder:thunder /etc/thunderdb/encryption.key
```

### How Encryption at Rest Works

- ThunderDB uses AES-256-GCM (Galois/Counter Mode) for authenticated encryption.
- Each data page is encrypted with a unique nonce (initialization vector) derived from the page ID and a counter.
- WAL records are also encrypted before being written to disk.
- The encryption key is held in memory and never written to unencrypted storage.
- GCM mode provides both confidentiality and integrity (tamper detection).

### Key Rotation

To rotate encryption keys:

1. Generate a new encryption key.
2. Run the key rotation command:

   ```bash
   thunderdb --rotate-encryption-key \
     --old-key /etc/thunderdb/encryption.key.old \
     --new-key /etc/thunderdb/encryption.key
   ```

3. This re-encrypts all data pages and WAL segments with the new key in the background without downtime.

---

## Network Security Best Practices

### Firewall Configuration

Restrict access to ThunderDB ports using firewall rules:

```bash
# Allow PostgreSQL from application servers only
sudo ufw allow from 10.0.1.0/24 to any port 5432

# Allow MySQL from application servers only
sudo ufw allow from 10.0.1.0/24 to any port 3306

# Allow RESP from application servers only
sudo ufw allow from 10.0.1.0/24 to any port 6379

# Allow HTTP admin from monitoring network only
sudo ufw allow from 10.0.2.0/24 to any port 8088

# Allow gRPC from cluster nodes only
sudo ufw allow from 10.0.1.1 to any port 9090
sudo ufw allow from 10.0.1.2 to any port 9090
sudo ufw allow from 10.0.1.3 to any port 9090

# Deny everything else
sudo ufw default deny incoming
sudo ufw enable
```

### Network Segmentation

For production environments, segment networks to isolate different types of traffic:

```
+-------------------+     +-------------------+     +-------------------+
| Application       |     | Database          |     | Management        |
| Network           |     | Network           |     | Network           |
| 10.0.1.0/24       |     | 10.0.2.0/24       |     | 10.0.3.0/24       |
|                   |     |                   |     |                   |
| App Servers       |---->| ThunderDB Nodes   |<----| Monitoring        |
| (PG/MySQL/RESP)   |     | (inter-node gRPC) |     | (HTTP admin)      |
+-------------------+     +-------------------+     +-------------------+
```

### Kubernetes Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: thunderdb-network-policy
  namespace: thunderdb
spec:
  podSelector:
    matchLabels:
      app: thunderdb
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # Allow client traffic from application namespace
    - from:
        - namespaceSelector:
            matchLabels:
              name: application
      ports:
        - protocol: TCP
          port: 5432
        - protocol: TCP
          port: 3306
        - protocol: TCP
          port: 6379
    # Allow monitoring traffic
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 8088
    # Allow inter-node traffic within the cluster
    - from:
        - podSelector:
            matchLabels:
              app: thunderdb
      ports:
        - protocol: TCP
          port: 9090
  egress:
    # Allow inter-node communication
    - to:
        - podSelector:
            matchLabels:
              app: thunderdb
      ports:
        - protocol: TCP
          port: 9090
    # Allow DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
```

---

## Superuser Configuration

The superuser is the initial administrative account created during ThunderDB setup. It has full access to all operations.

### Initial Setup

```toml
[security]
superuser = "admin"
superuser_password = "initial-password"
```

### Production Setup

For production, avoid storing the password in the configuration file:

```bash
# 1. Generate a password hash
thunderdb --hash-password
# Enter password: ********
# Hash: argon2:$argon2id$v=19$m=65536,t=3,p=4$...

# 2. Set via environment variable
export THUNDERDB_SUPERUSER_PASSWORD_HASH="argon2:\$argon2id\$v=19\$m=65536,t=3,p=4\$..."

# 3. Start ThunderDB
thunderdb --config /etc/thunderdb/thunderdb.toml
```

### Changing the Superuser Password

```sql
-- Connect as the current superuser
ALTER USER admin WITH PASSWORD 'new-secure-password';
```

Or regenerate the hash and update the environment variable:

```bash
thunderdb --hash-password
# Update THUNDERDB_SUPERUSER_PASSWORD_HASH and restart
```

---

## Security Hardening Checklist

Use this checklist to verify your ThunderDB deployment is properly secured:

### Authentication and Access Control

- [ ] `authentication_enabled = true` is set in the configuration.
- [ ] The default superuser password has been changed.
- [ ] The superuser password is set via `THUNDERDB_SUPERUSER_PASSWORD_HASH` environment variable, not in the TOML file.
- [ ] Application users are created with minimal required privileges (principle of least privilege).
- [ ] SCRAM-SHA-256 (PostgreSQL) or `caching_sha2_password` (MySQL) is used for authentication.
- [ ] Unused protocols have their ports disabled or firewalled.

### Encryption

- [ ] TLS is enabled (`tls_enabled = true`) for all client-facing protocols.
- [ ] TLS certificates are signed by a trusted CA (not self-signed in production).
- [ ] TLS certificate expiry is monitored and certificates are rotated before expiry.
- [ ] Encryption at rest is enabled for sensitive data.
- [ ] Encryption keys are stored securely (KMS or encrypted file system).

### Network

- [ ] Firewall rules restrict access to only required source IPs/networks.
- [ ] The gRPC port (9090) is only accessible from other cluster nodes.
- [ ] The HTTP admin port (8088) is only accessible from the monitoring/management network.
- [ ] Network segmentation separates application, database, and management traffic.
- [ ] In Kubernetes, NetworkPolicy resources are applied.

### Auditing and Monitoring

- [ ] Audit logging is enabled for authentication, DDL, and DCL events.
- [ ] Audit logs are shipped to a centralized, tamper-resistant log store.
- [ ] Failed authentication attempts trigger alerts.
- [ ] Monitoring is configured for security-relevant metrics.

### Operational

- [ ] ThunderDB runs as a dedicated non-root user (`thunder`).
- [ ] The systemd service file includes security hardening directives (`NoNewPrivileges`, `ProtectSystem`, etc.).
- [ ] File permissions on data, WAL, and configuration directories are restricted to the `thunder` user.
- [ ] Configuration files are not world-readable (`chmod 640`).
- [ ] The ThunderDB binary and dependencies are regularly updated for security patches.
- [ ] Backups are encrypted and access-controlled.
- [ ] A disaster recovery plan is documented and tested.
