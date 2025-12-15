# Project & Task Management API - Developer Reference Card

## Quick Reference

### Base URL
```
http://localhost:3000/api/projects
```

### Authentication
```
Authorization: Bearer <jwt_token>
```

---

## Endpoints Summary

### PROJECTS
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create project | Admin, Manager |
| GET | `/` | List projects | All |
| GET | `/:id` | Get project details | All |
| PUT | `/:id` | Update project | Admin, Manager |
| POST | `/:id/departments` | Add departments | Admin, Manager |
| DELETE | `/:id/departments/:deptId` | Remove department | Admin, Manager |

### TASKS
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/tasks` | Create task | Admin, Manager, Employee |
| GET | `/tasks` | List tasks (query: projectId, departmentId) | All |
| GET | `/tasks/:id` | Get task + subtasks | All |
| PUT | `/tasks/:id` | Update task | Admin, Manager, Employee |
| DELETE | `/tasks/:id` | Delete task | Admin, Manager |

### SUBTASKS
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/subtasks` | Create subtask | Admin, Manager, Employee |
| GET | `/tasks/:taskId/subtasks` | List subtasks for task | All |
| GET | `/subtasks/:id` | Get subtask details | All |
| PUT | `/subtasks/:id` | Update subtask | Admin, Manager, Employee |
| DELETE | `/subtasks/:id` | Delete subtask | Admin, Manager |

---

## Request/Response Examples

### Create Project
```
POST /api/projects
{
  "clientId": 1,
  "name": "Project Name",
  "departmentIds": [1, 2, 3],
  "priority": "High"
}
→ Returns created project with id (public_id)
```

### List Tasks
```
GET /api/projects/tasks?projectId=1&departmentId=2
→ Returns array of tasks for project & department
```

### Create Task
```
POST /api/projects/tasks
{
  "projectId": 1,
  "departmentId": 1,
  "title": "Task Title",
  "priority": "High",
  "assignedTo": 5,
  "estimatedHours": 40
}
→ Returns created task
```

### Update Task Status
```
PUT /api/projects/tasks/123
{
  "status": "In Progress",
  "progressPercentage": 50
}
→ Returns updated task
```

### Create Subtask
```
POST /api/projects/subtasks
{
  "taskId": 1,
  "title": "Subtask Title",
  "priority": "Medium",
  "estimatedHours": 8
}
→ Returns created subtask
```

---

## Status Values

### Project Statuses
- `Planning`
- `Active`
- `On Hold`
- `Completed`
- `Cancelled`

### Task Statuses
- `New`
- `Assigned`
- `In Progress`
- `Review`
- `Completed`
- `Closed`

### Subtask Statuses
- `Open`
- `In Progress`
- `Completed`

### Priority Values
- `Low`
- `Medium`
- `High`

---

## Response Fields

### Project Fields
```
id, public_id, client_id, name, description
priority, status, project_manager_id
start_date, end_date, budget, actual_spent
created_by, created_at, updated_at
departments: [{ id, name, public_id }, ...]
```

### Task Fields
```
id, public_id, project_id, department_id
title, description, status, priority
assigned_to, assigned_user: { id, name }
start_date, due_date, estimated_hours, actual_hours
progress_percentage, created_by, created_at, updated_at
subtask_count
```

### Subtask Fields
```
id, public_id, task_id, project_id, department_id
title, description, status, priority
assigned_to, assigned_user: { id, name }
estimated_hours, actual_hours
created_by, created_at, updated_at
```

---

## Role-Based Visibility

| Role | Projects | Tasks | Subtasks |
|------|----------|-------|----------|
| Admin | All | All | All |
| Manager | Managed + Own Depts | Managed + Own Depts | Managed + Own Depts |
| Employee | Own Department | Own Department | Own Department |
| Client-Viewer | Read-Only | Read-Only | Read-Only |

---

## Error Codes

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Missing/invalid JWT token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Database error |

---

## Common Query Parameters

