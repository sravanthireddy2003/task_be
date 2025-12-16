# Project & Task Management - Quick Start Guide

## Step 1: Database Setup
Run the migration to create all necessary tables:

```sql
-- Execute the migration file:
-- database/migrations/008_create_projects_tasks_schema.sql
```

Verify tables are created:
```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'your_db_name' AND TABLE_NAME LIKE 'project%' OR TABLE_NAME LIKE 'task%' OR TABLE_NAME LIKE 'subtask%';
```

Expected output:
- `projects`
- `project_departments`
- `tasks`
- `subtasks`
- `task_assignments`
- `subtask_assignments`
- `task_activity_logs`

---

## Step 2: Create a Project

**Endpoint:** `POST /api/projects`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "clientId": 1,
  "name": "Mobile App Redesign",
  "description": "Complete mobile app redesign and optimization",
  "departmentIds": [1, 2],
  "priority": "High",
  "projectManagerId": 5,
  "startDate": "2024-02-01",
  "endDate": "2024-04-30",
  "budget": 75000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123def456",
    "public_id": "abc123def456",
    "client_id": 1,
    "name": "Mobile App Redesign",
    "status": "Planning",
    "departments": [
      {
        "id": 1,
        "name": "IT",
        "public_id": "dept_001"
      },
      {
        "id": 2,
        "name": "Design",
        "public_id": "dept_002"
      }
    ]
  }
}
```

---

## Step 3: Create a Task

**Endpoint:** `POST /api/projects/tasks`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "projectId": "abc123def456",
  "departmentId": 2,
  "title": "Create UI mockups",
  "description": "Design mockups for all app screens",
  "priority": "High",
  "assignedTo": 3,
  "startDate": "2024-02-05",
  "endDate": "2024-02-15",
  "estimatedHours": 40
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "task123abc456",
    "public_id": "task123abc456",
    "project_id": 1,
    "department_id": 2,
    "title": "Create UI mockups",
    "status": "New",
    "assigned_user": {
      "id": "user_003",
      "name": "Jane Doe"
    },
    "estimated_hours": 40,
    "subtask_count": 0
  }
}
```

---

## Step 4: Create Subtasks

**Endpoint:** `POST /api/projects/subtasks`

**Request Body:**
```json
{
  "taskId": "task123abc456",
  "title": "Design login screen",
  "description": "Create mockup for user login flow",
  "priority": "High",
  "assignedTo": 3,
  "estimatedHours": 8
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "subtask001",
    "public_id": "subtask001",
    "task_id": 1,
    "project_id": 1,
    "department_id": 2,
    "title": "Design login screen",
    "status": "Open",
    "assigned_user": {
      "id": "user_003",
      "name": "Jane Doe"
    },
    "estimated_hours": 8
  }
}
```

---

## Step 5: List Tasks with Department Filter

**Endpoint:** `GET /api/projects/tasks?projectId=abc123def456&departmentId=2`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "task123abc456",
      "public_id": "task123abc456",
      "project_id": 1,
      "department_id": 2,
      "title": "Create UI mockups",
      "status": "New",
      "priority": "High",
      "assigned_user": {
        "id": "user_003",
        "name": "Jane Doe"
      },
      "estimated_hours": 40,
      "subtask_count": 3
    }
  ]
}
```

---

## Step 6: Update Task Status

**Endpoint:** `PUT /api/projects/tasks/task123abc456`

**Request Body:**
```json
{
  "status": "In Progress",
  "progressPercentage": 25
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "task123abc456",
    "status": "In Progress",
    "progress_percentage": 25,
    "updated_at": "2024-02-06T10:30:00Z"
  }
}
```

---

## Step 7: Get Task with All Subtasks

**Endpoint:** `GET /api/projects/tasks/task123abc456`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "task123abc456",
    "title": "Create UI mockups",
    "status": "In Progress",
    "subtask_count": 3,
    "subtasks": [
      {
        "id": "subtask001",
        "title": "Design login screen",
        "status": "In Progress",
        "assigned_user": {
          "id": "user_003",
          "name": "Jane Doe"
        },
        "progress_percentage": 50
      },
      {
        "id": "subtask002",
        "title": "Design dashboard",
        "status": "Open",
        "assigned_user": {
          "id": "user_004",
          "name": "John Developer"
        },
        "progress_percentage": 0
      },
      {
        "id": "subtask003",
        "title": "Design settings page",
        "status": "Open",
        "assigned_user": null,
        "progress_percentage": 0
      }
    ]
  }
}
```

