# Workflow Status Field Guide

## 🚨 CRITICAL: Which Status Field to Use

**For Frontend Developers:** Always use `project_status_info` object for all project status-related logic.

### ✅ DO THIS (Recommended)
```javascript
// Check if project is closed
if (request.project_status_info.is_closed) {
  // Disable editing
}

// Check if pending closure
if (request.project_status_info.is_pending_closure) {
  // Show "Awaiting admin approval" badge
}

// Display status in UI
<Badge>{request.project_status_info.display}</Badge>

// Check permissions
if (request.project_status_info.can_create_tasks) {
  // Show "Create Task" button
}
```

### ❌ DON'T DO THIS (Deprecated)
```javascript
// WRONG: These fields may be inconsistent
if (request.project_status === 'CLOSED') { ... }
if (request.project_effective_status === 'CLOSED') { ... }
if (request.project_closed) { ... }
```

---

## 📋 Response Field Reference

### `project_status_info` (NEW - Use This!)
Complete status information object:

```javascript
{
  "raw": "PENDING_FINAL_APPROVAL",           // Actual DB value
  "display": "PENDING_CLOSURE",               // User-friendly status
  "is_closed": false,                         // Boolean: project fully closed
  "is_pending_closure": true,                 // Boolean: awaiting admin approval
  "is_locked": true,                          // Boolean: locked for editing
  "can_create_tasks": false,                  // Boolean: can create new tasks
  "can_edit_project": false,                  // Boolean: can edit project details
  "can_request_closure": false                // Boolean: can request closure
}
```

### Display Status Values
- `ACTIVE` - Project is active and accepting work
- `PENDING_CLOSURE` - Manager requested closure, awaiting admin approval
- `CLOSED` - Project is fully closed and locked
- `ON_HOLD` - Project is temporarily paused (if your schema supports it)

### Legacy Fields (Deprecated - For Backward Compatibility Only)
- `project_status` - Raw DB status (may be PENDING_FINAL_APPROVAL)
- `project_effective_status` - Same as `project_status_info.display`
- `project_closed` - Same as `project_status_info.is_closed`
- `can_create_tasks` - Same as `project_status_info.can_create_tasks`
- `can_send_request` - General permission flag

---

## 🔄 Complete Workflow Flow

### **Flow 1: Employee Submits Task for Review**

#### Request
```http
POST /api/workflow/request
Authorization: Bearer {employee_token}
Content-Type: application/json

{
  "entityType": "TASK",
  "entityId": 207,
  "projectId": 18,
  "toState": "COMPLETED",
  "meta": {
    "reason": "Task completed, ready for review"
  }
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "message": "Task submitted for review. Awaiting manager approval.",
    "requestId": 22,
    "taskStatus": "REVIEW"
  }
}
```

#### What Happens
1. Task status changes: `IN_PROGRESS` → `REVIEW`
2. Task is locked (no edits allowed)
3. Workflow request created with status `PENDING`
4. Manager receives notification
5. Request appears in Manager's pending approvals

---

### **Flow 2: Manager Approves Task**

#### Request
```http
POST /api/workflow/approve
Authorization: Bearer {manager_token}
Content-Type: application/json

{
  "requestId": 22,
  "action": "APPROVE"
}
```

#### Response
```json
{
  "success": true,
  "message": "TASK request #22 has been approved.",
  "data": {
    "message": "TASK request #22 has been approved.",
    "newStatus": "COMPLETED"
  }
}
```

#### What Happens
1. Task status changes: `REVIEW` → `COMPLETED`
2. Task is unlocked
3. Workflow request status: `PENDING` → `APPROVED`
4. Employee receives notification
5. System checks if all project tasks are completed
6. **If all tasks completed:** Auto-creates PROJECT closure request for Admin

---

### **Flow 3: Manager Rejects Task**

#### Request
```http
POST /api/workflow/approve
Authorization: Bearer {manager_token}
Content-Type: application/json

{
  "requestId": 22,
  "action": "REJECT",
  "reason": "Missing test cases and documentation"
}
```

#### Response
```json
{
  "success": true,
  "message": "TASK request #22 has been rejected.",
  "data": {
    "message": "TASK request #22 has been rejected.",
    "newStatus": "IN_PROGRESS"
  }
}
```

