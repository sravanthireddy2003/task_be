# Sample Workflow Responses

This file contains example responses from the workflow API endpoints showing the new `project_status_info` structure.

---

## Active Project (Normal Working State)

```json
{
  "success": true,
  "message": "Fetched 1 workflow requests.",
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

**Frontend Usage:**
```javascript
// ✅ Show status
<Badge color="green">{data[0].project_status_info.display}</Badge> // "ACTIVE"

// ✅ Check permissions
{data[0].project_status_info.can_create_tasks && (
  <Button>Create Task</Button>
)}

// ✅ Check state
if (!data[0].project_status_info.is_closed) {
  // Allow editing
}
```

---

## Project Pending Closure (Awaiting Admin Approval)

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
          "id": 207,
          "title": "task2",
          "status": "Completed",
          "total_duration": 4379,
          "priority": "MEDIUM",
          "public_id": "fa7fd6b02e7077fc",
          "assignees": [
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
      
      "total_project_hours": "1.22",
      "productivity_score": "100%",
      "attachments": [],
      
      "message": "PROJECT request #23 is pending approval."
    }
  ]
}
```

**Frontend Usage:**
```javascript
// ✅ Show special badge for pending closure
const request = data[0];

{request.project_status_info.is_pending_closure && (
  <Badge color="yellow">
    ⏳ Pending Closure
  </Badge>
)}

// ✅ Show alert
{request.project_status_info.is_pending_closure && (
  <Alert type="info">
    This project is awaiting admin approval for closure.
    Request ID: {request.id}
    <br />
    Requested by: {request.requested_by.name}
    <br />
    Reason: {request.reason}
  </Alert>
)}

// ✅ Hide action buttons
{!request.project_status_info.can_create_tasks && (
  <div>Cannot create new tasks - project is locked</div>
)}
```

---

## Closed Project (Permanently Archived)

```json
{
  "success": true,
  "message": "Fetched 1 workflow requests.",
  "data": [
    {
      "id": 10,
      "tenant_id": "1",
      "entity_type": "PROJECT",
      "entity_id": 20,
      "from_state": "ACTIVE",
      "to_state": "CLOSED",
      "requested_by_id": 56,
      "approver_role": "Admin",
      "status": "APPROVED",
      "reason": null,
      "created_at": "2026-01-30T10:01:11.000Z",
      "updated_at": "2026-01-30T10:22:05.000Z",
      
      "requested_by": {
        "id": 56,
        "name": "Akash shetty",
        "email": "akashsubba798@gmail.com",
        "role": "Manager"
      },
      
      "approved_by": {
        "id": 23,
        "name": "Myadmin",
        "email": "korapatiashwini@gmail.com",
        "role": "Admin"
      },
      
      "project_name": "project-2",
      "project_public_id": "6ffbf23d338005f7",
      "project_status": "CLOSED",
      
      "project_status_info": {
        "raw": "CLOSED",
        "display": "CLOSED",
        "is_closed": true,
        "is_pending_closure": false,
        "is_locked": true,
        "can_create_tasks": false,
        "can_edit_project": false,
        "can_request_closure": false
      },
      
      "message": "PROJECT request #10 is approved.",
      "newStatus": "CLOSED"
    }
  ]
}
```

**Frontend Usage:**
```javascript
// ✅ Show closed badge
const request = data[0];

{request.project_status_info.is_closed && (
  <Badge color="gray">
    🔒 Closed
  </Badge>
)}

// ✅ Show read-only message
{request.project_status_info.is_closed && (
  <Alert type="warning">
    This project is permanently closed and archived.
    All changes are disabled.
    {request.approved_by && (
      <>
        <br />
        Closed by: {request.approved_by.name}
        <br />
        Date: {new Date(request.updated_at).toLocaleDateString()}
      </>
    )}
  </Alert>
)}

// ✅ Disable all actions
if (request.project_status_info.is_closed) {
  return <ReadOnlyProjectView project={request} />;
}
```

---

## Complete React Component Example

