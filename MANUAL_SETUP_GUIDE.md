# =====================================================
# PHASE 1: ELASTICSEARCH SETUP - MANUAL STEPS
# =====================================================

## Current Status
✅ Elasticsearch running
✅ Kibana running at http://localhost:5601
✅ npm install uuid completed

---

## STEP 1: Apply Index Template to Elasticsearch

### Option A: Using PowerShell Script (Recommended)
```powershell
cd C:\Users\Administrator\Pictures\TM\TM-F\task_be
.\scripts\quick_setup.ps1
```

### Option B: Using Kibana Dev Tools (Manual - Most Reliable)

1. **Open Kibana Dev Tools:**
   - Go to: http://localhost:5601
   - Click hamburger menu (≡ top left)
   - Scroll down to **Management** section
   - Click **Dev Tools**

2. **Copy and paste this entire command:**

```json
PUT _index_template/audit-logs-template
{
  "index_patterns": ["audit-logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index": {
        "refresh_interval": "30s"
      }
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "id": {
          "type": "long"
        },
        "actor_id": {
          "type": "keyword"
        },
        "tenant_id": {
          "type": "integer"
        },
        "action": {
          "type": "keyword"
        },
        "entity": {
          "type": "keyword"
        },
        "entity_id": {
          "type": "keyword"
        },
        "module": {
          "type": "keyword"
        },
        "ip_address": {
          "type": "ip"
        },
        "user_agent": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "correlation_id": {
          "type": "keyword"
        },
        "details": {
          "type": "text"
        },
        "details_parsed": {
          "type": "object",
          "enabled": true
        },
        "previous_value": {
          "type": "text"
        },
        "previous_value_parsed": {
          "type": "object",
          "enabled": true
        },
        "new_value": {
          "type": "text"
        },
        "new_value_parsed": {
          "type": "object",
          "enabled": true
        },
        "createdAt": {
          "type": "date",
          "format": "yyyy-MM-dd HH:mm:ss||strict_date_optional_time||epoch_millis"
        },
        "log_type": {
          "type": "keyword"
        }
      }
    }
  }
}
```

3. **Click the green ▶ (Run) button** or press Ctrl+Enter

4. **You should see:**
```json
{
  "acknowledged": true
}
```

5. **Verify the template was created:**
```json
GET _index_template/audit-logs-template
```

---

## STEP 2: Create ILM Policy (Optional but Recommended)

In Kibana Dev Tools, run:

```json
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
          }
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

---

## STEP 3: Run Database Optimization

### Check Your Database Name
First, identify your database name from your .env file or config.

### Run SQL Optimization
```powershell
# Replace YOUR_DATABASE_NAME with your actual database name
mysql -u root -p YOUR_DATABASE_NAME < C:\Users\Administrator\Pictures\TM\TM-F\task_be\database\audit_logs_optimization.sql
```

**OR using MySQL Workbench:**
1. Open MySQL Workbench
2. Connect to your database
3. File → Open SQL Script
4. Select: `C:\Users\Administrator\Pictures\TM\TM-F\task_be\database\audit_logs_optimization.sql`
5. Click Execute (⚡)

### Verify Indexes
```sql
USE your_database_name;
SHOW INDEX FROM audit_logs;
```

You should see these indexes:
- idx_audit_tenant_created
- idx_audit_module_action
- idx_audit_created
- idx_audit_actor
- idx_audit_entity
- idx_audit_correlation
- idx_audit_tenant_module

---

## STEP 4: Test Audit Logger

```powershell
cd C:\Users\Administrator\Pictures\TM\TM-F\task_be
node test_audit_system.js
```

### Verify in MySQL
```sql
SELECT 
  id, action, module, tenant_id, actor_id, 
  DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i:%s') as created
FROM audit_logs 
ORDER BY createdAt DESC 
LIMIT 20;
```

You should see test records like:
- TEST_ACTION
- LOGIN_SUCCESS
- LOGIN_FAILED
- TASK_CREATED
- TASK_STATUS_CHANGED
- etc.

---

## STEP 5: Integrate into Your Application

### 5.1: Update src/app.js

Find your Express app initialization and add:

```javascript
// After your existing middleware (body-parser, cors, etc.)
const { auditMiddleware } = require('./middleware/auditLogger');

// Add audit middleware
app.use(auditMiddleware());

// Now all routes have req.audit.log() available
```

### 5.2: Add to AuthController.js

```javascript
// At the top
const auditLogger = require('../services/auditLogger');

// In your login success handler (find where you return JWT token):
await auditLogger.logAudit({
  action: 'LOGIN_SUCCESS',
  tenant_id: user.tenant_id,
  actor_id: user._id,
  module: 'Auth',
  entity: 'User',
  entity_id: user._id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  details: {
    email: user.email,
    role: user.role
  }
});

