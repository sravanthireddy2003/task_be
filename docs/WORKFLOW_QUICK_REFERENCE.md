# Workflow Quick Reference

## 🎯 For Frontend Developers - TL;DR

### Use This Field ONLY:
```javascript
request.project_status_info.display  // "ACTIVE" | "PENDING_CLOSURE" | "CLOSED"
```

### Check Permissions:
```javascript
if (request.project_status_info.can_create_tasks) {
  // Show "Create Task" button
}

if (request.project_status_info.can_edit_project) {
  // Show "Edit Project" button  
}

if (request.project_status_info.is_pending_closure) {
  // Show "Awaiting Admin Approval" badge
}
```

---

## 📊 Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TASK WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────┘

Employee                    Manager                      System
   │                           │                            │
   │  1. Submit Task           │                            │
   │  POST /workflow/request   │                            │
   ├──────────────────────────>│                            │
   │                           │                            │
   │  Task: IN_PROGRESS ─────> REVIEW (locked)             │
   │  Request: PENDING         │                            │
   │                           │                            │
   │                           │  2a. Approve               │
   │                           │  POST /workflow/approve    │
   │                           ├───────────────────────────>│
   │                           │                            │
   │  Task: REVIEW ──────────> COMPLETED                    │
   │  Request: APPROVED        │                            │
   │<──────────────────────────┤                            │
   │  "Task approved"          │                            │
   │                           │                            │
   │                           │         OR                 │
   │                           │                            │
   │                           │  2b. Reject                │
   │                           │  POST /workflow/approve    │
   │                           ├───────────────────────────>│
   │                           │                            │
   │  Task: REVIEW ──────────> IN_PROGRESS                  │
   │  Request: REJECTED        │                            │
   │<──────────────────────────┤                            │
   │  "Fix issues: {reason}"   │                            │
   │                           │                            │


┌─────────────────────────────────────────────────────────────────────┐
│                       PROJECT CLOSURE WORKFLOW                       │
└─────────────────────────────────────────────────────────────────────┘

Manager                     Admin                       System
   │                           │                            │
   │  1. Request Closure       │                            │
   │  POST /workflow/          │                            │
   │       project/close-req   │                            │
   ├──────────────────────────────────────────────────────>│
   │                           │                            │
   │  ✓ Verify all tasks COMPLETED                         │
   │  Project: ACTIVE ──────>  PENDING_FINAL_APPROVAL       │
   │  Project: LOCKED          │                            │
   │  All Tasks: LOCKED        │                            │
   │  Request: PENDING         │                            │
   │                           │                            │
   │                           │  2a. Approve               │
   │                           │  POST /workflow/approve    │
   │                           ├───────────────────────────>│
   │                           │                            │
   │  Project: PENDING_FINAL_APPROVAL ──> CLOSED            │
   │  Project: LOCKED (permanent)                           │
   │  Request: APPROVED        │                            │
   │<──────────────────────────┤                            │
   │  "Project closed"         │                            │
   │                           │                            │
   │                           │         OR                 │
   │                           │                            │
   │                           │  2b. Reject                │
   │                           │  POST /workflow/approve    │
   │                           ├───────────────────────────>│
   │                           │                            │
   │  Project: PENDING_FINAL_APPROVAL ──> ACTIVE            │
   │  Project: UNLOCKED        │                            │
   │  All Tasks: UNLOCKED      │                            │
   │  Request: REJECTED        │                            │
   │<──────────────────────────┤                            │
   │  "Continue work: {reason}"│                            │
   │                           │                            │
