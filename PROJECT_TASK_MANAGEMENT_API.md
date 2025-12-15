# Project & Task Management API Documentation

## Overview
Complete REST API for department-wise project management with role-based access control. Features include:
- Project creation and management by client
- Department-wise visibility and filtering
- Task and subtask creation with inheritance
- Activity logging and audit trails
- Role-based access control (Admin, Manager, Employee)

---

## Authentication
All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

**User Roles:**
- **Admin**: Full access to all projects, tasks, subtasks
- **Manager**: Access to projects in their managed departments + their own department
- **Employee**: Access to projects in their assigned department only

---

## PROJECT ENDPOINTS

### 1. Create Project
**POST** `/api/projects`

Creates a new project and links it to specified departments.

**Required Permissions:** Admin, Manager

**Request Body:**
```json
{
  "clientId": 1,
  "name": "Website Redesign",
  "description": "Complete website overhaul",
  "departmentIds": [1, 2, 3],
  "priority": "High",
  "projectManagerId": 5,
  "startDate": "2024-01-15",
  "endDate": "2024-03-31",
  "budget": 50000
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4e5f6g7h8",
    "public_id": "a1b2c3d4e5f6g7h8",
    "client_id": 1,
    "name": "Website Redesign",
    "description": "Complete website overhaul",
    "priority": "High",
    "status": "Planning",
    "project_manager_id": 5,
    "start_date": "2024-01-15",
    "end_date": "2024-03-31",
    "budget": 50000,
    "created_by": 2,
    "created_at": "2024-01-10T10:30:00Z",
    "updated_at": "2024-01-10T10:30:00Z",
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
      },
      {
        "id": 3,
        "name": "Marketing",
        "public_id": "dept_003"
      }
    ]
  }
}
```

---

### 2. List Projects
**GET** `/api/projects`

List all projects with role-based visibility filtering.