#### What Happens
1. Task status changes: `REVIEW` → `IN_PROGRESS`
2. Task is unlocked for editing
3. Workflow request status: `PENDING` → `REJECTED`
4. Employee receives notification with rejection reason
5. Employee can fix issues and resubmit

---

### **Flow 4: Manager Requests Project Closure**

#### Request
```http
POST /api/workflow/project/close-request
Authorization: Bearer {manager_token}
Content-Type: application/json

{
  "projectId": 18,
  "reason": "All tasks completed successfully. Ready for final closure."
}
```

#### Response
```json
{
  "success": true,
  "message": "Project closure request sent to admin",
  "data": {
    "requestId": 23,
    "projectId": 18,
    "projectPublicId": "dc8ddd50d72f015e",
    "entityType": "PROJECT",
    "approverRole": "Admin",
    "status": "PENDING",
    "reason": "All tasks completed successfully. Ready for final closure.",
    "createdBy": 56,
    "createdAt": "2026-01-31T10:00:00.000Z"
  }
}
```

#### What Happens
1. Validates all tasks are `COMPLETED`
2. Project status changes: `ACTIVE` → `PENDING_FINAL_APPROVAL`
3. Project is **LOCKED** (no edits, no new tasks)
4. All project tasks are **LOCKED**
5. Workflow request created with status `PENDING`
6. Admin receives notification
7. Request appears in Admin's pending approvals

---

### **Flow 5: Admin Approves Project Closure**

#### Request
```http
POST /api/workflow/approve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "requestId": 23,
  "action": "APPROVE"
}
```

#### Response
```json
{
  "success": true,
  "message": "PROJECT request #23 has been approved.",
  "data": {
    "message": "PROJECT request #23 has been approved.",
    "newStatus": "CLOSED"
  }
}
```

#### What Happens
1. Project status changes: `PENDING_FINAL_APPROVAL` → `CLOSED`
2. Project remains **LOCKED PERMANENTLY**
3. All tasks remain **LOCKED PERMANENTLY**
4. Workflow request status: `PENDING` → `APPROVED`
5. Manager receives notification
6. Project is archived and read-only

---

### **Flow 6: Admin Rejects Project Closure**

#### Request
```http
POST /api/workflow/approve
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "requestId": 23,
  "action": "REJECT",
  "reason": "Client requested additional features. Project needs to remain active."
}
```

#### Response
```json
{
  "success": true,
  "message": "PROJECT request #23 has been rejected.",
  "data": {
    "message": "PROJECT request #23 has been rejected.",
    "newStatus": "ACTIVE"
  }
}
```

#### What Happens
1. Project status changes: `PENDING_FINAL_APPROVAL` → `ACTIVE`
2. Project is **UNLOCKED**
3. All project tasks are **UNLOCKED**
4. Workflow request status: `PENDING` → `REJECTED`
5. Manager receives notification with rejection reason
6. Manager can create new tasks and request closure again later

---

## 📊 Get Pending Workflow Requests

### Request (Manager View)
```http
GET /api/workflow/pending?role=Manager&status=PENDING
Authorization: Bearer {manager_token}
```

### Response
```json
{
  "success": true,
  "message": "Fetched 2 workflow requests.",
  "data": [
    {
      "id": 22,
      "tenant_id": "1",
      "entity_type": "TASK",
      "entity_id": 207,
      "from_state": "IN_PROGRESS",
      "to_state": "COMPLETED",
      "requested_by_id": 58,
      "approver_role": "Manager",
      "status": "PENDING",
      "reason": null,
      "created_at": "2026-01-31T09:30:00.000Z",
      "updated_at": "2026-01-31T09:30:00.000Z",
      
      "requested_by": {
        "id": 58,
        "name": "Nikhi",
        "email": "NikhithaKondreddygari@nmit-solutions.com",
        "role": "Employee"
      },
      
      "task_name": "task2",
      "task_status": "REVIEW",
      "task_is_locked": 1,
      
      "project_name": "P-1",
      "project_public_id": "dc8ddd50d72f015e",
      "project_status": "ACTIVE",
      
      "project_status_info": {
        "raw": "ACTIVE",
        "display": "ACTIVE",
        "is_closed": false,
        "is_pending_closure": false,
        "is_locked": false,
        "can_create_tasks": true,
        "can_edit_project": true,
        "can_request_closure": true
      },
      
      "message": "TASK request #22 is pending approval."
    }
  ]
}
```

