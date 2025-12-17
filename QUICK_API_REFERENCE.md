# Quick Start - Task API Reference

## ✅ All Task Endpoints Now Available

### Base Path
```
/api/projects/tasks
```

---

## Quick API Reference

### Create Task
```bash
POST /api/projects/tasks
{
  "title": "Task name",
  "priority": "HIGH",
  "stage": "TODO",
  "assigned_to": [23, 24],
  "projectId": 13
}
```

### List Tasks by Project
```bash
GET /api/projects/tasks?project_id=13
```

### Update Task ✨ NEW
```bash
PUT /api/projects/tasks/163
{
  "stage": "IN_PROGRESS",
  "priority": "CRITICAL"
}
```

### Delete Task ✨ NEW
```bash
DELETE /api/projects/tasks/163
```

---

## Authentication

All endpoints require Bearer token:
```bash
-H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Success Responses

### GET (List)
```json
{
  "success": true,
  "data": [ {...task}, {...task} ],
  "meta": { "count": 2 }
}
```

### POST (Create)
```json
{
  "message": "Task created successfully",
  "taskId": 164
}
```

### PUT (Update)
```json
{
  "success": true,
  "message": "Task updated successfully",
  "data": { "taskId": 163 }
}
```

### DELETE
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

## Error Responses

| Status | Error | Cause |
|--------|-------|-------|
| 400 | "No fields to update" | PUT with no body |
| 404 | "Task not found" | Task ID doesn't exist |
| 401 | "Invalid token" | Missing/invalid auth |
| 403 | "Insufficient permissions" | Not Admin/Manager |
| 500 | "Database error" | Server/DB issue |

---

## Field Reference

| Field | Type | Example |
|-------|------|---------|
| title | string | "Implement feature" |
| priority | string | "HIGH", "MEDIUM", "LOW" |
| stage | string | "TODO", "IN_PROGRESS", "DONE" |
| assigned_to | array | [23, 24] |
| projectId | number | 13 |
| taskDate | string | "2025-12-24" |
| time_alloted | number | 8 |
| description | string | "Task details..." |

---

## Common Use Cases

### Create & assign task
```bash
curl -X POST http://localhost:4000/api/projects/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review code",
    "priority": "HIGH",
    "assigned_to": [23],
    "projectId": 13,
    "stage": "TODO"
  }'
```

### Move task to in-progress
```bash
curl -X PUT http://localhost:4000/api/projects/tasks/163 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage": "IN_PROGRESS"}'
```

### Complete task
```bash
curl -X PUT http://localhost:4000/api/projects/tasks/163 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage": "DONE"}'
```

### Archive task
```bash
curl -X DELETE http://localhost:4000/api/projects/tasks/163 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Key Features

✅ Dynamic field updates (only update what you send)  
✅ Project scoping (tasks linked to projects)  
✅ User assignment (multiple users per task)  
✅ Cascading deletes (related records cleaned up)  
✅ Transaction safety (atomic operations)  
✅ Audit logging (all changes logged)  
✅ Error handling (proper HTTP status codes)  

---

## Troubleshooting

**Getting 404?**
- Verify task ID exists: `GET /api/projects/tasks?project_id=13`
- Check if task belongs to the project

**Getting 401?**
- Verify token is valid
- Check token format: `Authorization: Bearer YOUR_TOKEN`

**Getting 403?**
- Verify you have Admin or Manager role
- Check user permissions

**Getting 500?**
- Check server logs: `npm logs` or check console
- Verify database connection
- Check field names match schema

---

## Documentation Files

- 📖 [API_ENDPOINTS.md](API_ENDPOINTS.md) - Complete endpoint documentation
- 📋 [REST_API_IMPLEMENTATION.md](REST_API_IMPLEMENTATION.md) - Implementation details
- 🔄 [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) - Database changes
- ✅ [TASK_MIGRATION_CHECKLIST.md](TASK_MIGRATION_CHECKLIST.md) - Migration status

---

## Support

For detailed documentation, see [API_ENDPOINTS.md](API_ENDPOINTS.md)

All endpoints tested and ready for production use.
