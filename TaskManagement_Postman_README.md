# Task Management API - Single User Ownership

## Overview

This Postman collection provides comprehensive testing coverage for the Task Management System with Single-User Ownership. The system enforces strict single-user assignment per task while supporting reassignment workflows, time tracking, subtasks, and role-based permissions.

## Key Features

- ✅ **Single-User Ownership**: All tasks must have exactly one assignee
- ✅ **Reassignment Workflow**: Employees can request reassignment, managers approve/reject
- ✅ **Role-Based Permissions**: Different access levels for Admin/Manager/Employee
- ✅ **Time Tracking**: Start/pause/resume/complete with automatic duration calculation
- ✅ **Subtasks**: Checklist functionality for task breakdown
- ✅ **Read-Only Access**: Previous assignees retain read-only access after reassignment

## Setup Instructions

### 1. Import the Collection
1. Open Postman
2. Click "Import" button
3. Select "File"
4. Choose `TaskManagement_SingleUserOwnership.postman_collection.json`
5. Click "Import"

### 2. Set Environment Variables
Create a new environment in Postman with these variables:

| Variable | Initial Value | Description |
|----------|---------------|-------------|
| `base_url` | `http://localhost:4000` | Your API base URL |
| `admin_token` | (empty) | JWT token for admin user |
| `manager_token` | (empty) | JWT token for manager user |
| `employee_token` | (empty) | JWT token for employee user |
| `task_id` | (empty) | Auto-set when creating tasks |
| `project_id` | (empty) | Set to your test project ID |
| `request_id` | (empty) | Auto-set when creating reassignment requests |

### 3. Authentication Setup
1. Run the login requests in the "Authentication" folder first
2. Tokens will be automatically stored in environment variables
3. Use the appropriate token for each role's requests

## Collection Structure

### Authentication
- **Admin Login**: Get admin JWT token
- **Manager Login**: Get manager JWT token
- **Employee Login**: Get employee JWT token

### Task CRUD Operations
- **Create Task (Manager)**: Create new task with single assignee
- **Get Tasks by Project**: Retrieve tasks for a project
- **Get Task Details**: Get detailed task information
- **Update Task (Manager - Reassign)**: Update task details and reassign

### Task Status Updates
- **Update Task Status (Employee)**: Change task status (Task Head only)
- **Start Task Timer**: Begin time tracking
- **Pause Task Timer**: Pause active timer
- **Complete Task**: Mark task as completed

### Reassignment Management
- **Request Task Reassignment (Employee)**: Submit reassignment request
- **Get Reassignment Requests (Manager)**: View pending requests
- **Approve Reassignment Request (Manager)**: Approve and reassign
- **Reject Reassignment Request (Manager)**: Reject request

### Task Time Tracking
- **Log Working Hours**: Manually log hours worked
- **Get Task Hours Summary**: Get hours summary for user

### Task Subtasks (Checklists)
- **Create Subtask**: Add checklist item to task
- **Get Subtasks for Task**: Retrieve all subtasks
- **Update Subtask**: Modify subtask details
- **Complete Subtask**: Mark subtask as done

### Error Scenarios
- **Create Task - Multiple Assignees**: Should fail validation
- **Update Status - Read-Only User**: Should fail permissions
- **Request Reassignment - Not Assigned**: Should fail validation

## Testing Workflow

### Happy Path Testing
1. **Login** as different roles to get tokens
2. **Create Task** as manager with single assignee
3. **Update Status** as employee (Task Head)
4. **Start/Pause/Complete** timer as employee
5. **Request Reassignment** as employee
6. **Approve/Reject** request as manager
7. **Create Subtasks** and manage them
8. **Log Hours** and view summaries

### Permission Testing
- Try accessing endpoints with wrong role tokens
- Test read-only user restrictions
- Verify single-user ownership enforcement

### Error Testing
- Create tasks with multiple assignees
- Update status with read-only access
- Request reassignment for unassigned tasks

## Response Examples

### Successful Task Creation
```json
{
  "success": true,
  "data": {
    "id": "task_abc123",
    "title": "Implement user authentication",
    "assignedUsers": [
      {
        "id": "user_456",
        "name": "John Doe",
        "readOnly": false
      }
    ],
    "status": "To Do",
    "createdAt": "2026-01-07T10:00:00.000Z"
  }
}
```

### Reassignment Request Response
```json
{
  "success": true,
  "message": "✅ Task LOCKED (On Hold) - Manager notified",
  "request_id": 123,
  "task_status": "On Hold",
  "manager_id": "mgr_789"
}
```

### Permission Error
```json
{
  "success": false,
  "error": "Only the Task Head can update task status"
}
```

## Important Notes

- **Single User Ownership**: All `assigned_to` arrays must contain exactly one user ID
- **Task Head**: Only the current non-read-only assignee can update status and manage timers
- **Read-Only Access**: Previous assignees retain read-only access after reassignment
- **Status Transitions**: Tasks follow specific status workflows with validation
- **Timer Management**: Start/pause/resume actions are restricted to Task Head

## Troubleshooting

### Common Issues
1. **401 Unauthorized**: Check if token is set and valid
2. **403 Forbidden**: Verify user has correct permissions for the action
3. **400 Bad Request**: Check request body format and required fields
4. **404 Not Found**: Verify task/project IDs exist

### Token Management
- Tokens expire, so re-run login requests if you get auth errors
- Each role has different permissions, use appropriate tokens
- Environment variables auto-update when new tokens are obtained

This collection provides complete API testing coverage for the single-user ownership task management system. Use it to validate all functionality and ensure proper permission enforcement.