### Request (Admin View)
```http
GET /api/workflow/pending?role=Admin&status=PENDING
Authorization: Bearer {admin_token}
```

### Response (Project Closure Request)
```json
{
  "success": true,
  "message": "Fetched 1 workflow requests.",
  "data": [
    {
      "id": 23,
      "tenant_id": "1",
      "entity_type": "PROJECT",
      "entity_id": 18,
      "from_state": "ACTIVE",
      "to_state": "CLOSED",
      "requested_by_id": 56,
      "approver_role": "Admin",
      "status": "PENDING",
      "reason": "All tasks completed successfully. Ready for final closure.",
      "created_at": "2026-01-31T10:00:00.000Z",
      "updated_at": "2026-01-31T10:00:00.000Z",
      
      "requested_by": {
        "id": 56,
        "name": "Akash shetty",
        "email": "akashsubba798@gmail.com",
        "role": "Manager"
      },
      
      "project_name": "P-1",
      "project_public_id": "dc8ddd50d72f015e",
      "project_status": "PENDING_FINAL_APPROVAL",
      
      "project_status_info": {
        "raw": "PENDING_FINAL_APPROVAL",
        "display": "PENDING_CLOSURE",
        "is_closed": false,
        "is_pending_closure": true,
        "is_locked": true,
        "can_create_tasks": false,
        "can_edit_project": false,
        "can_request_closure": false
      },
      
      "client_details": {
        "name": "Test Client",
        "company": null,
        "email": "client@example.com"
      },
      
      "tasks": [
        {
          "id": 206,
          "title": "task1",
          "status": "Completed",
          "total_duration": 103562,
          "priority": "MEDIUM",
          "public_id": "494d49baaa95266b",
          "assignees": [
            {
              "name": "Anitha",
              "email": "ashhoney959@gmail.com",
              "role": "Employee"
            }
          ],
          "checklists": [],
          "attachments": []
        },
        {
          "id": 207,
          "title": "task2",
          "status": "Completed",
          "total_duration": 4379,
          "priority": "MEDIUM",
          "public_id": "fa7fd6b02e7077fc",
          "assignees": [
            {
              "name": "Narasimha",
              "email": "narasimha.m0119@gmail.com",
              "role": "Employee"
            },
            {
              "name": "Anitha",
              "email": "ashhoney959@gmail.com",
              "role": "Employee"
            }
          ],
          "checklists": [],
          "attachments": []
        }
      ],
      
      "total_project_hours": "29.98",
      "productivity_score": "100%",
      "attachments": [],
      
      "message": "PROJECT request #23 is pending approval."
    }
  ]
}
```

---

## 🎨 UI Implementation Examples

### Task Status Badge
```jsx
function TaskStatusBadge({ status }) {
  const statusConfig = {
    'TODO': { color: 'gray', label: 'To Do' },
    'IN_PROGRESS': { color: 'blue', label: 'In Progress' },
    'REVIEW': { color: 'yellow', label: 'Under Review' },
    'COMPLETED': { color: 'green', label: 'Completed' },
    'ON_HOLD': { color: 'orange', label: 'On Hold' }
  };
  
  const config = statusConfig[status] || { color: 'gray', label: status };
  
  return <Badge color={config.color}>{config.label}</Badge>;
}
```

### Project Status Badge
```jsx
function ProjectStatusBadge({ request }) {
  const statusInfo = request.project_status_info;
  
  const statusConfig = {
    'ACTIVE': { color: 'green', label: 'Active', icon: '✓' },
    'PENDING_CLOSURE': { color: 'yellow', label: 'Pending Closure', icon: '⏳' },
    'CLOSED': { color: 'gray', label: 'Closed', icon: '🔒' }
  };
  
  const config = statusConfig[statusInfo.display] || { color: 'gray', label: statusInfo.display, icon: '' };
  
  return (
    <Badge color={config.color}>
      {config.icon} {config.label}
      {statusInfo.is_pending_closure && (
        <Tooltip text="Awaiting admin approval for final closure" />
      )}
    </Badge>
  );
}
```

