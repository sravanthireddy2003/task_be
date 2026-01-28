# New Workflow Module API Examples

## Authentication
First, login to get JWT token:

**POST /api/auth/login**
```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "fc769545b911ab2c", "role": "ADMIN" }
}
```

Use `Authorization: Bearer <token>` and `X-Tenant-Id: 1` in all requests.

## POST /api/workflow/request
Request a state transition for a task or project.

**Request:**
```json
{
  "tenantId": 1,
  "entityType": "TASK",
  "entityId": 123,
  "toState": "In Progress",
  "meta": {
    "reason": "Starting work on assigned task"
  }
}
```

**Response (Direct Transition - EMPLOYEE):**
```json
{
  "success": true,
  "data": {
    "status": "APPLIED"
  }
}
```

**Response (Approval Required - MANAGER):**
```json
{
  "success": true,
  "data": {
    "requestId": 456,
    "status": "PENDING_APPROVAL"
  }
}
```

## GET /api/workflow/pending?role=MANAGER
Get pending approval requests for a role.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 456,
      "tenant_id": 1,
      "entity_type": "TASK",
      "entity_id": 123,
      "from_state": "Review",
      "to_state": "Completed",
      "requested_by": 789,
      "reason": "Task completed",
      "created_at": "2023-01-01T00:00:00Z"
    }
  ]
}
```

## POST /api/workflow/approve
Approve or reject a pending request.

**Request:**
```json
{
  "requestId": 456,
  "approved": true,
  "reason": "Approved by manager"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "APPROVED"
  }
}
```

## POST /api/tasks/:id/complete
Complete a task using workflow (may require approval).

**Response (Direct Completion):**
```json
{
  "success": true,
  "message": "Task completed successfully",
  "workflow": {
    "status": "APPLIED"
  }
}
```

**Response (Approval Required):**
```json
{
  "success": true,
  "message": "Completion request submitted for approval",
  "workflow": {
    "requestId": 456,
    "status": "PENDING_APPROVAL"
  }
}
```

## Task Workflow States
- Draft → Assigned → In Progress → Review → Completed → Closed

## Project Workflow States
- Draft → Pending Approval → Active → On Hold → Completed → Archived

## Role Permissions
- **EMPLOYEE**: Assigned → In Progress, In Progress → Review
- **MANAGER**: Full transitions, approves Review → Completed
- **ADMIN**: All transitions, approves project changes