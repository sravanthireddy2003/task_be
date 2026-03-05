# =====================================================
# 7) PRODUCTION HARDENING CHECKLIST
# =====================================================

## Index Lifecycle Management (ILM)

### Elasticsearch ILM Policy
```bash
# Create ILM policy
PUT _ilm/policy/audit-logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_size": "50GB"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### Apply to Index Template
```bash
PUT _index_template/audit-logs-template
{
  "index_patterns": ["audit-logs-*"],
  "template": {
    "settings": {
      "index.lifecycle.name": "audit-logs-policy",
      "index.lifecycle.rollover_alias": "audit-logs-write"
    }
  }
}
```

---

## Data Retention Strategy

### MySQL Archive Table
```sql
-- Create archive table
CREATE TABLE audit_logs_archive LIKE audit_logs;

-- Archive old records (run monthly)
INSERT INTO audit_logs_archive 
SELECT * FROM audit_logs 
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Delete archived records
DELETE FROM audit_logs 
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Optimize table
OPTIMIZE TABLE audit_logs;
```

### Automated Archive Script (Cron)
```bash
# Add to crontab (runs 1st of every month at 2 AM)
0 2 1 * * /usr/bin/mysql -u root -p'password' your_db < /path/to/archive_audit_logs.sql
```

---

## MySQL Optimization for Heavy Logging

### 1. Enable Query Cache (if MySQL < 8.0)
```sql
SET GLOBAL query_cache_type = 1;
SET GLOBAL query_cache_size = 67108864; -- 64MB
```

### 2. Increase Buffer Pool
```sql
-- Add to my.cnf
[mysqld]
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 2
```

### 3. Partition audit_logs Table
```sql
ALTER TABLE audit_logs PARTITION BY RANGE (YEAR(createdAt)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

---

## Prevent Blocking Main API

### 1. Use Worker Queue (Bull/Agenda)
```javascript
// src/services/auditQueue.js
const Queue = require('bull');
const auditLogger = require('./auditLogger');

const auditQueue = new Queue('audit-logs', {
  redis: { host: 'localhost', port: 6379 }
});

auditQueue.process(async (job) => {
  await auditLogger.logAudit(job.data);
});

module.exports = {
  enqueue: (data) => auditQueue.add(data, { removeOnComplete: true })
};
```

### 2. Circuit Breaker Pattern
```javascript
// src/services/auditLogger.js (enhanced)
let failureCount = 0;
const CIRCUIT_THRESHOLD = 10;
let circuitOpen = false;

async logAudit(data) {
  if (circuitOpen) {
    logger.warn('Audit circuit open, skipping log');
    return;
  }
  
  try {
    await q(sql, params);
    failureCount = 0;
  } catch (error) {
    failureCount++;
    if (failureCount >= CIRCUIT_THRESHOLD) {
      circuitOpen = true;
      setTimeout(() => { circuitOpen = false; failureCount = 0; }, 60000);
    }
    logger.error('Audit log failed:', error);
  }
}
```

---

## Secure Kibana Role-Based Access

### 1. Create Kibana Roles
```bash
# Admin role (full access)
PUT /_security/role/audit_admin
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["audit-logs-*"],
      "privileges": ["read", "view_index_metadata"]
    }
  ],
  "applications": [
    {
      "application": "kibana-.kibana",
      "privileges": ["all"],
      "resources": ["*"]
    }
  ]
}

# Tenant-specific role
PUT /_security/role/audit_tenant_1
{
  "indices": [
    {
      "names": ["audit-logs-*"],
      "privileges": ["read"],
      "query": "{\"term\": {\"tenant_id\": 1}}"
    }
  ]
}
```

### 2. Create Kibana Users
```bash
POST /_security/user/tenant1_viewer
{
  "password": "strong_password",
  "roles": ["audit_tenant_1", "kibana_user"],
  "full_name": "Tenant 1 Viewer"
}
```

---

## Tenant Isolation Strategy

### 1. Document-Level Security (DLS)
```javascript
// Enforce in Elasticsearch role
{
  "query": {
    "term": {
      "tenant_id": "{{_user.metadata.tenant_id}}"
    }
  }
}
```

### 2. Kibana Spaces Per Tenant
```bash
POST /api/spaces/space
{
  "id": "tenant-1",
  "name": "Tenant 1",
  "disabledFeatures": []
}
```

### 3. API-Level Validation
```javascript
// src/middleware/tenantIsolation.js
async function enforceTenantIsolation(req, res, next) {
  const userTenantId = req.user.tenant_id;
  const requestedTenantId = req.query.tenant_id || req.body.tenant_id;
  
  if (requestedTenantId && requestedTenantId !== userTenantId) {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Tenant access denied' });
    }
  }
  
  req.query.tenant_id = userTenantId;
  next();
}
```

---

## Log Tamper Protection

### 1. Immutable Indices (Elasticsearch)
```bash
PUT audit-logs-2026.02.12/_settings
{
  "index.blocks.write": true
}
```

### 2. MySQL Trigger to Prevent Deletes
```sql
DELIMITER $$
CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs cannot be deleted';
END$$
DELIMITER ;
```

### 3. Blockchain-Style Integrity (Advanced)
```javascript
// Add hash chain
const crypto = require('crypto');

function calculateHash(record, previousHash) {
  const data = JSON.stringify(record) + previousHash;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Store hash in each record
await q(`UPDATE audit_logs SET integrity_hash = ? WHERE id = ?`, 
  [calculateHash(record, previousHash), record.id]
);
```

---

## Performance Monitoring

### 1. Logstash Monitoring
```conf
# Add to logstash.conf
monitoring.enabled: true
monitoring.elasticsearch.hosts: ["http://localhost:9200"]
```

### 2. MySQL Slow Query Log
```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow-query.log';
```

### 3. Application Metrics
```javascript
// src/services/auditLogger.js
const metrics = {
  totalLogs: 0,
  failedLogs: 0,
  avgLatency: 0
};

async logAudit(data) {
  const start = Date.now();
  try {
    await q(sql, params);
    metrics.totalLogs++;
    metrics.avgLatency = (metrics.avgLatency * 0.9) + ((Date.now() - start) * 0.1);
  } catch (error) {
    metrics.failedLogs++;
  }
}

// Expose metrics endpoint
app.get('/metrics/audit', (req, res) => res.json(metrics));
```

---

## Security Best Practices

### 1. Encrypt Sensitive Fields
```javascript
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.AUDIT_ENCRYPTION_KEY;

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Encrypt IP addresses before storage
data.ip_address = encrypt(data.ip_address);
```

### 2. Audit Log Access Auditing
```javascript
// Log who accesses audit logs
router.get('/audit-logs', async (req, res) => {
  await auditLogger.logAudit({
    action: 'AUDIT_LOG_ACCESSED',
    actor_id: req.user._id,
    tenant_id: req.user.tenant_id,
    module: 'Audit',
    details: { viewedBy: req.user.name }
  });
  
  // ... return logs
});
```

---

## Backup Strategy

### 1. Elasticsearch Snapshots
```bash
# Register repository
PUT _snapshot/audit_backup
{
  "type": "fs",
  "settings": {
    "location": "/mnt/backups/elasticsearch"
  }
}

# Create snapshot (daily cron)
PUT _snapshot/audit_backup/snapshot_$(date +%Y%m%d)
{
  "indices": "audit-logs-*",
  "include_global_state": false
}
```

### 2. MySQL Backups
```bash
# Daily backup cron
0 3 * * * mysqldump -u root -p'password' your_db audit_logs | gzip > /backups/audit_logs_$(date +%Y%m%d).sql.gz
```

---

## Deployment Checklist

- [ ] MySQL indexes created
- [ ] Logstash installed (download from elastic.co)
- [ ] MySQL JDBC driver downloaded
- [ ] Logstash config updated with credentials
- [ ] Elasticsearch running
- [ ] Kibana running
- [ ] Index template applied
- [ ] ILM policy created
- [ ] Kibana roles configured
- [ ] Alert rules created
- [ ] Dashboard imported
- [ ] Backup scripts scheduled
- [ ] Monitoring enabled
- [ ] Security hardening applied
- [ ] Load testing completed
- [ ] Documentation updated

---

## Installation Quick Start

```bash
# 1. Start services
systemctl start mysql
systemctl start elasticsearch
systemctl start kibana

# 2. Apply MySQL optimizations
mysql -u root -p < database/audit_logs_optimization.sql

# 3. Start Logstash
/path/to/logstash/bin/logstash -f logstash/logstash.conf

# 4. Apply Elasticsearch template
curl -X PUT "localhost:9200/_index_template/audit-logs-template" \
  -H 'Content-Type: application/json' \
  -d @elasticsearch/audit_logs_mapping.json

# 5. Import Kibana dashboard
# (Use Kibana UI: Stack Management > Saved Objects > Import)

# 6. Update Node.js app
npm install uuid
node index.js
```
