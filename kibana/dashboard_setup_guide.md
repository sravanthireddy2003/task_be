# =====================================================
# 5) KIBANA DASHBOARD SETUP GUIDE
# =====================================================

## Prerequisites
1. Elasticsearch running on localhost:9200
2. Kibana running on localhost:5601
3. Logstash pipeline active and ingesting data
4. Audit logs data indexed in Elasticsearch

---

## Step 1: Create Index Pattern

1. Navigate to **Stack Management** > **Index Patterns**
2. Click **Create index pattern**
3. Enter index pattern: `demo-logs-audit-*`
4. Click **Next step**
5. Select **@timestamp** as time field
6. Click **Create index pattern**

---

## Step 2: Verify Data

1. Go to **Discover**
2. Select `demo-logs-audit-*` index pattern
3. Set time range to **Last 7 days**
4. Verify data is appearing

---

## Step 3: Create Visualizations

### A) Security - Failed Logins Over Time

1. Go to **Visualize** > **Create visualization**
2. Select **Line** chart
3. Choose `audit-logs-*` index pattern
4. **Metrics:**
   - Y-axis: Count
5. **Buckets:**
   - X-axis: Date Histogram
   - Field: @timestamp
   - Interval: Auto
6. **Filters:**
   - Add filter: `action: LOGIN_FAILED`
7. Save as: **"Failed Logins Over Time"**

---

### B) Security - Suspicious Login Spikes

1. Create **Area** chart
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Y-axis: Count
4. **Buckets:**
   - X-axis: Date Histogram (@timestamp, 1 hour)
5. **Filters:**
   - `action: LOGIN_FAILED OR action: LOGIN_SUCCESS`
6. **Split series:**
   - Sub-aggregation: Terms
   - Field: action.keyword
   - Size: 5
7. Save as: **"Login Activity Spikes"**

---

### C) Task Analytics - Status Distribution Pie

1. Create **Pie** chart
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Slice size: Count
4. **Buckets:**
   - Split slices: Terms
   - Field: details_parsed.newStatus.keyword (or action.keyword)
   - Size: 10
5. **Filters:**
   - `module: Tasks AND action: TASK_STATUS_CHANGED`
6. Save as: **"Task Status Distribution"**

---

### D) Task Analytics - Completed vs Pending Trend

1. Create **Line** chart
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Y-axis: Count
4. **Buckets:**
   - X-axis: Date Histogram (@timestamp, Daily)
5. **Split series:**
   - Sub-aggregation: Filters
   - Filter 1: `action: TASK_COMPLETED`
   - Filter 2: `action: TASK_CREATED`
6. Save as: **"Task Completion Trend"**

---

### E) User Productivity - Top Users by Activity

1. Create **Bar** chart (horizontal)
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Y-axis: Count
4. **Buckets:**
   - X-axis: Terms
   - Field: actor_id.keyword
   - Order: Descending
   - Size: 10
5. **Filters:**
   - `module: Tasks OR module: Projects`
6. Save as: **"Top Active Users"**

---

### F) Workflow - Approval Transitions

1. Create **Data Table**
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Metric: Count
4. **Buckets:**
   - Split rows: Terms (action.keyword)
   - Split rows: Terms (details_parsed.fromState.keyword)
   - Split rows: Terms (details_parsed.toState.keyword)
5. **Filters:**
   - `module: Approvals OR module: Workflow`
6. Save as: **"Approval Workflow Transitions"**

---

### G) Workflow - Escalation Events

1. Create **Metric** visualization
2. Index pattern: `audit-logs-*`
3. **Metrics:**
   - Metric: Count
4. **Filters:**
   - `action: ESCALATION_TRIGGERED OR action: APPROVAL_ESCALATED`
5. Add custom label: "Total Escalations"
6. Save as: **"Escalation Count"**

---

### H) App Health - API Response Times

1. Go to **Visualize** > **Create visualization**
2. Select **Line** chart
3. Choose `demo-logs-app-*` index pattern
4. **Metrics:**
   - Y-axis: Average bucket (`durationMs`)
5. **Buckets:**
   - X-axis: Date Histogram (@timestamp, Auto)
6. Save as: **"API Response Times"**

---

### I) App Health - Error Rates