// In your login failure handler:
await auditLogger.logAudit({
  action: 'LOGIN_FAILED',
  tenant_id: null,
  actor_id: 'anonymous',
  module: 'Auth',
  entity: 'User',
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  details: {
    email: req.body.email,
    reason: 'Invalid credentials'
  }
});
```

### 5.3: Test Your Application

1. Restart your Node.js app
2. Login to your application
3. Check MySQL:
```sql
SELECT * FROM audit_logs WHERE action='LOGIN_SUCCESS' ORDER BY createdAt DESC LIMIT 5;
```

You should see real login events!

---

## STEP 6: Setup Logstash (Next Phase)

Before starting Logstash, you need:

### 6.1: Download MySQL JDBC Driver
1. Go to: https://dev.mysql.com/downloads/connector/j/
2. Download: **Platform Independent** ZIP
3. Extract the JAR file (e.g., `mysql-connector-java-8.0.33.jar`)
4. Note the full path

### 6.2: Determine Your Logstash Installation
Where did you install Logstash?
- Example: `C:\logstash` or `C:\elasticsearch-8.x.x\logstash`

### 6.3: Update Logstash Config

Edit: `C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf`

Update these values:
```conf
jdbc_connection_string => "jdbc:mysql://localhost:3306/YOUR_DATABASE_NAME?useSSL=false&serverTimezone=UTC"
jdbc_user => "YOUR_MYSQL_USERNAME"
jdbc_password => "YOUR_MYSQL_PASSWORD"
jdbc_driver_library => "C:/path/to/mysql-connector-java-8.0.33.jar"
```

And Elasticsearch output:
```conf
elasticsearch {
  hosts => ["http://localhost:9200"]  # or https if using SSL
  index => "audit-logs-%{[@metadata][index_date]}"
}
```

---

## STEP 7: Start Logstash

```powershell
# Navigate to your Logstash installation
cd C:\logstash  # or wherever you installed it

# Test configuration first
.\bin\logstash.bat -f C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf --config.test_and_exit

# If test passes, start Logstash
.\bin\logstash.bat -f C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf
```

Watch for:
```
[INFO] Successfully connected to database
[INFO] Starting pipeline
```

---

## STEP 8: Verify End-to-End

### 8.1: Wait 1-2 minutes for first poll

### 8.2: Check Elasticsearch indices

In Kibana Dev Tools:
```json
GET _cat/indices/audit-logs-*?v
```

You should see index like: `audit-logs-2026.02.12`

### 8.3: Check data count
```json
GET audit-logs-*/_count
```

### 8.4: View sample data
```json
GET audit-logs-*/_search
{
  "size": 5,
  "sort": [
    {
      "@timestamp": {
        "order": "desc"
      }
    }
  ]
}
```

---

## STEP 9: Create Kibana Index Pattern

1. Go to Kibana: http://localhost:5601
2. Click **☰** (hamburger menu)
3. **Stack Management** → **Index Patterns**
4. **Create index pattern**
5. Enter: `audit-logs-*`
6. Click **Next**
7. Time field: **@timestamp**
8. Click **Create**

---

## STEP 10: View Data in Discover

1. Click **☰** → **Discover**
2. Select: `audit-logs-*`
3. Time range: **Last 7 days**
4. You should see your audit log data!

---

## ✅ VERIFICATION CHECKLIST

- [ ] Elasticsearch template applied (checked in Kibana Dev Tools)
- [ ] Database optimization SQL executed
- [ ] Indexes created in MySQL
- [ ] Test script runs successfully (test_audit_system.js)
- [ ] Test data visible in MySQL
- [ ] Audit logger integrated into app.js
- [ ] Login events logged from real application
- [ ] Logstash configuration updated
- [ ] MySQL JDBC driver downloaded and configured
- [ ] Logstash started without errors
- [ ] Elasticsearch index created (audit-logs-*)
- [ ] Data visible in Elasticsearch
- [ ] Kibana index pattern created
- [ ] Data visible in Kibana Discover

---

## 🔧 TROUBLESHOOTING

### "Cannot connect to Elasticsearch"
- Verify Elasticsearch is running
- Check URL: http://localhost:9200 OR https://localhost:9200
- Try accessing in browser

### "Template not applied"
- Use Kibana Dev Tools method (most reliable)
- Check for typos in JSON
- Verify Elasticsearch is running

### "No data in MySQL"
- Check database name is correct
- Verify audit_logs table exists
- Run: `DESCRIBE audit_logs;`

### "Logstash not connecting to MySQL"
- Verify JDBC driver path is correct
- Check MySQL credentials
- Check database name
- Verify MySQL is accepting connections

### "No data in Elasticsearch"
- Check Logstash logs for errors
- Verify Logstash is running
- Check Elasticsearch URL in logstash.conf
- Wait 1-2 minutes for first poll

---

## 📞 WHAT TO PROVIDE IF YOU NEED HELP

1. Your database name
2. Your Logstash installation path
3. Your Elasticsearch URL (http or https)
4. Any error messages from:
   - Logstash logs
   - Node.js application
   - MySQL queries
   - Elasticsearch responses

---

## 🎉 SUCCESS!

When you can see audit log data in Kibana Discover, you're ready to:
- Create visualizations
- Build dashboard
- Set up alerts
- Go to production!

Follow: `kibana/dashboard_setup_guide.md` for dashboard creation.
