# =====================================================
# REAL IMPLEMENTATION GUIDE - PHASE BY PHASE
# =====================================================

## ✅ COMPLETED
- [x] Elasticsearch running on https://localhost:9200/
- [x] Kibana running on http://localhost:5601/app/home#/
- [x] npm install uuid completed

---

## 🚀 PHASE 1: APPLY ELASTICSEARCH INDEX TEMPLATE (5 MINUTES)

### Step 1.1: Verify Elasticsearch Connection
```powershell
# Test Elasticsearch is accessible
Invoke-RestMethod -Uri "https://localhost:9200" -SkipCertificateCheck
```

### Step 1.2: Apply Index Template
```powershell
# Run the setup script
cd C:\Users\Administrator\Pictures\TM\TM-F\task_be
.\scripts\setup_elasticsearch.ps1
```

**OR manually:**
```powershell
# Load the template file
$templatePath = ".\elasticsearch\audit_logs_mapping.json"
$templateContent = Get-Content $templatePath -Raw

# Apply to Elasticsearch
Invoke-RestMethod -Uri "https://localhost:9200/_index_template/audit-logs-template" `
  -Method Put `
  -ContentType "application/json" `
  -Body $templateContent `
  -SkipCertificateCheck
```

### Step 1.3: Verify Template Applied
```powershell
# Check template exists
Invoke-RestMethod -Uri "https://localhost:9200/_index_template/audit-logs-template" `
  -Method Get `
  -SkipCertificateCheck | ConvertTo-Json -Depth 10
```

---

## 🚀 PHASE 2: CONFIGURE LOGSTASH (10 MINUTES)

