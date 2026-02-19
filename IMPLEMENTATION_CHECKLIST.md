# =====================================================
# COMPLETE IMPLEMENTATION CHECKLIST
# =====================================================

## Phase 1: Database Setup
- [ ] Run SQL optimization script
  ```bash
  mysql -u root -p your_database < database/audit_logs_optimization.sql
  ```
- [ ] Verify indexes created
  ```sql
  SHOW INDEX FROM audit_logs;
  ```
- [ ] Test audit log insertion
  ```sql
  INSERT INTO audit_logs (actor_id, tenant_id, action, entity, entity_id, module, details, createdAt)
  VALUES ('test_user', 1, 'TEST_ACTION', 'Test', 'test_1', 'Test', '{}', NOW());
  ```

---

## Phase 2: Node.js Integration
- [ ] Install UUID package
  ```bash
  npm install uuid
  ```
- [ ] Integrate auditLogger service
  - [ ] Update imports in controllers
  - [ ] Add audit logging calls
- [ ] Add audit middleware to app.js
  ```javascript
  const { auditMiddleware } = require('./src/middleware/auditLogger');
  app.use(auditMiddleware());
  ```
- [ ] Run test script
  ```bash
  node test_audit_system.js
  ```
- [ ] Verify logs in MySQL
  ```sql
  SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 10;
  ```

---

## Phase 3: Download & Install ELK Stack (NO DOCKER)

### Elasticsearch
- [ ] Download from: https://www.elastic.co/downloads/elasticsearch
- [ ] Extract to: `C:\elasticsearch` (Windows) or `/opt/elasticsearch` (Linux)
- [ ] Edit config: `config/elasticsearch.yml`
  ```yaml
  cluster.name: audit-cluster
  network.host: localhost
  http.port: 9200
  ```
- [ ] Start Elasticsearch
  ```bash
  # Windows
  bin\elasticsearch.bat
  
  # Linux
  bin/elasticsearch
  ```
- [ ] Verify running
  ```bash
  curl http://localhost:9200
  ```

### Kibana
- [ ] Download from: https://www.elastic.co/downloads/kibana
- [ ] Extract to: `C:\kibana` (Windows) or `/opt/kibana` (Linux)
- [ ] Edit config: `config/kibana.yml`
  ```yaml
  server.port: 5601
  elasticsearch.hosts: ["http://localhost:9200"]
  ```
- [ ] Start Kibana
  ```bash
  # Windows
  bin\kibana.bat
  
  # Linux
  bin/kibana
  ```
- [ ] Verify running: http://localhost:5601

### Logstash
- [ ] Download from: https://www.elastic.co/downloads/logstash
- [ ] Extract to: `C:\logstash` (Windows) or `/opt/logstash` (Linux)
- [ ] Download MySQL JDBC driver from: https://dev.mysql.com/downloads/connector/j/
- [ ] Extract JAR to: `C:\logstash\drivers\mysql-connector-java-8.0.33.jar`
- [ ] Copy config
  ```bash
  copy logstash\logstash.conf C:\logstash\config\audit_pipeline.conf
  ```
- [ ] Edit config with your credentials
  - [ ] Update MYSQL_USER
  - [ ] Update MYSQL_PASSWORD
  - [ ] Update database name
  - [ ] Update JDBC driver path
- [ ] Test configuration
  ```bash
  bin\logstash.bat -f config\audit_pipeline.conf --config.test_and_exit
  ```
- [ ] Start Logstash
  ```bash
  bin\logstash.bat -f config\audit_pipeline.conf
  ```

---

## Phase 4: Elasticsearch Configuration
- [ ] Apply index template
  ```bash
  # Option 1: Use PowerShell script
  .\scripts\setup_elasticsearch.ps1
  
  # Option 2: Manual
  curl -X PUT "localhost:9200/_index_template/audit-logs-template" `
    -H 'Content-Type: application/json' `
    -d @elasticsearch\audit_logs_mapping.json
  ```
- [ ] Create ILM policy (included in script above)
- [ ] Verify template applied
  ```bash
  curl http://localhost:9200/_index_template/audit-logs-template?pretty
  ```
- [ ] Wait 1-2 minutes for Logstash to create first index
- [ ] Verify data indexed
  ```bash
  curl "http://localhost:9200/audit-logs-*/_search?pretty&size=5"
  ```

---

## Phase 5: Kibana Dashboard Setup
- [ ] Open Kibana: http://localhost:5601
- [ ] Create index pattern
  - [ ] Pattern: `audit-logs-*`
  - [ ] Time field: `@timestamp`
- [ ] Verify data in Discover
- [ ] Follow guide: `kibana/dashboard_setup_guide.md`
- [ ] Create visualizations:
  - [ ] Failed Logins Over Time
  - [ ] Login Activity Spikes
  - [ ] Task Status Distribution
  - [ ] Task Completion Trend
  - [ ] Top Active Users
  - [ ] Approval Workflow Transitions
  - [ ] Escalation Count
- [ ] Create dashboard
  - [ ] Add all visualizations
  - [ ] Add tenant_id filter
  - [ ] Add module/action controls