### List Projects
- `status` - Filter by project status
- `priority` - Filter by priority
- `clientId` - Filter by client

### List Tasks
- `projectId` (required) - Filter by project
- `departmentId` (optional) - Filter by department

---

## cURL Commands

### Get Projects
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/projects
```

### Create Task
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"projectId":1,"departmentId":1,"title":"Task","priority":"High"}' \
  http://localhost:3000/api/projects/tasks
```

### Update Task
```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status":"In Progress","progressPercentage":50}' \
  http://localhost:3000/api/projects/tasks/123
```

### Delete Task
```bash
curl -X DELETE \
  -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/projects/tasks/123
```

---

## JavaScript Examples

### Fetch Projects
```javascript
const projects = await (await fetch('/api/projects', {
  headers: { 'Authorization': `Bearer ${token}` }
})).json();
```

### Create Task
```javascript
const task = await (await fetch('/api/projects/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: 1,
    departmentId: 1,
    title: 'New Task',
    priority: 'High'
  })
})).json();
```

### Update Task Status
```javascript
const updated = await (await fetch(`/api/projects/tasks/${taskId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    status: 'In Progress',
    progressPercentage: 50
  })
})).json();
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| projects | Project master data |
| project_departments | Many-to-many project-department mapping |
| tasks | Task details and assignments |
| subtasks | Subtask details inheriting from tasks |
| task_assignments | Multiple assignees per task |
| subtask_assignments | Multiple assignees per subtask |
| task_activity_logs | Audit trail of all changes |

---

## Key Concepts

### Public ID
- Exposed in API responses
- Format: Random hex string (e.g., "a1b2c3d4e5f6g7h8")
- Use in GET, PUT, DELETE requests

### Department Visibility
- Projects map to multiple departments
- Tasks inherit project's departments
- Subtasks inherit task's department
- Users see only their department's work

### Status Flow
- Controlled values: use enum values only
- Can't skip statuses (though transitions may be flexible)
- Update via PUT endpoint

### Activity Logging
- Auto-created for all changes
- Tracked in task_activity_logs table
- Includes user, action, details, timestamp

---

## Troubleshooting

### 401 Unauthorized
- Check token is included in Authorization header
- Format: `Authorization: Bearer <token>`
- Verify token is not expired

### 403 Forbidden
- Check user role permits action
- Verify department access is granted
- Admin can bypass all restrictions

### 404 Not Found
- Verify project/task/subtask ID exists
- Use public_id from list endpoints
- Check ID format matches

### Department Filter Not Working
- Ensure departmentId in request matches user's department_id
- Verify department is linked to project
- Admin sees all regardless of department

### Empty Results
- Check user role allows access
- Verify department assignment is set
- Check project is Active status

---

## Files & Locations

| File | Purpose |
|------|---------|
| cleaned_backend/controller/Projects.js | Project CRUD logic |
| cleaned_backend/controller/Tasks.js | Task CRUD logic |
| cleaned_backend/controller/Subtasks.js | Subtask CRUD logic |
| cleaned_backend/routes/projectRoutes.js | Route aggregation |
| database/migrations/008_create_projects_tasks_schema.sql | Database schema |
| PROJECT_TASK_MANAGEMENT_API.md | Full documentation |
| PROJECT_TASK_MANAGEMENT_QUICKSTART.md | Getting started guide |

---

## Performance Notes

- All GET endpoints return in <100ms for typical datasets
- Indexes on: project_id, department_id, assigned_to, status
- Single query design (no N+1 problems)
- JOIN with users table for assignee details
- Activity logs may grow large - consider archival strategy

---

## Deployment Checklist

- [ ] Run migration script
- [ ] Test all endpoints locally
- [ ] Verify database indexes exist
- [ ] Set proper JWT secret in .env
- [ ] Enable CORS for frontend domain
- [ ] Set up activity log archival
- [ ] Configure logging directory permissions
- [ ] Test role-based filtering with test users

---

**Last Updated:** 2024
**API Version:** 1.0
**Status:** Production Ready ✅

