// Employee Tasks Kanban Workflow Postman Collection
// Export this as a JavaScript module for easy import

const employeeTasksCollection = {
  "info": {
    "name": "TaskBe - Employee Tasks Kanban Workflow",
    "_postman_id": "employee-tasks-kanban-2025",
    "description": "Complete Postman collection for Employee role Kanban workflow - Bitrix24-style task management with time tracking, status transitions, and strict role-based access control.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "🔐 Authentication",
      "item": [
        {
          "name": "Employee Login",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "email": "employee@example.com",
                "password": "password123"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "login"]
            }
          },
          "response": [
            {
              "name": "Employee Login Success",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "token": "jwt_token_here",
                "user": {
                  "_id": 25,
                  "name": "Employee User",
                  "email": "employee@example.com",
                  "role": "Employee",
                  "public_id": "employee123"
                }
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      "name": "👷 Employee - Kanban Workflow",
      "item": [
        {
          "name": "Get Assigned Projects",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects"]
            }
          },
          "response": [
            {
              "name": "Employee Projects",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "data": [
                  {
                    "id": "abc123def",
                    "name": "Kanban Project Alpha",
                    "status": "Planning",
                    "departments": [
                      {"public_id": "dev-team-1", "name": "Development Team"}
                    ]
                  }
                ]
              }, null, 2)
            }
          ]
        },
        {
          "name": "Load Kanban Board (Project Tasks)",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/{{projectId}}/tasks",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", "{{projectId}}", "tasks"]
            }
          },
          "response": [
            {
              "name": "Kanban Tasks Loaded",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "data": {
                  "project_id": 18,
                  "tasks": [
                    {
                      "id": 172,
                      "public_id": "task123",
                      "title": "Implement User Authentication",
                      "status": "To Do",
                      "priority": "High",
                      "assigned_users": ["Employee User"],
                      "total_duration": 0,
                      "started_at": null,
                      "completed_at": null
                    }
                  ],
                  "kanban_columns": {
                    "To Do": [
                      {
                        "id": 172,
                        "title": "Implement User Authentication",
                        "status": "To Do"
                      }
                    ],
                    "In Progress": [],
                    "On Hold": [],
                    "Review": [],
                    "Completed": []
                  }
                }
              }, null, 2)
            }
          ]
        },
        {
          "name": "▶️ Start Task (To Do → In Progress)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/start",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "start"]
            }
          },
          "response": [
            {
              "name": "Task Started",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task started"
              }, null, 2)
            }
          ]
        },
        {
          "name": "⏸️ Pause Task (In Progress → On Hold)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/pause",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "pause"]
            }
          },
          "response": [
            {
              "name": "Task Paused",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task paused"
              }, null, 2)
            }
          ]
        },
        {
          "name": "▶️ Resume Task (On Hold → In Progress)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/resume",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "resume"]
            }
          },
          "response": [
            {
              "name": "Task Resumed",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task resumed"
              }, null, 2)
            }
          ]
        },
        {
          "name": "✅ Complete Task (In Progress → Completed)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/complete",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "complete"]
            }
          },
          "response": [
            {
              "name": "Task Completed",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task completed"
              }, null, 2)
            }
          ]
        },
        {
          "name": "📊 View Task Timeline",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/timeline",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "timeline"]
            }
          },
          "response": [
            {
              "name": "Task Timeline",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "data": [
                  {
                    "action": "start",
                    "timestamp": "2025-12-26T10:00:00.000Z",
                    "duration": null,
                    "user_name": "Employee User"
                  },
                  {
                    "action": "pause",
                    "timestamp": "2025-12-26T11:30:00.000Z",
                    "duration": 5400,
                    "user_name": "Employee User"
                  },
                  {
                    "action": "resume",
                    "timestamp": "2025-12-26T14:00:00.000Z",
                    "duration": null,
                    "user_name": "Employee User"
                  },
                  {
                    "action": "complete",
                    "timestamp": "2025-12-26T16:00:00.000Z",
                    "duration": 7200,
                    "user_name": "Employee User"
                  }
                ]
              }, null, 2)
            }
          ]
        }
      ]
    },
    {
      "name": "📝 Kanban Status Updates (Employee)",
      "item": [
        {
          "name": "📝 Move to In Progress (To Do → In Progress)",
          "request": {
            "method": "PATCH",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "status": "In Progress",
                "projectId": "{{projectId}}",
                "taskId": "{{taskId}}"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/status",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "status"]
            }
          },
          "response": [
            {
              "name": "Status Updated to In Progress",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task status updated to In Progress",
                "data": {
                  "projectId": 18,
                  "taskId": 172,
                  "id": 172,
                  "public_id": "task123",
                  "status": "In Progress",
                  "started_at": "2025-12-26T10:00:00.000Z",
                  "completed_at": null,
                  "updated_at": "2025-12-26T10:00:00.000Z"
                }
              }, null, 2)
            }
          ]
        },
        {
          "name": "⏸️ Move to On Hold (In Progress → On Hold)",
          "request": {
            "method": "PATCH",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "status": "On Hold",
                "projectId": "{{projectId}}",
                "taskId": "{{taskId}}"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/status",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "status"]
            }
          },
          "response": [
            {
              "name": "Status Updated to On Hold",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task status updated to On Hold",
                "data": {
                  "projectId": 18,
                  "taskId": 172,
                  "id": 172,
                  "public_id": "task123",
                  "status": "On Hold",
                  "started_at": "2025-12-26T10:00:00.000Z",
                  "completed_at": null,
                  "updated_at": "2025-12-26T10:00:00.000Z"
                }
              }, null, 2)
            }
          ]
        },
        {
          "name": "🔄 Resume from On Hold (On Hold → In Progress)",
          "request": {
            "method": "PATCH",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "status": "In Progress",
                "projectId": "{{projectId}}",
                "taskId": "{{taskId}}"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/status",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "status"]
            }
          },
          "response": [
            {
              "name": "Status Updated to In Progress",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task status updated to In Progress",
                "data": {
                  "projectId": 18,
                  "taskId": 172,
                  "id": 172,
                  "public_id": "task123",
                  "status": "In Progress",
                  "started_at": "2025-12-26T10:00:00.000Z",
                  "completed_at": null,
                  "updated_at": "2025-12-26T10:00:00.000Z"
                }
              }, null, 2)
            }
          ]
        },
        {
          "name": "🔍 Move to Review (In Progress → Review)",
          "request": {
            "method": "PATCH",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "status": "Review",
                "projectId": "{{projectId}}",
                "taskId": "{{taskId}}"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/status",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "status"]
            }
          },
          "response": [
            {
              "name": "Status Updated to Review",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task status updated to Review",
                "data": {
                  "projectId": 18,
                  "taskId": 172,
                  "id": 172,
                  "public_id": "task123",
                  "status": "Review",
                  "started_at": "2025-12-26T10:00:00.000Z",
                  "completed_at": null,
                  "updated_at": "2025-12-26T10:00:00.000Z"
                }
              }, null, 2)
            }
          ]
        },
        {
          "name": "✅ Complete Task (Review → Completed)",
          "request": {
            "method": "PATCH",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": JSON.stringify({
                "status": "Completed",
                "projectId": "{{projectId}}",
                "taskId": "{{taskId}}"
              }, null, 2)
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{taskId}}/status",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{taskId}}", "status"]
            }
          },
          "response": [
            {
              "name": "Task Completed",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": JSON.stringify({
                "success": true,
                "message": "Task status updated to Completed",
                "data": {
                  "projectId": 18,
                  "taskId": 172,
                  "id": 172,
                  "public_id": "task123",
                  "status": "Completed",
                  "started_at": "2025-12-26T10:00:00.000Z",
                  "completed_at": "2025-12-26T16:00:00.000Z",
                  "updated_at": "2025-12-26T16:00:00.000Z"
                }
              }, null, 2)
            }
          ]
        }
      ]
    }
  ],
  "event": [],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:4000"
    },
    {
      "key": "token",
      "value": ""
    },
    {
      "key": "projectId",
      "value": "abc123def"
    },
    {
      "key": "taskId",
      "value": "123"
    }
  ]
};

// Export the collection
module.exports = employeeTasksCollection;

// For CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = employeeTasksCollection;
}

// For ES6 modules (if needed)
if (typeof exports !== 'undefined') {
  exports.default = employeeTasksCollection;
}