---

## Step 8: List Subtasks for a Task

**Endpoint:** `GET /api/projects/tasks/task123abc456/subtasks`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "subtask001",
      "title": "Design login screen",
      "status": "In Progress",
      "priority": "High",
      "assigned_user": {
        "id": "user_003",
        "name": "Jane Doe"
      },
      "estimated_hours": 8,
      "actual_hours": 4,
      "progress_percentage": 50
    }
  ]
}
```

---

## Step 9: Update Subtask Status

**Endpoint:** `PUT /api/projects/subtasks/subtask001`

**Request Body:**
```json
{
  "status": "Completed",
  "actualHours": 8
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "subtask001",
    "status": "Completed",
    "actual_hours": 8
  }
}
```

---

## Step 10: Delete a Task (Cascades to Subtasks)

**Endpoint:** `DELETE /api/projects/tasks/task123abc456`

**Response:**
```json
{
  "success": true,
  "message": "Task deleted"
}
```

All associated subtasks are automatically deleted.

---

## Common Workflows

### Workflow 1: Project Team Setup
1. Create project with department mapping
2. Add project manager and team leads
3. Create tasks for each department
4. Assign team members to tasks
5. Create subtasks for detailed work breakdown

### Workflow 2: Daily Progress Update
1. List tasks for your department
2. Check subtask progress
3. Update subtask status and actual hours
4. Update task progress percentage
5. View activity logs for changes

### Workflow 3: Project Completion
1. Update all subtasks to "Completed"
2. Update all tasks to "Completed"
3. Update project status to "Completed"
4. Export activity logs for reporting

---

## Role-Based Access Examples

### Admin User - See All Projects
```
GET /api/projects
Returns: All projects across all departments
```

### Manager User - See Managed Department Projects
```
GET /api/projects
Returns: Projects from their managed departments + their own department
```

### Employee User - See Own Department Projects
```
GET /api/projects
Returns: Projects from their assigned department only
```

---

## Error Handling Examples

### Missing Required Field
```json
{
  "success": false,
  "message": "projectId, departmentId, and title are required"
}
```

### Unauthorized (No Token)
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### Department Not Linked to Project
```json
{
  "success": false,
  "message": "Department is not linked to this project"
}
```

### Resource Not Found
```json
{
  "success": false,
  "message": "Task not found"
}
```

---

## Testing with cURL

### Get Projects
```bash
curl -X GET http://localhost:3000/api/projects \
  -H "Authorization: Bearer eyJhbGc..."
```

### Create Task
```bash
curl -X POST http://localhost:3000/api/projects/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "projectId": "abc123",
    "departmentId": 1,
    "title": "New Task",
    "priority": "High"
  }'
```

### Update Task Status
```bash
curl -X PUT http://localhost:3000/api/projects/tasks/task123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "status": "In Progress",
    "progressPercentage": 50
  }'
```

### Delete Task
```bash
curl -X DELETE http://localhost:3000/api/projects/tasks/task123 \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Key Points to Remember

✅ Always include `Authorization` header with valid JWT token
✅ Use `projectId` and `departmentId` when creating tasks
✅ Subtasks automatically inherit project_id and department_id from parent task
✅ Department visibility controls who can see tasks (based on user's department_id)
✅ Status flows are enforced per resource type
✅ All changes are logged in task_activity_logs for audit trail
✅ Use `public_id` in API responses (not internal `_id`)
✅ Deleting a task cascades to all subtasks

---

## Next Steps

1. **Review** [PROJECT_TASK_MANAGEMENT_API.md](./PROJECT_TASK_MANAGEMENT_API.md) for detailed endpoint documentation
2. **Import** Postman collection for interactive testing
3. **Test** all endpoints with your authentication token
4. **Deploy** migration to production database
5. **Integrate** frontend with the API endpoints