1. Create **Pie** chart
2. Index pattern: `demo-logs-app-*`
3. **Metrics:**
   - Slice size: Count
4. **Buckets:**
   - Split slices: Terms
   - Field: statusCode
5. **Filters:**
   - `statusCode >= 400`
6. Save as: **"Error Code Distribution"**

---

## Step 4: Create Dashboard

1. Go to **Dashboard** > **Create dashboard**
2. Click **Add** and select all saved visualizations:
   - Failed Logins Over Time
   - Login Activity Spikes
   - Task Status Distribution
   - Task Completion Trend
   - Top Active Users
   - Approval Workflow Transitions
   - Escalation Count
   - API Response Times
   - Error Code Distribution
3. Arrange panels in grid layout
4. Save dashboard as: **"Audit Analytics Dashboard"**

---

## Step 5: Add Tenant Filter (CRITICAL for Multi-Tenancy)

1. Open the dashboard
2. Click **Add filter**
3. Field: `tenant_id`
4. Operator: `is`
5. Value: (leave blank for now - users will select at runtime)
6. **Enable "Pin across all apps"**
7. Save dashboard

**Usage:**
- Users select their tenant_id from filter dropdown
- All visualizations auto-filter by tenant

---

## Step 6: Advanced Filters

Add these as **Controls** (optional):

1. Click **Add** > **Controls**
2. Add **Options list** control:
   - Field: `module.keyword`
   - Label: "Module"
3. Add **Options list** control:
   - Field: `action.keyword`
   - Label: "Action"
4. Add **Time slider** control
5. Save dashboard again

---

## Step 7: Set Dashboard Permissions (Kibana Spaces)

1. Go to **Stack Management** > **Spaces**
2. Create spaces per tenant (optional):
   - Space: `tenant-1`
   - Features: Discover, Visualize, Dashboard
3. Assign users to spaces based on tenant_id
4. Duplicate dashboard per space if needed

---

## Step 8: Create Saved Searches

### Search 1: Failed Logins Last Hour
1. Go to **Discover**
2. Index: `demo-logs-audit-*`
3. Query: `action: LOGIN_FAILED`
4. Time: Last 1 hour
5. Save as: **"Recent Failed Logins"**

### Search 2: High-Value Changes
1. Query: `action: (PROJECT_CREATED OR APPROVAL_GRANTED OR TASK_DELETED)`
2. Time: Last 24 hours
3. Save as: **"Critical Actions"**

---

## Step 9: Export Dashboard

1. Go to **Stack Management** > **Saved Objects**
2. Find "Audit Analytics Dashboard"
3. Click **Export**
4. Save JSON file to: `kibana/audit_dashboard_export.ndjson`

**Import Instructions:**
- Use **Stack Management** > **Saved Objects** > **Import**

---

## Step 10: Test and Refine

1. Select tenant_id filter
2. Adjust time range
3. Verify all visualizations update correctly
4. Test drill-down functionality
5. Validate data accuracy against MySQL

---

## Optional: Dark Theme

1. Go to **Stack Management** > **Advanced Settings**
2. Search: `theme:darkMode`
3. Enable: **true**
4. Refresh dashboard

---

## Expected Dashboard Layout

```
+-----------------------------------+-----------------------------------+
|  Failed Logins Over Time          |  Login Activity Spikes            |
|  (Line Chart)                     |  (Area Chart)                     |
+-----------------------------------+-----------------------------------+
|  Task Status Distribution         |  Task Completion Trend            |
|  (Pie Chart)                      |  (Line Chart)                     |
+-----------------------------------+-----------------------------------+
|  Top Active Users                 |  Approval Workflow Transitions    |
|  (Horizontal Bar)                 |  (Data Table)                     |
+-----------------------------------+-----------------------------------+
|  Escalation Count                 |  Recent Failed Logins             |
|  (Metric)                         |  (Saved Search Panel)             |
+-----------------------------------+-----------------------------------+
```

---

## Filters Panel (Top of Dashboard)

```
[Tenant ID: ____] [Module: ____] [Action: ____] [Time Range: Last 7 days]
```

---

## Next Steps

1. Set up alerts (see alert_rules.json)
2. Configure index lifecycle management
3. Set up user role-based access
4. Schedule dashboard reports