**Query Parameters:**
- `status` (optional): Filter by status (Planning, Active, On Hold, Completed, Cancelled)
- `priority` (optional): Filter by priority (Low, Medium, High)
- `clientId` (optional): Filter by client

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4e5f6g7h8",
      "public_id": "a1b2c3d4e5f6g7h8",
      "client_id": 1,
      "name": "Website Redesign",
      "description": "Complete website overhaul",
      "priority": "High",
      "status": "Active",
      "project_manager_id": 5,
      "project_manager_name": "John Smith",
      "start_date": "2024-01-15",
      "end_date": "2024-03-31",
      "budget": 50000,
      "created_at": "2024-01-10T10:30:00Z",
      "departments": [
        {
          "id": 1,
          "name": "IT",
          "public_id": "dept_001"
        }
      ]
    }
  ]
}
```

**Role-Based Filtering:**
- **Admin**: Sees all projects
- **Manager**: Sees projects from their managed departments + their own department
- **Employee**: Sees only projects from their assigned department

---

### 3. Get Project Details
**GET** `/api/projects/:id`

Fetch a single project with all linked departments.

**Path Parameters:**
- `id`: Project ID (numeric or public_id)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4e5f6g7h8",
    "public_id": "a1b2c3d4e5f6g7h8",
    "client_id": 1,
    "name": "Website Redesign",
    "description": "Complete website overhaul",
    "priority": "High",
    "status": "Active",
    "project_manager_id": 5,
    "project_manager_name": "John Smith",
    "start_date": "2024-01-15",
    "end_date": "2024-03-31",
    "budget": 50000,
    "actual_spent": 12500,
    "created_by": 2,
    "created_at": "2024-01-10T10:30:00Z",
    "updated_at": "2024-01-10T10:30:00Z",
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

### 4. Update Project
**PUT** `/api/projects/:id`

Update project details (name, description, status, priority, dates, budget).

**Path Parameters:**
- `id`: Project ID

**Request Body (all fields optional):**
```json
{
  "name": "Website Redesign V2",
  "description": "Updated description",
  "status": "Active",
  "priority": "Medium",
  "startDate": "2024-01-15",
  "endDate": "2024-04-30",
  "budget": 55000
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4e5f6g7h8",
    "public_id": "a1b2c3d4e5f6g7h8",
    "client_id": 1,
    "name": "Website Redesign V2",
    "description": "Updated description",
    "priority": "Medium",
    "status": "Active",
    "start_date": "2024-01-15",
    "end_date": "2024-04-30",
    "budget": 55000,
    "updated_at": "2024-01-10T11:15:00Z"
  }
}
```

---

### 5. Add Departments to Project
**POST** `/api/projects/:id/departments`

Link additional departments to an existing project.

**Path Parameters:**
- `id`: Project ID

**Request Body:**
```json
{
  "departmentIds": [4, 5]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Departments added to project",
  "data": {
    "project_id": 1,
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
      },
      {
        "id": 4,
        "name": "Finance",
        "public_id": "dept_004"
      },
      {
        "id": 5,
        "name": "HR",
        "public_id": "dept_005"
      }
    ]
  }
}
```

---

### 6. Remove Department from Project
**DELETE** `/api/projects/:id/departments/:deptId`

Unlink a department from a project.

**Path Parameters:**
- `id`: Project ID
- `deptId`: Department ID to remove

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Department removed from project",
  "data": {
    "project_id": 1,
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

## TASK ENDPOINTS

### 7. Create Task
**POST** `/api/projects/tasks`

Create a new task within a project and department.

**Required Permissions:** Admin, Manager, Employee

**Request Body:**
```json
{
  "projectId": "a1b2c3d4e5f6g7h8",
  "departmentId": 1,
  "title": "Design Homepage",
  "description": "Create mockups and design components",
  "priority": "High",
  "assignedTo": 3,
  "startDate": "2024-01-15",
  "endDate": "2024-01-25",
  "estimatedHours": 40
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "t1a2b3c4d5e6f7g8",
    "public_id": "t1a2b3c4d5e6f7g8",
    "project_id": 1,
    "department_id": 1,
    "title": "Design Homepage",
    "description": "Create mockups and design components",
    "priority": "High",
    "status": "New",
    "assigned_to": 3,
    "assigned_user": {
      "id": "user_003",
      "name": "Jane Doe"
    },
    "start_date": "2024-01-15",
    "due_date": "2024-01-25",
    "estimated_hours": 40,
    "progress_percentage": 0,
    "created_by": 2,
    "created_at": "2024-01-10T10:30:00Z",
    "subtask_count": 0
  }
}
```

---

### 8. List Tasks (Project & Department-Aware)
**GET** `/api/projects/tasks?projectId=X&departmentId=Y`

Fetch tasks for a project, optionally filtered by department.

**Query Parameters:**
- `projectId` (required): Project ID
- `departmentId` (optional): Department ID to filter tasks

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "t1a2b3c4d5e6f7g8",
      "public_id": "t1a2b3c4d5e6f7g8",
      "project_id": 1,
      "department_id": 1,
      "title": "Design Homepage",
      "priority": "High",
      "status": "In Progress",
      "assigned_user": {
        "id": "user_003",
        "name": "Jane Doe"
      },
      "estimated_hours": 40,
      "progress_percentage": 50,
      "due_date": "2024-01-25",
      "subtask_count": 3,
      "created_at": "2024-01-10T10:30:00Z"
    },
    {
      "id": "t2b3c4d5e6f7g8h9",
      "public_id": "t2b3c4d5e6f7g8h9",
      "project_id": 1,
      "department_id": 1,
      "title": "Create CSS Framework",
      "priority": "Medium",
      "status": "Assigned",
      "assigned_user": {
        "id": "user_004",
        "name": "John Developer"
      },
      "estimated_hours": 30,
      "progress_percentage": 0,
      "due_date": "2024-02-01",
      "subtask_count": 2,
      "created_at": "2024-01-10T10:35:00Z"
    }
  ]
}
```

**Role-Based Behavior:**
- **Admin**: Returns all tasks for the project
- **Manager/Employee**: Returns only tasks from their assigned department

---

### 9. Get Task Details
**GET** `/api/projects/tasks/:id`

Fetch a single task with all associated subtasks.

