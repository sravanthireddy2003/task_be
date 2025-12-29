const postmanCollection = {
  "info": {
    "name": "TaskBe Kanban Workflow API Collection",
    "_postman_id": "taskbe-kanban-workflow-2025",
    "description": "Complete Postman collection for TaskBe Kanban workflow - Bitrix24-style project management with role-based access control, time tracking, and strict Kanban board rules.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "🔐 Authentication",
      "item": [
        {
          "name": "Admin Login",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"admin@example.com\",\n  \"password\": \"password123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "login"]
            }
          },
          "response": [
            {
              "name": "Admin Login Success",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"token\": \"jwt_token_here\",\n  \"user\": {\n    \"_id\": 23,\n    \"name\": \"Myadmin\",\n    \"email\": \"admin@example.com\",\n    \"role\": \"Admin\",\n    \"public_id\": \"admin123\"\n  }\n}"
            }
          ]
        },
        {
          "name": "Manager Login",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"manager@example.com\",\n  \"password\": \"password123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "login"]
            }
          },
          "response": [
            {
              "name": "Manager Login Success",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"token\": \"jwt_token_here\",\n  \"user\": {\n    \"_id\": 24,\n    \"name\": \"Manager User\",\n    \"email\": \"manager@example.com\",\n    \"role\": \"Manager\",\n    \"public_id\": \"manager123\"\n  }\n}"
            }
          ]
        },
        {
          "name": "Employee Login",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"employee@example.com\",\n  \"password\": \"password123\"\n}"
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
              "body": "{\n  \"success\": true,\n  \"token\": \"jwt_token_here\",\n  \"user\": {\n    \"_id\": 25,\n    \"name\": \"Employee User\",\n    \"email\": \"employee@example.com\",\n    \"role\": \"Employee\",\n    \"public_id\": \"employee123\"\n  }\n}"
            }
          ]
        }
      ]
    },
    {
      "name": "👨‍💼 Admin/Manager - Project Management",
      "item": [
        {
          "name": "Create Project",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"projectName\": \"Kanban Project Alpha\",\n  \"description\": \"Bitrix24-style Kanban workflow project\",\n  \"clientPublicId\": \"62\",\n  \"projectManagerId\": \"manager123\",\n  \"department_ids\": [\"dev-team-1\", \"qa-team-1\"],\n  \"priority\": \"High\",\n  \"startDate\": \"2025-12-26\",\n  \"endDate\": \"2026-01-26\",\n  \"budget\": 50000\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/projects",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects"]
            }
          },
          "response": [
            {
              "name": "Project Created",
              "originalRequest": {},
              "status": "Created",
              "code": 201,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"data\": {\n    \"id\": \"abc123def\",\n    \"name\": \"Kanban Project Alpha\",\n    \"status\": \"Planning\",\n    \"departments\": [\n      {\"public_id\": \"dev-team-1\", \"name\": \"Development Team\"}\n    ],\n    \"project_manager\": {\n      \"public_id\": \"manager123\",\n      \"name\": \"Manager User\"\n    }\n  }\n}"
            }
          ]
        },
        {
          "name": "Get All Projects",
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
              "name": "Projects List",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"data\": [\n    {\n      \"id\": \"abc123def\",\n      \"name\": \"Kanban Project Alpha\",\n      \"status\": \"Planning\",\n      \"departments\": [\n        {\"public_id\": \"dev-team-1\", \"name\": \"Development Team\"}\n      ],\n      \"project_manager\": {\n        \"public_id\": \"manager123\",\n        \"name\": \"Manager User\"\n      }\n    }\n  ]\n}"
            }
          ]
        },
        {
          "name": "Create Task for Project",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"title\": \"Implement User Authentication\",\n  \"description\": \"Implement JWT-based authentication system\",\n  \"assigned_users\": [\"employee123\"],\n  \"priority\": \"High\",\n  \"taskDate\": \"2025-12-31\",\n  \"time_alloted\": 8,\n  \"projectId\": \"abc123def\",\n  \"client_id\": 62\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks"]
            }
          },
          "response": [
            {
              "name": "Task Created",
              "originalRequest": {},
              "status": "Created",
              "code": 201,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"data\": {\n    \"id\": 123,\n    \"title\": \"Implement User Authentication\",\n    \"status\": \"Pending\",\n    \"assigned_users\": [\n      {\n        \"id\": 25,\n        \"name\": \"Employee User\",\n        \"email\": \"employee@example.com\"\n      }\n    ],\n    \"project\": {\n      \"id\": \"abc123def\",\n      \"name\": \"Kanban Project Alpha\"\n    }\n  }\n}"
            }
          ]
        }
      ]
    },
    {
      "name": "👨‍💻 Employee - Kanban Workflow",
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
              "body": "{\n  \"success\": true,\n  \"data\": [\n    {\n      \"id\": \"abc123def\",\n      \"name\": \"Kanban Project Alpha\",\n      \"status\": \"Planning\",\n      \"departments\": [\n        {\"public_id\": \"dev-team-1\", \"name\": \"Development Team\"}\n      ]\n    }\n  ]\n}"
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
              "body": "{\n  \"success\": true,\n  \"data\": {\n    \"project_id\": 18,\n    \"tasks\": [\n      {\n        \"id\": 123,\n        \"title\": \"Implement User Authentication\",\n        \"status\": \"Pending\",\n        \"priority\": \"High\",\n        \"assigned_users\": [\"Employee User\"],\n        \"total_duration\": 0\n      }\n    ],\n    \"kanban_columns\": {\n      \"To Do\": [\n        {\n          \"id\": 123,\n          \"title\": \"Implement User Authentication\",\n          \"status\": \"Pending\"\n        }\n      ],\n      \"In Progress\": [],\n      \"On Hold\": [],\n      \"Completed\": []\n    }\n  }\n}"
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
              "body": "{\n  \"success\": true,\n  \"message\": \"Task started\"\n}"
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
              "body": "{\n  \"success\": true,\n  \"message\": \"Task paused\"\n}"
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
              "body": "{\n  \"success\": true,\n  \"message\": \"Task resumed\"\n}"
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
              "body": "{\n  \"success\": true,\n  \"message\": \"Task completed\"\n}"
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
              "body": "{\n  \"success\": true,\n  \"data\": [\n    {\n      \"action\": \"start\",\n      \"timestamp\": \"2025-12-26T10:00:00.000Z\",\n      \"duration\": null,\n      \"user_name\": \"Employee User\"\n    },\n    {\n      \"action\": \"pause\",\n      \"timestamp\": \"2025-12-26T11:30:00.000Z\",\n      \"duration\": 5400,\n      \"user_name\": \"Employee User\"\n    },\n    {\n      \"action\": \"resume\",\n      \"timestamp\": \"2025-12-26T14:00:00.000Z\",\n      \"duration\": null,\n      \"user_name\": \"Employee User\"\n    },\n    {\n      \"action\": \"complete\",\n      \"timestamp\": \"2025-12-26T16:00:00.000Z\",\n      \"duration\": 7200,\n      \"user_name\": \"Employee User\"\n    }\n  ]\n}"
            }
          ]
        }
      ]
    },
    {
      "name": "📈 Analytics & Reporting",
      "item": [
        {
          "name": "Project Statistics",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/stats",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", "stats"]
            }
          },
          "response": [
            {
              "name": "Project Stats",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"data\": {\n    \"projects\": {\n      \"total\": 1,\n      \"byStatus\": {\n        \"Planning\": 1\n      }\n    },\n    \"tasks\": {\n      \"total\": 1,\n      \"byStage\": {\n        \"TODO\": 1\n      },\n      \"totalHours\": 0\n    },\n    \"subtasks\": {\n      \"total\": 0,\n      \"byStatus\": {}\n    }\n  }\n}"
            }
          ]
        },
        {
          "name": "Project Summary",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/{{projectId}}/summary",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", "{{projectId}}", "summary"]
            }
          },
          "response": [
            {
              "name": "Project Summary",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"data\": {\n    \"project\": {\n      \"id\": \"abc123def\",\n      \"name\": \"Kanban Project Alpha\",\n      \"total_tasks\": 1,\n      \"completed_tasks\": 0,\n      \"total_hours\": 0,\n      \"progress_percentage\": 0\n    }\n  }\n}"
            }
          ]
        }
      ]
    },
    {
      "name": "🚫 Error Scenarios",
      "item": [
        {
          "name": "Invalid Status Transition (Complete Pending Task)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{pendingTaskId}}/complete",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{pendingTaskId}}", "complete"]
            }
          },
          "response": [
            {
              "name": "Invalid Transition Error",
              "originalRequest": {},
              "status": "Bad Request",
              "code": 400,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": false,\n  \"error\": \"Cannot complete task with status 'Pending'. Only 'In Progress' tasks can be completed.\"\n}"
            }
          ]
        },
        {
          "name": "Access Denied (Unassigned Task)",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/{{unassignedTaskId}}/start",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "{{unassignedTaskId}}", "start"]
            }
          },
          "response": [
            {
              "name": "Access Denied Error",
              "originalRequest": {},
              "status": "Forbidden",
              "code": 403,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": false,\n  \"error\": \"Not assigned to this task\"\n}"
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
    },
    {
      "key": "pendingTaskId",
      "value": "124"
    },
    {
      "key": "unassignedTaskId",
      "value": "125"
    }
  ]
};

