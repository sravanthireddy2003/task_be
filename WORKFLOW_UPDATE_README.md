# ⚠️ IMPORTANT: Workflow Status Field Update

## 🎯 Quick Summary

The workflow API now returns a **new `project_status_info` object** that provides clear, consistent status information.

**Frontend developers:** Always use `project_status_info` - never use raw `project_status` field.

---

## 📖 Read This First

**Start Here:** [docs/WORKFLOW_QUICK_REFERENCE.md](./docs/WORKFLOW_QUICK_REFERENCE.md)

This 5-minute read contains everything you need:
- Which field to use
- Code examples
- Visual flow diagrams
- Common patterns

---

## 🚨 The One Rule

```javascript
// ✅ ALWAYS DO THIS
const status = request.project_status_info.display;  // "ACTIVE" | "PENDING_CLOSURE" | "CLOSED"
const canEdit = request.project_status_info.can_create_tasks;

// ❌ NEVER DO THIS
const status = request.project_status;  // May be "PENDING_FINAL_APPROVAL" (confusing!)
const canEdit = request.can_create_tasks;
```

---

## 📚 Full Documentation

Located in `docs/` folder:

1. **[WORKFLOW_QUICK_REFERENCE.md](./docs/WORKFLOW_QUICK_REFERENCE.md)** ⭐ START HERE
2. **[WORKFLOW_STATUS_GUIDE.md](./docs/WORKFLOW_STATUS_GUIDE.md)** - Complete guide
3. **[WORKFLOW_MIGRATION_GUIDE.md](./docs/WORKFLOW_MIGRATION_GUIDE.md)** - Migration help
4. **[WORKFLOW_SAMPLE_RESPONSES.md](./docs/WORKFLOW_SAMPLE_RESPONSES.md)** - Examples
5. **[CHANGELOG.md](./docs/CHANGELOG.md)** - What changed

---

## 🎨 Quick Example

```jsx
function ProjectCard({ request }) {
  const { project_status_info } = request;
  
  return (
    <Card>
      {/* Show user-friendly status */}
      <Badge color={
        project_status_info.display === 'ACTIVE' ? 'green' :
        project_status_info.display === 'PENDING_CLOSURE' ? 'yellow' :
        'gray'
      }>
        {project_status_info.display}
      </Badge>
      
      {/* Show actions based on permissions */}
      {project_status_info.can_create_tasks && (
        <Button>Create Task</Button>
      )}
      
      {project_status_info.can_edit_project && (
        <Button>Edit Project</Button>
      )}
      
      {/* Show pending closure alert */}
      {project_status_info.is_pending_closure && (
        <Alert>Awaiting admin approval for closure</Alert>
      )}
    </Card>
  );
}
```

---

## 📊 Status Values

| Display Value | Meaning | Can Edit? | Can Add Tasks? |
|---------------|---------|-----------|----------------|
| `ACTIVE` | Working normally | ✅ | ✅ |
| `PENDING_CLOSURE` | Awaiting admin approval | ❌ | ❌ |
| `CLOSED` | Archived permanently | ❌ | ❌ |

---

## 🔗 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/workflow/request` | Submit task for review |
| `POST /api/workflow/approve` | Approve/reject request |
| `POST /api/workflow/project/close-request` | Request project closure |
| `GET /api/workflow/pending` | Get pending approvals |

---

## 🆘 Need Help?

1. Read [docs/WORKFLOW_QUICK_REFERENCE.md](./docs/WORKFLOW_QUICK_REFERENCE.md)
2. Check [docs/WORKFLOW_SAMPLE_RESPONSES.md](./docs/WORKFLOW_SAMPLE_RESPONSES.md)
3. Contact backend team

---

**Last Updated:** January 31, 2026  
**Version:** 2.0
