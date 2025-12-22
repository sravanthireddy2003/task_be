from pathlib import Path

content = """{
  "info": {
    "name": "TaskBe - Manager & Employee APIs",
    "_postman_id": "manager-employee-001",
    "description": "Key manager and employee flows covering login, scoped dashboards, and task access.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth - Login (Manager)",
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
          "name": "Success",
          "body": "{ \"token\": \"<jwt>\", \"user\": { \"role\": \"Manager\" } }"
        }
      ]
    },
    {
      "name": "Manager - Dashboard",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/manager/dashboard",
          "host": ["{{baseUrl}}"],
          "path": ["api", "manager", "dashboard"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Metrics", "body": "{ \"projectCount\": 8, \"taskCount\": 42, \"clientCount\": 5 }" }
      ]
    },
    {
      "name": "Manager - Assigned Clients",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/manager/clients",
          "host": ["{{baseUrl}}"],
          "path": ["api", "manager", "clients"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Success", "body": "[{ \"id\": 101, \"name\": \"ABC Corp\" }]" }
      ]
    },
    {
      "name": "Manager - Projects",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/manager/projects",
          "host": ["{{baseUrl}}"],
          "path": ["api", "manager", "projects"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Example", "body": "[{ \"id\": 13, \"name\": \"Website Refresh\" }]" }
      ]
    },
    {
      "name": "Manager - Timeline",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/manager/timeline",
          "host": ["{{baseUrl}}"],
          "path": ["api", "manager", "timeline"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Example", "body": "[{ \"task_id\": 167, \"title\": \"Launch Landing Page\" }]" }
      ]
    },
    {
      "name": "Manager - Tasks (alias)",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/manager/tasks",
          "host": ["{{baseUrl}}"],
          "path": ["api", "manager", "tasks"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Example", "body": "[{ \"task_id\": 167, \"title\": \"Launch Landing Page\" }]" }
      ]
    },
    {
      "name": "Employee - Login",
      "request": {
        "method": "POST",
        "header": [ { "key": "Content-Type", "value": "application/json" } ],
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
        { "name": "Success", "body": "{ \"user\": { \"role\": \"Employee\" } }" }
      ]
    },
    {
      "name": "Employee - Get My Tasks",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/api/employee/my-tasks",
          "host": ["{{baseUrl}}"],
          "path": ["api", "employee", "my-tasks"]
        },
        "header": [ { "key": "Authorization", "value": "Bearer {{token}}" } ]
      },
      "response": [
        { "name": "Example", "body": "[{ \"task_id\": 167, \"title\": \"Landing Page\" }]" }
      ]
    }
  ],
  "event": [],
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:4000" },
    { "key": "token", "value": "" }
  ]
}"""
Path('collections/manager-employee.postman_collection.json').write_text(content, encoding='utf-8')