- [ ] Save dashboard
- [ ] Export dashboard JSON

---

## Phase 6: Alert Configuration
- [ ] Navigate to Stack Management > Rules and Connectors
- [ ] Create email connector
  - [ ] Name: "Security Alerts"
  - [ ] Configure SMTP settings
- [ ] Create rules from `kibana/alert_rules.json`:
  - [ ] Suspicious Login Spikes (>5 failed logins in 5 min)
  - [ ] Escalation Flood (>10 escalations in 10 min)
  - [ ] Budget Modification (immediate)
  - [ ] After-Hours Admin Activity
  - [ ] Mass Data Deletion (>20 deletes in 1 hour)
- [ ] Test each alert rule
- [ ] Configure notification channels (email, Slack, webhook)

---

## Phase 7: Security Hardening
- [ ] Configure role-based access in Elasticsearch
  ```bash
  # Create tenant-specific roles
  curl -X PUT "localhost:9200/_security/role/audit_tenant_1" ...
  ```
- [ ] Create Kibana users per tenant
- [ ] Enable document-level security (DLS)
- [ ] Create Kibana Spaces per tenant (optional)
- [ ] Add tenant isolation middleware to API
- [ ] Enable MySQL trigger to prevent audit log deletion
  ```sql
  CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_logs ...
  ```
- [ ] Configure SSL/TLS for Elasticsearch (production)
- [ ] Configure SSL/TLS for Kibana (production)

---

## Phase 8: Production Optimization
- [ ] Enable MySQL partitioning
  ```sql
  ALTER TABLE audit_logs PARTITION BY RANGE (YEAR(createdAt)) ...
  ```
- [ ] Set up MySQL archive process (cron job)
- [ ] Configure Elasticsearch snapshot repository
- [ ] Schedule daily snapshots
- [ ] Set up MySQL daily backups
- [ ] Configure monitoring
  - [ ] Logstash monitoring
  - [ ] Elasticsearch cluster health
  - [ ] Application metrics endpoint
- [ ] Load test with production-like data
- [ ] Tune Elasticsearch heap size
- [ ] Tune MySQL buffer pool
- [ ] Optimize Logstash JVM settings

---

## Phase 9: Integration Testing
- [ ] Test login success audit
- [ ] Test login failure audit
- [ ] Test task creation audit
- [ ] Test task status change audit
- [ ] Test approval workflow audit
- [ ] Test multi-tenant isolation
- [ ] Verify tenant_id filter in Kibana
- [ ] Test alert triggers
- [ ] Verify data retention (archive)
- [ ] Test backup/restore procedure

---

## Phase 10: Documentation & Training
- [ ] Document deployment procedure
- [ ] Document troubleshooting steps
- [ ] Create user guide for Kibana dashboard
- [ ] Train admin users
- [ ] Train managers on their filtered views
- [ ] Document backup/restore process
- [ ] Document incident response using audit logs
- [ ] Create runbook for common issues

---

## Phase 11: Go-Live Checklist
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Backup procedures tested
- [ ] Monitoring alerts configured
- [ ] Runbooks documented
- [ ] Users trained
- [ ] Rollback plan prepared
- [ ] Production credentials secured
- [ ] SSL certificates installed
- [ ] Firewall rules configured
- [ ] DNS entries updated (if needed)

---

## Monitoring & Maintenance

### Daily
- [ ] Check Elasticsearch cluster health
- [ ] Check Logstash pipeline status
- [ ] Review critical alerts

### Weekly
- [ ] Review audit log volume trends
- [ ] Check disk space usage
- [ ] Review failed login patterns
- [ ] Analyze top users by activity

### Monthly
- [ ] Archive old audit logs
- [ ] Review and optimize indexes
- [ ] Test backup restore
- [ ] Review ILM policy effectiveness
- [ ] Update dashboard visualizations

### Quarterly
- [ ] Security audit of access logs
- [ ] Performance tuning review
- [ ] Update documentation
- [ ] Review alert thresholds

---

## Troubleshooting Quick Reference

### No data in Elasticsearch
1. Check Logstash logs
2. Verify MySQL connection
3. Check last_run timestamp
4. Verify Elasticsearch is running

### Kibana dashboard empty
1. Check index pattern
2. Verify time range
3. Check data count in ES
4. Verify tenant_id filter

### Slow performance
1. Check MySQL indexes
2. Review Logstash poll interval
3. Check ES heap size
4. Review ILM policy

### Alerts not firing
1. Verify rule enabled
2. Check connector configuration
3. Review query syntax
4. Test data matches threshold

---

## Success Criteria
- ✓ Audit logs written to MySQL in <100ms
- ✓ Data appears in Elasticsearch within 2 minutes
- ✓ Dashboard loads in <3 seconds
- ✓ Tenant isolation verified
- ✓ Alerts fire within 1 minute of threshold
- ✓ 99.9% uptime for logging
- ✓ Zero data loss
- ✓ All user roles can access their data
- ✓ Backup/restore tested successfully

---

## Support Contacts
- MySQL DBA: [contact]
- Elasticsearch Admin: [contact]
- Application Team: [contact]
- Security Team: [contact]