### Conditional Actions
```jsx
function ProjectActions({ request }) {
  const { project_status_info } = request;
  
  return (
    <div>
      {project_status_info.can_create_tasks && (
        <Button onClick={createTask}>Create Task</Button>
      )}
      
      {project_status_info.can_edit_project && (
        <Button onClick={editProject}>Edit Project</Button>
      )}
      
      {project_status_info.can_request_closure && (
        <Button onClick={requestClosure}>Request Closure</Button>
      )}
      
      {project_status_info.is_pending_closure && (
        <Alert type="info">
          This project is awaiting admin approval for closure.
          No new tasks can be created.
        </Alert>
      )}
      
      {project_status_info.is_closed && (
        <Alert type="warning">
          This project is closed and locked. All changes are disabled.
        </Alert>
      )}
    </div>
  );
}
```

---

## 🔐 Role-Based Permissions

| Action | Employee | Manager | Admin |
|--------|----------|---------|-------|
| Create Task | ❌ | ✅ (if project not closed) | ✅ (if project not closed) |
| Submit Task for Review | ✅ (own tasks) | ✅ | ✅ |
| Approve/Reject Task | ❌ | ✅ | ✅ |
| Request Project Closure | ❌ | ✅ (if all tasks completed) | ✅ |
| Approve/Reject Project Closure | ❌ | ❌ | ✅ |
| View Workflow History | ✅ (own) | ✅ (all) | ✅ (all) |

---

## 🔍 Workflow History

### Request
```http
GET /api/workflow/history/TASK/207
Authorization: Bearer {token}
```

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "request_id": 22,
      "action": "REQUESTED",
      "actor_id": 58,
      "actor_name": "Nikhi",
      "from_state": "IN_PROGRESS",
      "to_state": "REVIEW",
      "reason": null,
      "created_at": "2026-01-31T09:30:00.000Z"
    },
    {
      "id": 2,
      "request_id": 22,
      "action": "APPROVED",
      "actor_id": 56,
      "actor_name": "Akash shetty",
      "from_state": "REVIEW",
      "to_state": "COMPLETED",
      "reason": null,
      "created_at": "2026-01-31T10:15:00.000Z"
    }
  ]
}
```

---

## 📝 State Transition Matrix

### Task States
```
TODO → IN_PROGRESS → REVIEW → COMPLETED
  ↓         ↓          ↓
ON_HOLD  ON_HOLD   IN_PROGRESS
                   (if rejected)
```

### Project States
```
ACTIVE → PENDING_FINAL_APPROVAL → CLOSED
           (when all tasks done)
  ↑              ↓
  └──── ACTIVE (if rejected)
```

---

## ⚠️ Important Notes

1. **ALWAYS use `project_status_info.display`** for showing status in UI
2. **DO NOT rely on `project_status`** directly - it may contain internal states like `PENDING_FINAL_APPROVAL`
3. **Use boolean flags** (`is_closed`, `is_pending_closure`, `can_create_tasks`) for conditional logic
4. **Locked projects cannot be edited** - all mutations will be rejected by the backend
5. **Once a project is CLOSED**, it cannot be reopened (permanent state)
6. **Task approval is required** before a task can be marked COMPLETED
7. **All tasks must be COMPLETED** before a project can be closed

---

## 🆘 Common Issues

### Issue: "Cannot create task - project is locked"
**Cause:** Project is in `PENDING_FINAL_APPROVAL` or `CLOSED` state  
**Solution:** Check `project_status_info.can_create_tasks` before showing create button

### Issue: "Confusing status - shows both CLOSED and PENDING"
**Cause:** Using deprecated `project_status` field  
**Solution:** Switch to `project_status_info.display`

### Issue: "Manager can't request closure even though all tasks done"
**Cause:** Tasks are not in `COMPLETED` state (may be `Completed` with different casing)  
**Solution:** Backend normalizes to uppercase - ensure consistent status values

---

## 📞 Support

For questions or issues with the workflow system, contact the backend team or refer to:
- [WORKFLOW_API.md](./WORKFLOW_API.md) - Full API documentation
- [WorkflowModule.postman_collection.json](../WorkflowModule.postman_collection.json) - Postman tests