```

---

## 📋 Status Mapping Table

| DB Status | Display Status | Is Closed | Is Pending | Can Create Tasks | Can Edit | Description |
|-----------|----------------|-----------|------------|------------------|----------|-------------|
| `ACTIVE` | `ACTIVE` | ❌ | ❌ | ✅ | ✅ | Normal working state |
| `PENDING_FINAL_APPROVAL` | `PENDING_CLOSURE` | ❌ | ✅ | ❌ | ❌ | Awaiting admin approval |
| `CLOSED` | `CLOSED` | ✅ | ❌ | ❌ | ❌ | Permanently archived |

---

## 🎨 UI Components

### Status Badge Colors
```javascript
const STATUS_CONFIG = {
  ACTIVE: {
    color: 'green',
    icon: '●',
    label: 'Active',
    description: 'Project is accepting work'
  },
  PENDING_CLOSURE: {
    color: 'yellow',
    icon: '⏳',
    label: 'Pending Closure',
    description: 'Awaiting admin approval to close'
  },
  CLOSED: {
    color: 'gray',
    icon: '🔒',
    label: 'Closed',
    description: 'Project is archived and locked'
  }
};

// Usage
const config = STATUS_CONFIG[request.project_status_info.display];
```

### Action Buttons
```javascript
function ProjectActionButtons({ request }) {
  const { project_status_info } = request;
  
  return (
    <>
      {/* Only show if project is active and unlocked */}
      {project_status_info.can_create_tasks && (
        <Button>+ Create Task</Button>
      )}
      
      {/* Only show if project can be edited */}
      {project_status_info.can_edit_project && (
        <Button>Edit Project</Button>
      )}
      
      {/* Only show if project can be closed */}
      {project_status_info.can_request_closure && (
        <Button variant="danger">Request Closure</Button>
      )}
    </>
  );
}
```

---

## 🔒 Lock Behavior

| State | Project Locked | Tasks Locked | Can Add Tasks | Can Edit Tasks | Can Edit Project |
|-------|---------------|--------------|---------------|----------------|------------------|
| `ACTIVE` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `PENDING_CLOSURE` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `CLOSED` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Task in `REVIEW` | - | ✅ | - | ❌ | - |

---

## 📞 API Endpoints

| Endpoint | Role | Method | Purpose |
|----------|------|--------|---------|
| `/api/workflow/request` | Employee | POST | Submit task for review |
| `/api/workflow/approve` | Manager/Admin | POST | Approve/reject request |
| `/api/workflow/project/close-request` | Manager | POST | Request project closure |
| `/api/workflow/pending` | Manager/Admin | GET | Get pending approvals |
| `/api/workflow/history/:type/:id` | All | GET | Get audit history |

---

## ⚡ Common Code Patterns

### Check if project can be edited
```javascript
if (!request.project_status_info.can_edit_project) {
  return <Alert>This project is locked and cannot be edited</Alert>;
}
```

### Show appropriate status message
```javascript
function ProjectStatusMessage({ request }) {
  const { project_status_info } = request;
  
  if (project_status_info.is_closed) {
    return <Alert type="info">Project is closed and archived</Alert>;
  }
  
  if (project_status_info.is_pending_closure) {
    return (
      <Alert type="warning">
        Project closure is pending admin approval.
        Request ID: {request.id}
      </Alert>
    );
  }
  
  return <Alert type="success">Project is active</Alert>;
}
```

### Filter tasks by project status
```javascript
const editableTasks = tasks.filter(task => {
  const project = projects.find(p => p.id === task.project_id);
  return project?.project_status_info?.can_edit_project;
});
```

---

## 🐛 Debugging Checklist

**Issue: Button shows but API returns "Project is locked"**
- ✅ Check `project_status_info.can_create_tasks` before showing button
- ✅ Verify you're using `project_status_info.display`, not `project_status`
- ✅ Confirm project is not in `PENDING_CLOSURE` state

**Issue: Status shows "PENDING_FINAL_APPROVAL" in UI**
- ❌ You're using `project_status` (raw DB value)
- ✅ Switch to `project_status_info.display` (returns "PENDING_CLOSURE")

**Issue: Can't tell if project is awaiting approval**
- ✅ Check `project_status_info.is_pending_closure` boolean flag
- ✅ Show special UI/badge when this is true

---

## 📚 Full Documentation
See [WORKFLOW_STATUS_GUIDE.md](./WORKFLOW_STATUS_GUIDE.md) for complete details.
