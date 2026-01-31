# Workflow Documentation Index

## 📚 Documentation Overview

This folder contains comprehensive documentation for the Workflow Module system.

---

## 🎯 Start Here

### For Frontend Developers
1. **[WORKFLOW_QUICK_REFERENCE.md](./WORKFLOW_QUICK_REFERENCE.md)** ⭐ START HERE
   - TL;DR guide with code examples
   - Visual flow diagrams
   - Common patterns and snippets
   - **Read this first!**

2. **[WORKFLOW_STATUS_GUIDE.md](./WORKFLOW_STATUS_GUIDE.md)**
   - Complete status field documentation
   - Full API flow examples with request/response payloads
   - UI implementation examples
   - Troubleshooting guide

3. **[WORKFLOW_DIAGRAMS.md](./WORKFLOW_DIAGRAMS.md)** 📊
   - Visual flow diagrams
   - State transition matrices
   - Decision trees
   - UI component hierarchy

4. **[WORKFLOW_MIGRATION_GUIDE.md](./WORKFLOW_MIGRATION_GUIDE.md)**
   - Migrating from old status fields to new `project_status_info`
   - Before/after code examples
   - Search & replace patterns
   - Testing checklist

### For Backend Developers
4. **[WORKFLOW_API.md](./WORKFLOW_API.md)**
   - Full API specification
   - Advanced workflow features
   - Admin/Manager/Employee endpoints
   - Business rules integration

5. **[WORKFLOW_SAMPLE_RESPONSES.md](./WORKFLOW_SAMPLE_RESPONSES.md)**
   - Real API response examples
   - React component examples
   - Field comparison tables

---

## 🚨 Critical Information

### The #1 Rule for Frontend Developers
**Always use `project_status_info` object - never use raw `project_status` field**

```javascript
// ✅ CORRECT
if (request.project_status_info.can_create_tasks) { ... }
const status = request.project_status_info.display; // "ACTIVE" | "PENDING_CLOSURE" | "CLOSED"

// ❌ WRONG
if (request.project_status === 'CLOSED') { ... }
const status = request.project_status; // May be "PENDING_FINAL_APPROVAL" (confusing!)
```

**Why?** The database may contain internal states like `PENDING_FINAL_APPROVAL`, but the UI should show user-friendly states like `PENDING_CLOSURE`. The `project_status_info` object provides:
- **Display-friendly status** for UI
- **Boolean flags** for permissions (can_create_tasks, is_closed, etc.)
- **Consistent behavior** across all project states

---

## 📊 Quick Reference

### Status Values
| Display Status | Meaning | Can Edit? | Can Add Tasks? |
|----------------|---------|-----------|----------------|
| `ACTIVE` | Working normally | ✅ Yes | ✅ Yes |
| `PENDING_CLOSURE` | Awaiting admin approval | ❌ No | ❌ No |
| `CLOSED` | Archived permanently | ❌ No | ❌ No |

### API Endpoints
| Endpoint | Role | Purpose |
|----------|------|---------|
| `POST /api/workflow/request` | Employee | Submit task for review |
| `POST /api/workflow/approve` | Manager/Admin | Approve/reject request |
| `POST /api/workflow/project/close-request` | Manager | Request project closure |
| `GET /api/workflow/pending` | Manager/Admin | Get pending approvals |
| `GET /api/workflow/history/:type/:id` | All | Get audit history |

### Workflow Flow
```
Employee submits task → Manager reviews → Approves/Rejects
                                        ↓ (if approved)
                              All tasks done? → Manager requests closure
                                               ↓
                                        Admin approves/rejects closure
```

---

## 🎯 Common Use Cases

### Check if user can create a task
```javascript
if (request.project_status_info.can_create_tasks) {
  return <Button onClick={createTask}>Create Task</Button>;
}
```

### Show appropriate status badge
```javascript
const STATUS_CONFIG = {
  'ACTIVE': { color: 'green', label: 'Active' },
  'PENDING_CLOSURE': { color: 'yellow', label: 'Pending Closure' },
  'CLOSED': { color: 'gray', label: 'Closed' }
};

const config = STATUS_CONFIG[request.project_status_info.display];
return <Badge color={config.color}>{config.label}</Badge>;
```

### Show pending approval message
```javascript
if (request.project_status_info.is_pending_closure) {
  return (
    <Alert type="info">
      This project is awaiting admin approval for closure.
      Request ID: {request.id}
    </Alert>
  );
}
```

---

## 🔄 Workflow States

### Task Workflow
```
TODO → IN_PROGRESS → REVIEW → COMPLETED
         ↓            ↓
      ON_HOLD    IN_PROGRESS (if rejected)
```

### Project Workflow
```
ACTIVE → PENDING_FINAL_APPROVAL → CLOSED
           ↑                        ↓
           └──── ACTIVE (if rejected)
```

---

## 📁 File Descriptions

### User Guides
- **WORKFLOW_QUICK_REFERENCE.md** - Fast lookup guide with visual diagrams
- **WORKFLOW_STATUS_GUIDE.md** - Comprehensive status documentation
- **WORKFLOW_DIAGRAMS.md** - Visual flow diagrams and state charts
- **WORKFLOW_MIGRATION_GUIDE.md** - Migration guide for existing code
- **WORKFLOW_SAMPLE_RESPONSES.md** - Real API response examples

### API Documentation
- **WORKFLOW_API.md** - Complete API specification
- **../WorkflowModule.postman_collection.json** - Postman API tests

### Integration Notes
- **../INTEGRATION_NOTES.md** - General integration notes for the entire system

---

## 🆘 Troubleshooting

### Issue: "Status shows PENDING_FINAL_APPROVAL instead of user-friendly text"
**Solution:** You're using `request.project_status` instead of `request.project_status_info.display`

### Issue: "Create Task button shows but API returns 'Project is locked'"
**Solution:** Check `request.project_status_info.can_create_tasks` before showing the button

### Issue: "Can't tell if project is awaiting approval"
**Solution:** Check `request.project_status_info.is_pending_closure` boolean flag

### Issue: "Getting undefined errors on project_status_info"
**Solution:** Ensure you're calling the latest API version and clear any cached responses

---

## 🧪 Testing

### Postman Collection
Import [WorkflowModule.postman_collection.json](../WorkflowModule.postman_collection.json) for complete API tests.

### Test Scenarios
1. **Employee submits task** → Manager approves → Task marked COMPLETED
2. **Employee submits task** → Manager rejects → Task returns to IN_PROGRESS
3. **Manager requests project closure** → Admin approves → Project closed
4. **Manager requests project closure** → Admin rejects → Project remains active

---

## 📞 Support

**Questions or issues?**
1. Check [WORKFLOW_QUICK_REFERENCE.md](./WORKFLOW_QUICK_REFERENCE.md) first
2. Review [WORKFLOW_STATUS_GUIDE.md](./WORKFLOW_STATUS_GUIDE.md) for detailed examples
3. Contact backend team
4. Open an issue with code examples

---

## 🔗 Related Documentation
- [API Examples](../API_EXAMPLES.md)
- [Client API Response Formats](../CLIENT_API_RESPONSE_FORMATS.md)
- [Integration Notes](../INTEGRATION_NOTES.md)

---

**Last Updated:** January 31, 2026  
**Version:** 2.0 (Added `project_status_info` standardization)