```jsx
import React from 'react';
import { Badge, Button, Alert, Card } from '@/components/ui';

function WorkflowRequestCard({ request }) {
  const { project_status_info } = request;
  
  // Status badge configuration
  const STATUS_CONFIG = {
    'ACTIVE': {
      color: 'green',
      icon: '●',
      label: 'Active',
      description: 'Project is accepting work'
    },
    'PENDING_CLOSURE': {
      color: 'yellow',
      icon: '⏳',
      label: 'Pending Closure',
      description: 'Awaiting admin approval'
    },
    'CLOSED': {
      color: 'gray',
      icon: '🔒',
      label: 'Closed',
      description: 'Permanently archived'
    }
  };
  
  const statusConfig = STATUS_CONFIG[project_status_info.display];
  
  return (
    <Card className="workflow-request">
      <div className="card-header">
        <h3>{request.project_name}</h3>
        <Badge color={statusConfig.color}>
          {statusConfig.icon} {statusConfig.label}
        </Badge>
      </div>
      
      <div className="card-body">
        {/* Project Info */}
        <div className="project-info">
          <p>Request ID: {request.id}</p>
          <p>Requested by: {request.requested_by?.name}</p>
          {request.reason && (
            <p>Reason: {request.reason}</p>
          )}
        </div>
        
        {/* Status-specific alerts */}
        {project_status_info.is_pending_closure && (
          <Alert type="info">
            This project is awaiting admin approval for closure.
            No new tasks can be created until approved or rejected.
          </Alert>
        )}
        
        {project_status_info.is_closed && (
          <Alert type="warning">
            This project is permanently closed and archived.
            {request.approved_by && (
              <div className="approval-info">
                Approved by: {request.approved_by.name}
                <br />
                Date: {new Date(request.updated_at).toLocaleDateString()}
              </div>
            )}
          </Alert>
        )}
        
        {/* Task list for project closure requests */}
        {request.entity_type === 'PROJECT' && request.tasks && (
          <div className="tasks-summary">
            <h4>Tasks ({request.tasks.length})</h4>
            <ul>
              {request.tasks.map(task => (
                <li key={task.id}>
                  {task.title} - {task.status}
                  {task.assignees?.length > 0 && (
                    <span className="assignees">
                      ({task.assignees.map(a => a.name).join(', ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="productivity">
              <span>Total Hours: {request.total_project_hours}</span>
              <span>Completion: {request.productivity_score}</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="card-actions">
        {/* Only show actions based on permissions */}
        {project_status_info.can_create_tasks && (
          <Button variant="primary" onClick={() => handleCreateTask(request)}>
            Create Task
          </Button>
        )}
        
        {project_status_info.can_edit_project && (
          <Button variant="secondary" onClick={() => handleEditProject(request)}>
            Edit Project
          </Button>
        )}
        
        {project_status_info.can_request_closure && (
          <Button variant="danger" onClick={() => handleRequestClosure(request)}>
            Request Closure
          </Button>
        )}
        
        {/* Approval actions (for managers/admins) */}
        {request.status === 'PENDING' && (
          <div className="approval-actions">
            <Button 
              variant="success" 
              onClick={() => handleApprove(request.id)}
            >
              Approve
            </Button>
            <Button 
              variant="danger" 
              onClick={() => handleReject(request.id)}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// Action handlers
function handleCreateTask(request) {
  console.log('Creating task for project:', request.project_public_id);
}

function handleEditProject(request) {
  console.log('Editing project:', request.project_public_id);
}

function handleRequestClosure(request) {
  if (!confirm('Are you sure you want to request closure for this project?')) {
    return;
  }
  
  fetch('/api/workflow/project/close-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: request.entity_id,
      reason: 'All tasks completed successfully'
    })
  })
  .then(res => res.json())
  .then(data => {
    alert('Project closure request submitted');
  });
}

function handleApprove(requestId) {
  fetch('/api/workflow/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      action: 'APPROVE'
    })
  })
  .then(res => res.json())
  .then(data => {
    alert('Request approved');
  });
}

function handleReject(requestId) {
  const reason = prompt('Please provide a reason for rejection:');
  if (!reason) return;
  
  fetch('/api/workflow/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      action: 'REJECT',
      reason
    })
  })
  .then(res => res.json())
  .then(data => {
    alert('Request rejected');
  });
}

export default WorkflowRequestCard;
```

---

## Field Comparison Table

| Scenario | `project_status` (raw) | `project_status_info.display` | `project_status_info.is_closed` | `project_status_info.can_create_tasks` |
|----------|------------------------|------------------------------|--------------------------------|---------------------------------------|
| Active project | `"ACTIVE"` | `"ACTIVE"` | `false` | `true` |
| Pending closure | `"PENDING_FINAL_APPROVAL"` | `"PENDING_CLOSURE"` | `false` | `false` |
| Closed project | `"CLOSED"` | `"CLOSED"` | `true` | `false` |

**Key Takeaway:** Always use `project_status_info` fields for consistent, user-friendly behavior.
