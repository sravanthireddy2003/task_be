# Migration Guide: Status Field Changes

## 🚀 Quick Migration (5 minutes)

If you have existing frontend code using the old status fields, follow this guide to migrate to the new `project_status_info` structure.

---

## ✅ Step 1: Update Status Display

### Before (❌ Old Way)
```javascript
// Showing project status in UI
<Badge>
  {request.project_effective_status || request.project_status}
</Badge>

// or
<div>Status: {request.project_status}</div>
```

### After (✅ New Way)
```javascript
// Use the new display field
<Badge>
  {request.project_status_info.display}
</Badge>

// With proper formatting
const STATUS_LABELS = {
  'ACTIVE': 'Active',
  'PENDING_CLOSURE': 'Pending Closure',
  'CLOSED': 'Closed'
};

<Badge>
  {STATUS_LABELS[request.project_status_info.display]}
</Badge>
```

---

## ✅ Step 2: Update Permission Checks

### Before (❌ Old Way)
```javascript
// Checking if can create tasks
if (request.can_create_tasks) {
  // show button
}

// Checking if project is closed
if (request.project_closed || request.project_status === 'CLOSED') {
  // disable editing
}

// Checking if project is locked
if (request.project_is_locked === 1) {
  // show locked UI
}
```

### After (✅ New Way)
```javascript
// More explicit and reliable
if (request.project_status_info.can_create_tasks) {
  // show button
}

if (request.project_status_info.is_closed) {
  // disable editing
}

if (request.project_status_info.is_locked) {
  // show locked UI
}
```

---

## ✅ Step 3: Handle Pending Closure State

### Before (❌ Old Way)
```javascript
// This didn't exist or was confusing
if (request.project_status === 'PENDING_FINAL_APPROVAL') {
  // show special UI
}
```

### After (✅ New Way)
```javascript
// Clear and explicit
if (request.project_status_info.is_pending_closure) {
  return (
    <Alert type="warning">
      This project is awaiting admin approval for closure.
      No new tasks can be created.
    </Alert>
  );
}
```

---

## ✅ Step 4: Update Conditional Rendering

### Before (❌ Old Way)
```javascript
function ProjectActions({ request }) {
  const isClosed = request.project_status === 'CLOSED' || 
                   request.project_closed || 
                   request.project_is_locked === 1;
  
  return (
    <div>
      {!isClosed && <Button>Create Task</Button>}
      {!isClosed && <Button>Edit Project</Button>}
    </div>
  );
}
```

### After (✅ New Way)
```javascript
function ProjectActions({ request }) {
  const { project_status_info } = request;
  
  return (
    <div>
      {project_status_info.can_create_tasks && (
        <Button>Create Task</Button>
      )}
      
      {project_status_info.can_edit_project && (
        <Button>Edit Project</Button>
      )}
      
      {project_status_info.can_request_closure && (
        <Button>Request Closure</Button>
      )}
    </div>
  );
}
```

---

## ✅ Step 5: Update Status Filters

### Before (❌ Old Way)
```javascript
// Filtering projects
const activeProjects = projects.filter(p => 
  p.project_status === 'ACTIVE' && !p.project_closed
);

const closedProjects = projects.filter(p => 
  p.project_status === 'CLOSED' || p.project_closed
);
```

### After (✅ New Way)
```javascript
// More reliable and clear
const activeProjects = projects.filter(p => 
  p.project_status_info.display === 'ACTIVE'
);

const closedProjects = projects.filter(p => 
  p.project_status_info.is_closed
);

const pendingClosureProjects = projects.filter(p => 
  p.project_status_info.is_pending_closure
);
```

---

## 🎯 Complete Example: Before & After

### Before (❌ Old Code)
```jsx
function ProjectCard({ request }) {
  const isClosed = request.project_status === 'CLOSED' || 
                   request.project_closed;
  const isLocked = request.project_is_locked === 1;
  const canEdit = !isClosed && !isLocked;
  
  let statusColor = 'gray';
  let statusText = request.project_status;
  
  if (request.project_status === 'ACTIVE') {
    statusColor = 'green';
    statusText = 'Active';
  } else if (request.project_status === 'CLOSED') {
    statusColor = 'gray';
    statusText = 'Closed';
  } else if (request.project_status === 'PENDING_FINAL_APPROVAL') {
    statusColor = 'yellow';
    statusText = 'Pending Closure';
  }
  
  return (
    <Card>
      <Badge color={statusColor}>{statusText}</Badge>
      <h3>{request.project_name}</h3>
      
      {canEdit && <Button>Edit</Button>}
      {canEdit && <Button>Create Task</Button>}
      
      {isLocked && (
        <Alert>Project is locked</Alert>
      )}
    </Card>
  );
}
```

### After (✅ New Code)
```jsx
function ProjectCard({ request }) {
  const { project_status_info } = request;
  
  const STATUS_CONFIG = {
    'ACTIVE': { color: 'green', label: 'Active' },
    'PENDING_CLOSURE': { color: 'yellow', label: 'Pending Closure' },
    'CLOSED': { color: 'gray', label: 'Closed' }
  };
  
  const statusConfig = STATUS_CONFIG[project_status_info.display];
  
  return (
    <Card>
      <Badge color={statusConfig.color}>{statusConfig.label}</Badge>
      <h3>{request.project_name}</h3>
      
      {project_status_info.can_edit_project && (
        <Button>Edit</Button>
      )}
      
      {project_status_info.can_create_tasks && (
        <Button>Create Task</Button>
      )}
      
      {project_status_info.is_pending_closure && (
        <Alert type="info">
          Awaiting admin approval for closure
        </Alert>
      )}
      
      {project_status_info.is_locked && (
        <Alert type="warning">
          Project is locked
        </Alert>
      )}
    </Card>
  );
}
```

