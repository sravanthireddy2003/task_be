const postmanCollection = {
  "info": {
    "name": "TaskBe Projects & Tasks API Collection",
    "_postman_id": "taskbe-projects-tasks-api-2025",
    "description": "Focused Postman collection for TaskBe project management system - Projects and Tasks APIs including time tracking functionality.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
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