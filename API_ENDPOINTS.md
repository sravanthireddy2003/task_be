# Task Management API - Complete Endpoint Guide

## Overview
All task endpoints are now available under `/api/projects/tasks` with full CRUD support.

---

## Endpoints

### 1. Create Task
**Endpoint:** `POST /api/projects/tasks` (or `/api/tasks`)  
**Auth Required:** Bearer Token (Admin/Manager role)  
**Content-Type:** application/json

**Request Body:**
```json
{
  "title": "Task Title",
  "description": "Task description",
  "priority": "HIGH",
  "stage": "TODO",
  "taskDate": "2025-12-24",
  "assigned_to": [23, 24],
  "client_id": 55,
  "projectId": 13,
  "projectPublicId": "816240a5f94b7f1c",
  "time_alloted": 10
}
```

**Response:** 201 Created
```json
{
  "message": "Task created and email notifications sent successfully",
  "taskId": 164,
  "assignedUsers": [23, 24]
}
```

---

### 2. Get Tasks by Project
**Endpoint:** `GET /api/projects/tasks?project_id=13`  
**Auth Required:** Bearer Token  
**Optional Query Params:**
- `project_id=<numeric_id>` - Filter by numeric project ID
- `projectPublicId=<alphanumeric>` - Filter by public project ID

**Response:** 200 OK
```json
{
  "success": true,
  "data": [
    {
      "id": "162",
      "title": "task 1",
      "description": "task",
      "stage": "TODO",
      "taskDate": "2025-12-23T00:00:00.000Z",
      "priority": "MEDIUM",
      "timeAlloted": 45,
      "estimatedHours": 45,
      "status": null,
      "createdAt": "2025-12-16T16:30:10.000Z",
      "updatedAt": "2025-12-16T16:30:10.000Z",
      "client": {
        "id": "55",
        "name": "Client Name"
      },
      "assignedUsers": [
        {
          "id": "user_id",
          "internalId": "internal_id",
          "name": "User Name"
        }
      ]
    }
  ],
  "meta": {
    "count": 1
  }
}
```

---

### 3. Update Task
**Endpoint:** `PUT /api/projects/tasks/163`  
**Auth Required:** Bearer Token (Admin/Manager role)  
**Content-Type:** application/json

**Request Body:** (All fields optional, only send fields to update)
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "priority": "CRITICAL",
  "stage": "IN_PROGRESS",
  "taskDate": "2025-12-25",
  "time_alloted": 20,
  "assigned_to": [23, 25],
  "projectId": 13,
  "client_id": 55
}
```

**Response:** 200 OK
```json
{
  "success": true,
  "message": "Task updated successfully",
  "data": {
    "taskId": 163
  }
}
```

**Error Response:** 404 Not Found
```json
{
  "success": false,
  "error": "Task not found"
}
```

---

### 4. Delete Task
**Endpoint:** `DELETE /api/projects/tasks/163`  
**Auth Required:** Bearer Token (Admin/Manager role)

**Response:** 200 OK
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

**Cascading Deletes:**
- ✅ Deletes from `taskassignments` table
- ✅ Deletes from `task_assignments` table
- ✅ Deletes from `subtasks` table
- ✅ Deletes from `task_hours` table
- ✅ Deletes from `task_activities` table
- ✅ Finally deletes the task itself

---

## cURL Examples

### Create Task
```bash
curl -X POST http://localhost:4000/api/projects/tasks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Task",
    "description": "Task description",
    "priority": "HIGH",
    "stage": "TODO",
    "taskDate": "2025-12-24",
    "assigned_to": [23, 24],
    "projectId": 13,
    "time_alloted": 10
  }'
```

### Get Tasks by Project
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:4000/api/projects/tasks?project_id=13"
```

### Update Task
```bash
curl -X PUT http://localhost:4000/api/projects/tasks/163 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "priority": "CRITICAL",
    "stage": "IN_PROGRESS"
  }'
```

