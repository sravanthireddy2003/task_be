# Standardized Error Response Format

## Overview

All API errors should now use a standardized error response format for consistency across the application. This makes it easier for frontend developers to handle errors and provides better debugging information.

## Standard Error Format

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": {
    "code": "ERROR_CODE",
    "details": "Optional technical detail (e.g., database error message)",
    "field": "optional_field_name (for validation errors)"
  }
}
```

## Usage Examples

### Import the errorResponse utility

```javascript
const errorResponse = require(__root + 'utils/errorResponse');
```

### Bad Request (400)
```javascript
// Missing required field
return res.status(400).json(
  errorResponse.badRequest(
    'Project ID is required',
    'MISSING_PARAMETER',
    null,
    'projectId'
  )
);

// Invalid input
return res.status(400).json(
  errorResponse.badRequest(
    'Invalid date format',
    'INVALID_INPUT',
    { details: 'Expected ISO8601 format' }
  )
);
```

### Unauthorized (401)
```javascript
return res.status(401).json(
  errorResponse.unauthorized('Authentication required')
);
```

### Forbidden / Access Denied (403)
```javascript
return res.status(403).json(
  errorResponse.forbidden('Access denied to this resource')
);
```

### Not Found (404)
```javascript
return res.status(404).json(
  errorResponse.notFound('Task not found', 'TASK_NOT_FOUND')
);
```

### Conflict (409)
```javascript
return res.status(409).json(
  errorResponse.conflict(
    'User already exists with this email',
    'USER_EMAIL_DUPLICATE',
    null,
    'email'
  )
);
```

### Assignment Error (400)
Used when assigning tasks to users who already have active tasks
```javascript
return res.status(400).json(
  errorResponse.assignmentError(
    'The selected assignee already has an active task and cannot be assigned another until it is completed',
    'ASSIGNEE_ALREADY_ASSIGNED',
    { userId: 123 }
  )
);
```

### State Error (400)
Used when entity state conflicts with requested operation
```javascript
return res.status(400).json(
  errorResponse.stateError(
    'Cannot pause task. Only "In Progress" tasks can be paused',
    'INVALID_STATE_TRANSITION',
    { currentState: 'Completed' }
  )
);
```

### Validation Error (400)
```javascript
return res.status(400).json(
  errorResponse.validationError(
    'Title must be at least 3 characters long',
    'title',
    'VALIDATION_FAILED'
  )
);
```

### Database Error (500)
```javascript
return res.status(500).json(
  errorResponse.databaseError(
    'Database operation failed',
    'DB_ERROR',
    { details: err.message }
  )
);
```

### Server Error (500)
```javascript
return res.status(500).json(
  errorResponse.serverError(
    'Internal server error',
    'INTERNAL_ERROR',
    { details: err.message }
  )
);
```

## Error Codes Reference

| Code | Status | Description | Use Case |
|------|--------|-------------|----------|
| `MISSING_PARAMETER` | 400 | Required parameter missing | Missing query/body parameter |
| `INVALID_INPUT` | 400 | Input validation failed | Invalid data format or value |
| `BAD_REQUEST` | 400 | General bad request | Any client error |
| `NOT_FOUND` | 404 | Resource not found | Task, user, or project doesn't exist |
| `USER_EMAIL_DUPLICATE` | 409 | User email already exists | Creating user with existing email |
| `ASSIGNEE_ALREADY_ASSIGNED` | 400 | Assignee has active task | Task assignment conflict |
| `INVALID_STATE_TRANSITION` | 400 | Invalid state change | Task status change not allowed |
| `UNAUTHORIZED` | 401 | Authentication required | Missing or invalid token |
| `FORBIDDEN` | 403 | Access denied | User lacks permission |
| `CONFLICT` | 409 | Resource conflict | Pending request exists, etc. |
| `VALIDATION_ERROR` | 400 | Field validation failed | Name too short, email invalid, etc. |
| `DB_ERROR` | 500 | Database operation failed | Query execution error |
| `DB_UPDATE_ERROR` | 500 | Database update failed | UPDATE query failed |
| `DB_CONNECTION_ERROR` | 500 | Database connection failed | Cannot connect to DB |
| `INTERNAL_ERROR` | 500 | Server error | Unhandled exception |
| `PROJECT_NOT_FOUND` | 404 | Project not found | Project doesn't exist |
| `TASK_NOT_FOUND` | 404 | Task not found | Task doesn't exist |
| `WORKFLOW_REQUEST_ERROR` | 400 | Workflow request failed | Invalid workflow request |
| `PROJECT_CLOSURE_ERROR` | 400 | Project closure error | Cannot close project |
| `APPROVAL_PROCESSING_ERROR` | 400 | Approval failed | Approval process error |

## Migration Path

The codebase is being gradually updated to use this format. Key files updated:

- ✅ `src/utils/errorResponse.js` - New utility module
- ✅ `src/controllers/Tasks.js` - Critical assignment errors
- ✅ `src/workflow/workflowController.js` - Workflow errors
- ✅ `src/controllers/User.js` - User management errors
- 🔄 `src/controllers/managerController.js` - In progress
- 🔄 Other controllers - To be updated

## Response Examples

### Before (Old Format)
```json
{
  "success": false,
  "error": "User 51 already has an active task and cannot be assigned another until it is completed"
}
```

### After (New Format)
```json
{
  "success": false,
  "message": "The selected assignee already has an active task and cannot be assigned another until it is completed",
  "error": {
    "code": "ASSIGNEE_ALREADY_ASSIGNED",
    "details": null,
    "field": null,
    "userId": 51
  }
}
```

## Frontend Integration

Frontend developers should:

1. Check `success` field first
2. If `success` is false, read the `message` field for user-facing error
3. Handle specific error cases based on `error.code`
4. For validation errors, use `error.field` to highlight the form field
5. For debugging, log `error.details` and `error.code`

```javascript
// Example frontend error handling
try {
  const response = await fetch('/api/tasks', { method: 'POST', body: JSON.stringify(data) });
  const result = await response.json();
  
  if (!result.success) {
    if (result.error.code === 'ASSIGNEE_ALREADY_ASSIGNED') {
      showModalError('This person is already assigned to another task');
    } else if (result.error.code === 'MISSING_PARAMETER') {
      highlightField(result.error.field);
      showFieldError(result.error.field, result.message);
    } else {
      showGeneralError(result.message);
    }
  }
} catch (err) {
  showGeneralError('Network error. Please try again.');
}
```