**Path Parameters:**
- `id`: Task ID (numeric or public_id)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "t1a2b3c4d5e6f7g8",
    "public_id": "t1a2b3c4d5e6f7g8",
    "project_id": 1,
    "department_id": 1,
    "title": "Design Homepage",
    "description": "Create mockups and design components",
    "priority": "High",
    "status": "In Progress",
    "assigned_to": 3,
    "assigned_user": {
      "id": "user_003",
      "name": "Jane Doe"
    },
    "start_date": "2024-01-15",
    "due_date": "2024-01-25",
    "estimated_hours": 40,
    "actual_hours": 20,
    "progress_percentage": 50,
    "created_by": 2,
    "created_at": "2024-01-10T10:30:00Z",
    "updated_at": "2024-01-10T12:00:00Z",
    "subtask_count": 3,
    "subtasks": [
      {
        "id": "st1a2b3c4d5e6f7g8",
        "public_id": "st1a2b3c4d5e6f7g8",
        "task_id": 1,
        "title": "Create wireframes",
        "status": "Completed",
        "assigned_user": {
          "id": "user_003",
          "name": "Jane Doe"
        },
        "estimated_hours": 8,
        "actual_hours": 8
      }
    ]
  }
}
```

---

### 10. Update Task
**PUT** `/api/projects/tasks/:id`

Update task details (status, priority, assignee, dates, progress).

**Path Parameters:**
- `id`: Task ID

**Request Body (all fields optional):**
```json
{
  "title": "Design Homepage v2",
  "description": "Updated description",
  "status": "In Progress",
  "priority": "Medium",
  "assignedTo": 5,
  "startDate": "2024-01-15",
  "endDate": "2024-02-01",
  "estimatedHours": 50,
  "actualHours": 25,
  "progressPercentage": 50
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "t1a2b3c4d5e6f7g8",
    "public_id": "t1a2b3c4d5e6f7g8",
    "project_id": 1,
    "title": "Design Homepage v2",
    "status": "In Progress",
    "priority": "Medium",
    "assigned_to": 5,
    "estimated_hours": 50,
    "actual_hours": 25,
    "progress_percentage": 50,
    "updated_at": "2024-01-10T12:00:00Z"
  }
}
```

---

### 11. Delete Task
**DELETE** `/api/projects/tasks/:id`

Delete a task and all associated subtasks.

**Required Permissions:** Admin, Manager

**Path Parameters:**
- `id`: Task ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Task deleted"
}
```

---

## SUBTASK ENDPOINTS

### 12. Create Subtask
**POST** `/api/projects/subtasks`

Create a new subtask for a task. Inherits project_id and department_id from parent task.

**Required Permissions:** Admin, Manager, Employee

**Request Body:**
```json
{
  "taskId": "t1a2b3c4d5e6f7g8",
  "title": "Create mobile mockup",
  "description": "Design for iPhone 12",
  "priority": "High",
  "assignedTo": 4,
  "estimatedHours": 8
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "st2b3c4d5e6f7g8h9",
    "public_id": "st2b3c4d5e6f7g8h9",
    "task_id": 1,
    "project_id": 1,
    "department_id": 1,
    "title": "Create mobile mockup",
    "description": "Design for iPhone 12",
    "priority": "High",
    "status": "Open",
    "assigned_to": 4,
    "assigned_user": {
      "id": "user_004",
      "name": "John Developer"
    },
    "estimated_hours": 8,
    "progress_percentage": 0,
    "created_by": 2,
    "created_at": "2024-01-10T10:45:00Z"
  }
}
```

---

### 13. List Subtasks for Task
**GET** `/api/projects/tasks/:taskId/subtasks`

Fetch all subtasks for a specific task.

**Path Parameters:**
- `taskId`: Parent task ID (numeric or public_id)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "st1a2b3c4d5e6f7g8",
      "public_id": "st1a2b3c4d5e6f7g8",
      "task_id": 1,
      "project_id": 1,
      "department_id": 1,
      "title": "Create wireframes",
      "priority": "High",
      "status": "Completed",
      "assigned_user": {
        "id": "user_003",
        "name": "Jane Doe"
      },
      "estimated_hours": 8,
      "actual_hours": 8,
      "progress_percentage": 100,
      "created_at": "2024-01-10T10:30:00Z"
    },
    {
      "id": "st2b3c4d5e6f7g8h9",
      "public_id": "st2b3c4d5e6f7g8h9",
      "task_id": 1,
      "project_id": 1,
      "department_id": 1,
      "title": "Create mobile mockup",
      "priority": "High",
      "status": "In Progress",
      "assigned_user": {
        "id": "user_004",
        "name": "John Developer"
      },
      "estimated_hours": 8,
      "actual_hours": 3,
      "progress_percentage": 30,
      "created_at": "2024-01-10T10:45:00Z"
    }
  ]
}
```

---

### 14. Get Subtask Details
**GET** `/api/projects/subtasks/:id`

Fetch a single subtask.

**Path Parameters:**
- `id`: Subtask ID (numeric or public_id)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "st1a2b3c4d5e6f7g8",
    "public_id": "st1a2b3c4d5e6f7g8",
    "task_id": 1,
    "project_id": 1,
    "department_id": 1,
    "title": "Create wireframes",
    "description": "Design wireframes for all pages",
    "priority": "High",
    "status": "Completed",
    "assigned_to": 3,
    "assigned_user": {
      "id": "user_003",
      "name": "Jane Doe"
    },
    "estimated_hours": 8,
    "actual_hours": 8,
    "progress_percentage": 100,
    "created_by": 2,
    "created_at": "2024-01-10T10:30:00Z",
    "updated_at": "2024-01-10T18:00:00Z"
  }
}
```