### Step 2.1: Download MySQL JDBC Driver
1. Download from: https://dev.mysql.com/downloads/connector/j/
2. Select: **Platform Independent**
3. Download: ZIP Archive
4. Extract the JAR file (e.g., `mysql-connector-java-8.0.33.jar`)
5. Place it in a known location (e.g., `C:\logstash\drivers\`)

### Step 2.2: Update Logstash Configuration
Edit: `C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf`

**Update these lines:**
```conf
# Line 7-8: Update MySQL connection
jdbc_connection_string => "jdbc:mysql://localhost:3306/YOUR_DATABASE_NAME?useSSL=false&serverTimezone=UTC"
jdbc_user => "YOUR_MYSQL_USERNAME"
jdbc_password => "YOUR_MYSQL_PASSWORD"

# Line 10: Update JDBC driver path
jdbc_driver_library => "C:/logstash/drivers/mysql-connector-java-8.0.33.jar"
```

### Step 2.3: Update Elasticsearch Output
```conf
# Line 96-99: Update Elasticsearch output (if using HTTPS)
elasticsearch {
  hosts => ["https://localhost:9200"]
  index => "audit-logs-%{[@metadata][index_date]}"
  ssl_certificate_verification => false
  user => "elastic"
  password => "YOUR_ES_PASSWORD"
}
```

### Step 2.4: Test Logstash Configuration
```powershell
cd C:\logstash
.\bin\logstash.bat -f C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf --config.test_and_exit
```

---

## 🚀 PHASE 3: RUN DATABASE OPTIMIZATION (5 MINUTES)

### Step 3.1: Apply SQL Changes
```powershell
# Connect to MySQL and run the optimization script
mysql -u root -p YOUR_DATABASE_NAME < C:\Users\Administrator\Pictures\TM\TM-F\task_be\database\audit_logs_optimization.sql
```

**OR using MySQL Workbench:**
1. Open MySQL Workbench
2. Connect to your database
3. Open file: `database/audit_logs_optimization.sql`
4. Execute the script

### Step 3.2: Verify Indexes Created
```sql
-- Run in MySQL
USE your_database_name;
SHOW INDEX FROM audit_logs;
```

You should see indexes:
- idx_audit_tenant_created
- idx_audit_module_action
- idx_audit_created
- idx_audit_actor
- idx_audit_entity
- idx_audit_correlation
- idx_audit_tenant_module
- idx_audit_tenant_module_action_created

---

## 🚀 PHASE 4: INTEGRATE AUDIT LOGGER INTO YOUR APP (15 MINUTES)

### Step 4.1: Update Your App.js
Add the audit middleware:

```javascript
// In your src/app.js (after other middleware)
const { auditMiddleware } = require('./middleware/auditLogger');

// Add audit middleware globally
app.use(auditMiddleware());

// Now all routes have access to req.audit.log()
```

### Step 4.2: Update AuthController.js
Add audit logging to login:

```javascript
// In src/controllers/AuthController.js
const auditLogger = require('../services/auditLogger');

// In your login success handler:
await auditLogger.logAudit({
  action: 'LOGIN_SUCCESS',
  tenant_id: user.tenant_id,
  actor_id: user._id,
  module: 'Auth',
  entity: 'User',
  entity_id: user._id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  correlation_id: req.correlationId,
  details: {
    email: user.email,
    role: user.role,
    loginMethod: 'email_password'
  }
});

// In your login failure handler:
await auditLogger.logAudit({
  action: 'LOGIN_FAILED',
  tenant_id: null,
  actor_id: 'anonymous',
  module: 'Auth',
  entity: 'User',
  entity_id: null,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  correlation_id: req.correlationId,
  details: {
    email: req.body.email,
    reason: 'Invalid credentials',
    attemptsLeft: 3
  }
});
```

### Step 4.3: Update Tasks.js
Add audit logging to task operations:

```javascript
// In src/controllers/Tasks.js
const auditLogger = require('../services/auditLogger');

// In createTask:
await auditLogger.logAudit({
  action: 'TASK_CREATED',
  tenant_id: req.user.tenant_id,
  actor_id: req.user._id,
  module: 'Tasks',
  entity: 'Task',
  entity_id: newTask.id || newTask.public_id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  correlation_id: req.correlationId,
  details: {
    taskName: newTask.name,
    assignedTo: newTask.assigned_to,
    projectId: newTask.project_id,
    priority: newTask.priority
  },
  new_value: {
    status: newTask.status,
    priority: newTask.priority
  }
});

// In updateTaskStatus:
await auditLogger.logAudit({
  action: 'TASK_STATUS_CHANGED',
  tenant_id: req.user.tenant_id,
  actor_id: req.user._id,
  module: 'Tasks',
  entity: 'Task',
  entity_id: taskId,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  correlation_id: req.correlationId,
  details: {
    taskName: task.name,
    previousStatus: task.status,
    newStatus: req.body.status
  },
  previous_value: { status: task.status },
  new_value: { status: req.body.status }
});
```

### Step 4.4: Update Projects.js
```javascript
// In src/controllers/Projects.js
const auditLogger = require('../services/auditLogger');

// In createProject:
await auditLogger.logAudit({
  action: 'PROJECT_CREATED',
  tenant_id: req.user.tenant_id,
  actor_id: req.user._id,
  module: 'Projects',
  entity: 'Project',
  entity_id: newProject.id || newProject.public_id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  correlation_id: req.correlationId,
  details: {
    projectName: newProject.name,
    managerId: newProject.manager_id,
    clientId: newProject.client_id
  }
});
```

---

## 🚀 PHASE 5: TEST END-TO-END FLOW (10 MINUTES)

### Step 5.1: Run Test Script
```powershell
cd C:\Users\Administrator\Pictures\TM\TM-F\task_be
node test_audit_system.js
```

### Step 5.2: Verify Data in MySQL
```sql
SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 20;
```

You should see test records with:
- tenant_id
- action
- module
- details (JSON)

### Step 5.3: Start Logstash
```powershell
cd C:\logstash
.\bin\logstash.bat -f C:\Users\Administrator\Pictures\TM\TM-F\task_be\logstash\logstash.conf
```

**Watch for:**
- JDBC connection success
- Records being read from MySQL
- Records indexed to Elasticsearch

### Step 5.4: Wait 1-2 Minutes
Logstash polls every 1 minute, so wait for the first poll cycle.

### Step 5.5: Verify Data in Elasticsearch
```powershell
# Check if index was created
Invoke-RestMethod -Uri "https://localhost:9200/_cat/indices/audit-logs-*?v" `
  -Method Get `
  -SkipCertificateCheck

# Check record count
Invoke-RestMethod -Uri "https://localhost:9200/audit-logs-*/_count" `
  -Method Get `
  -SkipCertificateCheck

# View first 5 records
Invoke-RestMethod -Uri "https://localhost:9200/audit-logs-*/_search?size=5&pretty" `
  -Method Get `
  -SkipCertificateCheck
```

---

## 🚀 PHASE 6: CREATE KIBANA DASHBOARD (20 MINUTES)

### Step 6.1: Create Index Pattern
1. Open Kibana: http://localhost:5601
2. Go to **Stack Management** (bottom left gear icon)
3. Click **Index Patterns** (under Kibana)
4. Click **Create index pattern**
5. Enter: `audit-logs-*`
6. Click **Next step**
7. Select time field: **@timestamp**
8. Click **Create index pattern**

### Step 6.2: Verify Data in Discover
1. Go to **Discover** (top left menu)
2. Select index pattern: `audit-logs-*`
3. Set time range: **Last 7 days**
4. You should see your audit log records

### Step 6.3: Create Visualizations

Follow the detailed guide in:
`C:\Users\Administrator\Pictures\TM\TM-F\task_be\kibana\dashboard_setup_guide.md`

**Quick Summary:**

**Visualization 1: Failed Logins Over Time**
- Type: Line chart
- Metrics: Count
- Buckets: Date Histogram on @timestamp
- Filter: `action: LOGIN_FAILED`

**Visualization 2: Task Status Distribution**
- Type: Pie chart
- Metrics: Count
- Buckets: Terms on `action.keyword`
- Filter: `module: Tasks`

**Visualization 3: Top Active Users**
- Type: Bar chart
- Metrics: Count
- Buckets: Terms on `actor_id.keyword`
- Order: Descending
- Size: 10

### Step 6.4: Create Dashboard
1. Go to **Dashboard**
2. Click **Create dashboard**
3. Click **Add** → Select your visualizations
4. Arrange the panels
5. Click **Save**
6. Name: "Audit Analytics Dashboard"

### Step 6.5: Add Tenant Filter
1. In dashboard, click **Add filter**
2. Field: `tenant_id`
3. Operator: `is`
4. Enable: **Pin across all apps**
5. Save dashboard

---

## 🚀 PHASE 7: PRODUCTION TESTING (15 MINUTES)

### Step 7.1: Restart Your Node.js App
```powershell
# Stop current app (Ctrl+C)
# Start with audit logging enabled
node index.js

# OR if using nodemon
npm run dev
```

### Step 7.2: Test Real User Actions

**Test Login:**
1. Open your app
2. Login successfully
3. Check MySQL: `SELECT * FROM audit_logs WHERE action='LOGIN_SUCCESS' ORDER BY createdAt DESC LIMIT 1;`
4. Wait 1 minute
5. Check Kibana Discover for the login event

**Test Task Creation:**
1. Create a new task in your app
2. Check MySQL for TASK_CREATED event
3. Wait 1 minute
4. Check Kibana Discover

**Test Multi-Tenant:**
1. Login as users from different tenants
2. Verify tenant_id is captured
3. In Kibana, filter by tenant_id
4. Verify only that tenant's data appears

### Step 7.3: Performance Test
```javascript
// Create a quick performance test
const auditLogger = require('./src/services/auditLogger');

async function perfTest() {
  const start = Date.now();
  
  // Log 100 events
  for (let i = 0; i < 100; i++) {
    await auditLogger.logAudit({
      action: 'PERF_TEST',
      tenant_id: 1,
      actor_id: 'test_user',
      module: 'Test',
      entity: 'Test',
      entity_id: i.toString(),
      details: { iteration: i }
    });
  }
  
  const end = Date.now();
  console.log(`100 audit logs took ${end - start}ms`);
  console.log(`Average per log: ${(end - start) / 100}ms`);
}

perfTest();
```

**Expected:** <100ms per log

---

## 🚀 PHASE 8: SET UP ALERTS (10 MINUTES)

### Step 8.1: Create Email Connector
1. In Kibana, go to **Stack Management**
2. Click **Rules and Connectors**
3. Click **Connectors** tab
4. Click **Create connector**
5. Select **Email**
6. Configure SMTP settings:
   - Service: Gmail (or your provider)
   - Host: smtp.gmail.com
   - Port: 587
   - Secure: false
   - From: your-email@gmail.com
   - User: your-email@gmail.com
   - Password: app-specific password
7. Test and save

### Step 8.2: Create Alert Rule - Failed Logins
1. Go to **Stack Management** → **Rules and Connectors**
2. Click **Create rule**
3. Select **Elasticsearch query**
4. Configure:
   - Name: "Suspicious Login Spikes"
   - Index: `audit-logs-*`
   - Query: `action: LOGIN_FAILED`
   - Threshold: IS ABOVE 5
   - For the last: 5 minutes
   - Group by: `tenant_id`, `ip_address.keyword`
5. Add action → Select email connector
6. Configure email message
7. Save and enable

---

## ✅ VERIFICATION CHECKLIST

### MySQL
- [ ] audit_logs table has new columns (module, ip_address, etc.)
- [ ] Indexes created successfully
- [ ] Test records inserted successfully

### Elasticsearch
- [ ] Index template applied
- [ ] Indices created (audit-logs-YYYY.MM.DD)
- [ ] Data visible in indices
- [ ] Field mappings correct

### Logstash
- [ ] Configuration file updated with credentials
- [ ] JDBC driver path correct
- [ ] Logstash running without errors
- [ ] Data flowing from MySQL to Elasticsearch

### Node.js Application
- [ ] Audit service integrated
- [ ] Middleware applied
- [ ] Real user actions logged
- [ ] Performance acceptable (<100ms)

### Kibana
- [ ] Index pattern created
- [ ] Data visible in Discover
- [ ] Visualizations created
- [ ] Dashboard created and working
- [ ] Tenant filter functional
- [ ] Alert rules configured

---

## 🔧 TROUBLESHOOTING

### Issue: No data in Elasticsearch
**Solution:**
1. Check Logstash logs for errors
2. Verify MySQL connection in logstash.conf
3. Check JDBC driver path
4. Verify last_run timestamp file

### Issue: Elasticsearch connection refused
**Solution:**
1. Check if Elasticsearch is running
2. Verify the URL (http vs https)
3. Add `-SkipCertificateCheck` for HTTPS
4. Check Elasticsearch credentials

### Issue: Kibana dashboard empty
**Solution:**
1. Verify index pattern matches data
2. Check time range (try Last 30 days)
3. Remove filters temporarily
4. Verify data in Discover first

### Issue: Slow audit logging
**Solution:**
1. Check MySQL indexes
2. Review circuit breaker status
3. Consider async queue (Bull/Redis)
4. Check database connection pool

---

## 📞 NEXT STEPS AFTER IMPLEMENTATION

1. **Monitor** Logstash for 24 hours
2. **Review** dashboard daily for patterns
3. **Test** alert rules (trigger intentionally)
4. **Optimize** visualizations based on usage
5. **Train** users on dashboard access
6. **Document** custom workflows
7. **Plan** for scale (ILM, archiving)
8. **Security** review and hardening

---

## 🎉 SUCCESS CRITERIA

- ✅ Audit logs written to MySQL in <100ms
- ✅ Logstash syncing every 1 minute
- ✅ Data appears in Elasticsearch within 2 minutes
- ✅ Kibana dashboard loads in <3 seconds
- ✅ Tenant filtering works correctly
- ✅ Alerts trigger on threshold violations
- ✅ All modules logging correctly
- ✅ No data loss during operation

**When all checkboxes are complete, your audit system is production-ready!**