### Delete Task
```bash
curl -X DELETE http://localhost:4000/api/projects/tasks/163 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Task Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | String | Auto | Task ID (auto-generated) |
| title | String | ✅ Yes | Task title/name |
| description | String | No | Detailed task description |
| priority | String | No | Priority level: LOW, MEDIUM, HIGH, CRITICAL |
| stage | String | No | Stage/Status: TODO, IN_PROGRESS, REVIEW, DONE |
| taskDate | String (ISO) | No | Due date (YYYY-MM-DD or ISO format) |
| time_alloted | Number | No | Time allocated in hours |
| estimatedHours | Number | No | Estimated completion hours |
| status | String | No | Task status |
| client_id | Number | No | Associated client ID |
| projectId | Number | No | Associated project ID (numeric) |
| projectPublicId | String | No | Associated project public ID (alphanumeric) |
| assigned_to | Array | ✅ Yes | Array of user IDs to assign task to |
| createdAt | String (ISO) | Auto | Creation timestamp |
| updatedAt | String (ISO) | Auto | Last update timestamp |
| client | Object | Auto | { id, name } |
| assignedUsers | Array | Auto | [{ id, internalId, name }, ...] |

---

## Project Column References

Tasks now store project references in two columns:

1. **project_id** (INT NULL)
   - Numeric project identifier
   - Used for most project-scoped queries
   - Example: `13`

2. **project_public_id** (VARCHAR(255) NULL)
   - Alphanumeric public project identifier
   - Human-readable format
   - Example: `816240a5f94b7f1c`

Both are populated automatically when creating/updating tasks with project reference.

---

## Task Workflow Examples

### Complete Task Lifecycle

1. **Create task in a project:**
```bash
curl -X POST http://localhost:4000/api/projects/tasks \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement feature",
    "description": "Add new dashboard widget",
    "priority": "HIGH",
    "stage": "TODO",
    "assigned_to": [23],
    "projectId": 13,
    "time_alloted": 8
  }'
```

2. **Get all tasks in project:**
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:4000/api/projects/tasks?project_id=13"
```

3. **Update task to in-progress:**
```bash
curl -X PUT http://localhost:4000/api/projects/tasks/164 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "IN_PROGRESS",
    "assigned_to": [23, 24]
  }'
```

4. **Complete task:**
```bash
curl -X PUT http://localhost:4000/api/projects/tasks/164 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "DONE"
  }'
```

5. **Archive/Delete when needed:**
```bash
curl -X DELETE http://localhost:4000/api/projects/tasks/164 \
  -H "Authorization: Bearer TOKEN"
```

---

## Error Handling

### 404 - Task Not Found
```json
{
  "success": false,
  "error": "Task not found"
}
```

### 400 - Bad Request (No fields to update)
```json
{
  "success": false,
  "error": "No fields to update"
}
```

### 401 - Unauthorized
```json
{
  "message": "Invalid token",
  "error": "jwt malformed"
}
```

### 403 - Forbidden (Insufficient permissions)
```json
{
  "error": "Insufficient permissions"
}
```

### 500 - Server Error
```json
{
  "success": false,
  "error": "Database error"
}
```

---

## Testing Checklist

- [ ] Create task with project reference
- [ ] List tasks by project ID
- [ ] List tasks by project public ID
- [ ] Update task details
- [ ] Update task stage/status
- [ ] Reassign task to different users
- [ ] Delete task (verify cascade deletes)
- [ ] Verify timestamps are ISO format
- [ ] Verify response includes all required fields
- [ ] Verify authentication/authorization works
- [ ] Test with missing required fields
- [ ] Test with invalid project ID

---

## Important Notes

1. **Authentication:** All endpoints require valid JWT Bearer token in `Authorization` header
2. **Authorization:** PUT/DELETE require Admin or Manager role
3. **Cascading Deletes:** Deleting a task also deletes all related:
   - Task assignments
   - Subtasks
   - Task hours records
   - Task activity logs
4. **Timestamps:** All timestamps are in ISO 8601 format (UTC)
5. **User IDs:** Can be numeric internal IDs or public_id strings when assigning tasks