---

### 15. Update Subtask
**PUT** `/api/projects/subtasks/:id`

Update subtask details (status, priority, assignee, hours, progress).

**Path Parameters:**
- `id`: Subtask ID

**Request Body (all fields optional):**
```json
{
  "title": "Create wireframes v2",
  "description": "Updated description",
  "status": "Completed",
  "priority": "Medium",
  "assignedTo": 5,
  "estimatedHours": 10,
  "actualHours": 8
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "st1a2b3c4d5e6f7g8",
    "public_id": "st1a2b3c4d5e6f7g8",
    "task_id": 1,
    "title": "Create wireframes v2",
    "status": "Completed",
    "assigned_to": 5,
    "actual_hours": 8,
    "updated_at": "2024-01-10T14:00:00Z"
  }
}
```

---

### 16. Delete Subtask
**DELETE** `/api/projects/subtasks/:id`

Delete a subtask.

**Required Permissions:** Admin, Manager

**Path Parameters:**
- `id`: Subtask ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Subtask deleted"
}
```

---

## STATUS FLOWS

### Task Status Enum
- `New` - Initial creation
- `Assigned` - Assigned to a user
- `In Progress` - Work has begun
- `Review` - Awaiting review
- `Completed` - Work finished
- `Closed` - Closed/archived

### Subtask Status Enum
- `Open` - Initial creation
- `In Progress` - Work has begun
- `Completed` - Work finished

### Project Status Enum
- `Planning` - Initial phase
- `Active` - Execution phase
- `On Hold` - Paused
- `Completed` - Finished
- `Cancelled` - Cancelled

---

## ERROR RESPONSES

### 400 Bad Request
```json
{
  "success": false,
  "message": "projectId, departmentId, and title are required"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 403 Forbidden (Insufficient Permissions)
```json
{
  "success": false,
  "message": "Access denied"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Project not found"
}
```

### 500 Server Error
```json
{
  "success": false,
  "error": "Error message"
}
```

---

## DEPARTMENT-WISE VISIBILITY RULES

**Projects Visibility:**
- **Admin**: All projects
- **Manager**: Projects from departments they manage OR their own department
- **Employee**: Projects from their department only

**Tasks/Subtasks Visibility:**
- **Admin**: All tasks/subtasks
- **Manager/Employee**: Only tasks/subtasks from their department

**Department Visibility:**
- Tasks inherit and are filtered by project's linked departments
- Subtasks inherit parent task's department
- Cross-department collaboration via project_departments mapping

---

## INTEGRATION GUIDE

### Frontend Implementation Example (JavaScript)

```javascript
// Create a project
const createProject = async (projectData) => {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(projectData)
  });
  return response.json();
};

// Fetch tasks for a project
const fetchTasks = async (projectId, departmentId = null) => {
  let url = `/api/projects/tasks?projectId=${projectId}`;
  if (departmentId) url += `&departmentId=${departmentId}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// Create a task
const createTask = async (taskData) => {
  const response = await fetch('/api/projects/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(taskData)
  });
  return response.json();
};

// Create a subtask
const createSubtask = async (subtaskData) => {
  const response = await fetch('/api/projects/subtasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(subtaskData)
  });
  return response.json();
};
```

---

## TESTING WITH POSTMAN

Import the [postman_projects_api_collection.json](./postman_projects_api_collection.json) for complete API testing environment with pre-configured endpoints and example requests.

---

## NOTES

- All IDs in responses use `public_id` for API consistency
- Database stores `_id` (internal) for foreign key relationships
- `created_by` field tracks which user created the resource
- Activity logs automatically track all changes in `task_activity_logs` table
- Department assignment from project_departments table automatically restricts visibility
- Timestamps in ISO 8601 format (UTC)