---

## 🔍 Search & Replace Patterns

Use these patterns to quickly find and update your code:

### Pattern 1: Status Display
```bash
# Find
request.project_status
request.project_effective_status

# Replace with
request.project_status_info.display
```

### Pattern 2: Closed Check
```bash
# Find
request.project_closed
request.project_status === 'CLOSED'

# Replace with
request.project_status_info.is_closed
```

### Pattern 3: Can Create Tasks
```bash
# Find
request.can_create_tasks

# Replace with
request.project_status_info.can_create_tasks
```

### Pattern 4: Locked Check
```bash
# Find
request.project_is_locked === 1
request.project_is_locked

# Replace with
request.project_status_info.is_locked
```

---

## 🧪 Testing Your Migration

### Test Checklist
- [ ] Active projects show "Active" badge
- [ ] Projects in pending closure show "Pending Closure" badge  
- [ ] Closed projects show "Closed" badge
- [ ] "Create Task" button hidden when project is pending closure or closed
- [ ] "Edit Project" button hidden when project is pending closure or closed
- [ ] Special message shown for projects awaiting admin approval
- [ ] Locked icon/badge shown for locked projects

### Test Data
```javascript
// Test with these scenarios
const testRequests = [
  {
    // Active project
    project_status_info: {
      display: 'ACTIVE',
      is_closed: false,
      is_pending_closure: false,
      is_locked: false,
      can_create_tasks: true,
      can_edit_project: true
    }
  },
  {
    // Pending closure
    project_status_info: {
      display: 'PENDING_CLOSURE',
      is_closed: false,
      is_pending_closure: true,
      is_locked: true,
      can_create_tasks: false,
      can_edit_project: false
    }
  },
  {
    // Closed project
    project_status_info: {
      display: 'CLOSED',
      is_closed: true,
      is_pending_closure: false,
      is_locked: true,
      can_create_tasks: false,
      can_edit_project: false
    }
  }
];
```

---

## 🐛 Common Migration Issues

### Issue 1: "project_status_info is undefined"
**Cause:** Old API response cached or old endpoint being called  
**Solution:** Clear cache and verify you're calling the latest API version

### Issue 2: "Status still shows PENDING_FINAL_APPROVAL"
**Cause:** Still using `request.project_status` instead of `request.project_status_info.display`  
**Solution:** Update to new field

### Issue 3: "Buttons showing when they shouldn't"
**Cause:** Still using old permission fields (`can_create_tasks` instead of `project_status_info.can_create_tasks`)  
**Solution:** Update to new nested fields

---

## 📊 Field Mapping Reference

| Old Field | New Field | Type | Notes |
|-----------|-----------|------|-------|
| `project_status` | `project_status_info.raw` | string | Raw DB value |
| `project_effective_status` | `project_status_info.display` | string | Use this for UI |
| `project_closed` | `project_status_info.is_closed` | boolean | More reliable |
| `project_is_locked` | `project_status_info.is_locked` | boolean | Type-safe |
| `can_create_tasks` | `project_status_info.can_create_tasks` | boolean | More explicit |
| N/A | `project_status_info.is_pending_closure` | boolean | NEW - use this! |
| N/A | `project_status_info.can_edit_project` | boolean | NEW - use this! |
| N/A | `project_status_info.can_request_closure` | boolean | NEW - use this! |

---

## ⚡ Quick Win: TypeScript Types

If you're using TypeScript, add this type definition:

```typescript
interface ProjectStatusInfo {
  raw: string;
  display: 'ACTIVE' | 'PENDING_CLOSURE' | 'CLOSED';
  is_closed: boolean;
  is_pending_closure: boolean;
  is_locked: boolean;
  can_create_tasks: boolean;
  can_edit_project: boolean;
  can_request_closure: boolean;
}

interface WorkflowRequest {
  id: number;
  entity_type: 'TASK' | 'PROJECT';
  entity_id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  project_name?: string;
  project_public_id?: string;
  project_status_info: ProjectStatusInfo;
  // ... other fields
}
```

---

## 📚 Additional Resources

- [WORKFLOW_STATUS_GUIDE.md](./WORKFLOW_STATUS_GUIDE.md) - Complete documentation
- [WORKFLOW_QUICK_REFERENCE.md](./WORKFLOW_QUICK_REFERENCE.md) - Quick reference
- [WorkflowModule.postman_collection.json](../WorkflowModule.postman_collection.json) - API tests

---

## ✅ Migration Complete Checklist

Once you've migrated your code, verify:

- [ ] All status displays use `project_status_info.display`
- [ ] All permission checks use `project_status_info.can_*` fields
- [ ] All boolean checks use `project_status_info.is_*` fields
- [ ] Special handling for `is_pending_closure` state added
- [ ] Old fields (`project_status`, `project_closed`, etc.) removed
- [ ] UI tested with active, pending closure, and closed projects
- [ ] No console errors related to undefined fields
- [ ] TypeScript types updated (if applicable)

---

**Need help?** Contact the backend team or open an issue.