module.exports = postmanCollection;
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"admin@example.com\",\n  \"password\": \"password123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["api", "auth", "login"]
            }
          },
          "response": [
            {
              "name": "Login Success",
              "originalRequest": {},
              "status": "OK",
              "code": 200,
              "_postman_previewlanguage": "json",
              "header": [
                { "key": "Content-Type", "value": "application/json" }
              ],
              "cookie": [],
              "body": "{\n  \"success\": true,\n  \"token\": \"jwt_token_here\",\n  \"user\": {\n    \"_id\": 1,\n    \"name\": \"Admin User\",\n    \"email\": \"admin@example.com\",\n    \"role\": \"Admin\",\n    \"public_id\": \"admin123\"\n  }\n}"
            }
          ]
        }
      ]
    },
    {
      "name": "Projects",
      "item": [
        {
          "name": "Get Projects",
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
          }
        },
        {
          "name": "Create Project",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"projectName\": \"New Project\",\n  \"description\": \"Project description\",\n  \"clientPublicId\": \"client123\",\n  \"projectManagerId\": \"manager123\",\n  \"departmentIds\": [\"dept1\", \"dept2\"],\n  \"priority\": \"High\",\n  \"startDate\": \"2025-01-01\",\n  \"endDate\": \"2025-12-31\",\n  \"budget\": 50000\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/projects",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects"]
            }
          }
        },
        {
          "name": "Get Project by ID",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id"],
              "variable": [
                { "key": "id", "value": "project123" }
              ]
            }
          }
        },
        {
          "name": "Update Project",
          "request": {
            "method": "PUT",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Updated Project Name\",\n  \"description\": \"Updated description\",\n  \"priority\": \"Medium\",\n  \"budget\": 60000\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id"],
              "variable": [
                { "key": "id", "value": "project123" }
              ]
            }
          }
        },
        {
          "name": "Delete Project",
          "request": {
            "method": "DELETE",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id"],
              "variable": [
                { "key": "id", "value": "project123" }
              ]
            }
          }
        },
        {
          "name": "Get Projects Stats",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/stats",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", "stats"]
            }
          }
        },
        {
          "name": "Get Project Summary",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id/summary",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id", "summary"],
              "variable": [
                { "key": "id", "value": "project123" }
              ]
            }
          }
        },
        {
          "name": "Add Departments to Project",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"department_ids\": [\"dept1\", \"dept2\"]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id/departments",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id", "departments"],
              "variable": [
                { "key": "id", "value": "project123" }
              ]
            }
          }
        },
        {
          "name": "Remove Department from Project",
          "request": {
            "method": "DELETE",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/projects/:id/departments/:deptId",
              "host": ["{{baseUrl}}"],
              "path": ["api", "projects", ":id", "departments", ":deptId"],
              "variable": [
                { "key": "id", "value": "project123" },
                { "key": "deptId", "value": "1" }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "Tasks",
      "item": [
        {
          "name": "Create Task",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"title\": \"Task Title\",\n  \"description\": \"Task description\",\n  \"assigned_to\": [\"user1\", \"user2\"],\n  \"priority\": \"High\",\n  \"stage\": \"PENDING\",\n  \"taskDate\": \"2025-12-31T00:00:00.000Z\",\n  \"time_alloted\": 8,\n  \"client_id\": 1,\n  \"projectId\": \"project123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks"]
            }
          }
        },
        {
          "name": "Delete Task",
          "request": {
            "method": "DELETE",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/:id",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", ":id"],
              "variable": [
                { "key": "id", "value": "task123" }
              ]
            }
          }
        },
        {
          "name": "Get Task Details",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" },
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"taskIds\": [\"task1\", \"task2\"]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/api/tasks/selected-details",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", "selected-details"]
            }
          }
        },
        {
          "name": "Start Task",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/:id/start",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", ":id", "start"],
              "variable": [
                { "key": "id", "value": "task123" }
              ]
            }
          }
        },
        {
          "name": "Pause Task",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/:id/pause",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", ":id", "pause"],
              "variable": [
                { "key": "id", "value": "task123" }
              ]
            }
          }
        },
        {
          "name": "Complete Task",
          "request": {
            "method": "POST",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/:id/complete",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", ":id", "complete"],
              "variable": [
                { "key": "id", "value": "task123" }
              ]
            }
          }
        },
        {
          "name": "Get Task Timeline",
          "request": {
            "method": "GET",
            "header": [
              { "key": "Authorization", "value": "Bearer {{token}}" }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/tasks/:id/timeline",
              "host": ["{{baseUrl}}"],
              "path": ["api", "tasks", ":id", "timeline"],
              "variable": [
                { "key": "id", "value": "task123" }
              ]
            }
          }
        }
      ]
    }
  ],
  "event": [],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:4000",
      "type": "string"
    },
    {
      "key": "token",
      "value": "",
      "type": "string"
    }
  ]
};

module.exports = postmanCollection;