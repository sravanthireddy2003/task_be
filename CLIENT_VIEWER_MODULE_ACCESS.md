# Client-Viewer Module Access Control Guide

## 📊 Module Structure & Access Levels

### Three Modules Available to Client-Viewer

#### 1. Dashboard Module
```json
{
  "moduleId": "abc123...",
  "name": "Dashboard",
  "access": "view"
}
```
- **Access Level:** `view` (read-only)
- **Allowed HTTP Methods:** GET ✅
- **Denied HTTP Methods:** POST, PUT, DELETE ❌
- **Endpoints:**
  - `GET /api/auth/dashboard` - View dashboard metrics
- **Features Available:**
  - View dashboard metrics
  - View assigned tasks count
  - View mapped client info
  - View access level: "Limited Read-Only"

#### 2. Assigned Tasks Module
```json
{
  "moduleId": "def456...",
  "name": "Assigned Tasks",
  "access": "view"
}
```
- **Access Level:** `view` (read-only)
- **Allowed HTTP Methods:** GET ✅
- **Denied HTTP Methods:** POST, PUT, DELETE ❌
- **Endpoints:**
  - `GET /api/tasks` - List all tasks
  - `GET /api/tasks/:id` - View task details
- **Features Available:**
  - View all tasks for mapped client
  - View task details
  - View task status
  - View task assignments
- **Cannot Do:**
  - Create tasks (POST blocked)
  - Update tasks (PUT blocked)
  - Delete tasks (DELETE blocked)

#### 3. Document & File Management Module
```json
{
  "moduleId": "ghi789...",
  "name": "Document & File Management",
  "access": "view"
}
```
- **Access Level:** `view` (read-only)
- **Allowed HTTP Methods:** GET ✅
- **Denied HTTP Methods:** POST, PUT, DELETE ❌
- **Endpoints:**
  - `GET /api/documents` - List all documents
  - `GET /api/documents/:id` - View document details
  - `GET /api/clients/:id/documents` - View client documents
- **Features Available:**
  - View all documents
  - View document details
  - Download documents (if implemented)
  - View document metadata
- **Cannot Do:**
  - Upload documents (POST blocked)
  - Modify documents (PUT blocked)
  - Delete documents (DELETE blocked)

---

## 🔐 Access Level: "view"

### What "view" Access Means

```
Access Level: view
└─ ✅ Can READ data
   └─ GET requests allowed
   └─ View-only operations
   └─ No modification possible
└─ ❌ Cannot WRITE data
   └─ POST requests blocked (403)
   └─ PUT requests blocked (403)
   └─ DELETE requests blocked (403)
   └─ PATCH requests blocked (403)
```

### HTTP Method Matrix for "view" Access

| Method | Status | Response |
|--------|--------|----------|
| GET | ✅ Allowed | 200 OK |
| POST | ❌ Blocked | 403 Forbidden |
| PUT | ❌ Blocked | 403 Forbidden |
| DELETE | ❌ Blocked | 403 Forbidden |
| PATCH | ❌ Blocked | 403 Forbidden |

---

## 🚀 Allowed GET Endpoints (Read-Only)

### Complete Whitelist for Client-Viewer

```
✅ GET /api/clients/:id
   └─ View mapped client details (client 42 only)

✅ GET /api/tasks
   └─ List all tasks for mapped client

✅ GET /api/tasks/:id
   └─ View specific task details

✅ GET /api/documents
   └─ List all documents for mapped client

✅ GET /api/documents/:id
   └─ View specific document details

✅ GET /api/users/profile
   └─ View own profile information

✅ GET /api/clients/:id/tasks
   └─ View tasks for mapped client (client 42 only)

✅ GET /api/clients/:id/documents
   └─ View documents for mapped client (client 42 only)
```

---

## ❌ Forbidden Endpoints (403 Forbidden)

### All Write Operations Blocked

```
❌ POST /api/tasks
   └─ Error: "Client-Viewer users have read-only access"

❌ PUT /api/tasks/:id
   └─ Error: "Client-Viewer users have read-only access"

❌ DELETE /api/tasks/:id
   └─ Error: "Client-Viewer users have read-only access"

❌ POST /api/documents
   └─ Error: "Client-Viewer users have read-only access"

❌ PUT /api/documents/:id
   └─ Error: "Client-Viewer users have read-only access"

❌ DELETE /api/documents/:id
   └─ Error: "Client-Viewer users have read-only access"

❌ GET /api/users/getusers
   └─ Error: "Access denied to GET /api/users/getusers"
   └─ Reason: Admin-only endpoint

❌ GET /api/clients (list all)
   └─ Error: "Access denied"
   └─ Reason: Not whitelisted, must use /api/clients/:id

❌ GET /api/clients/1 (if mapped to 42)
   └─ Error: "Access denied: You are only allowed to view client ID 42"
   └─ Reason: Client isolation - different client ID
```

---

## 🧪 Testing Module Access

### Step 1: Login as Client-Viewer

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ashwini.m@nmit-solutions.com",
    "password": "b862230ffd46"
  }'
```

**Response includes:**
```json
{
  "user": {
    "modules": [
      { "name": "Dashboard", "access": "view" },
      { "name": "Assigned Tasks", "access": "view" },
      { "name": "Document & File Management", "access": "view" }
    ]
  },
  "resources": {
    "allowedEndpoints": [
      "GET /api/clients/:id",
      "GET /api/tasks",
      "GET /api/documents",
      ...
    ]
  }
}
```

### Step 2: Test Allowed GET Request

```bash
TOKEN="<token from login>"

# ✅ This should work (Dashboard module - view access)
curl -X GET http://localhost:4000/api/tasks \
  -H "Authorization: Bearer $TOKEN"

# Response: 200 OK with task data
```

### Step 3: Test Blocked POST Request

```bash
# ❌ This should fail (view access = read-only)
curl -X POST http://localhost:4000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Task"}'

# Response: 403 Forbidden
# {
#   "success": false,
#   "error": "Client-Viewer users have read-only access. POST, PUT, DELETE not allowed."
# }
```

---

## 📋 Login Response: Module Access Configuration

### Full Login Response Structure

```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "ac130b52551931c9",
    "email": "ashwini.m@nmit-solutions.com",
    "name": "Test Client Ashwini (Viewer)",
    "role": "Client-Viewer",
    "modules": [
      {
        "moduleId": "abc123def456",
        "name": "Dashboard",
        "access": "view"
      },
      {
        "moduleId": "def456ghi789",
        "name": "Assigned Tasks",
        "access": "view"
      },
      {
        "moduleId": "ghi789jkl012",
        "name": "Document & File Management",
        "access": "view"
      }
    ]
  },
  "metrics": {
    "role": "Client",
    "accessLevel": "Limited Read-Only",
    "mappedClient": 42,
    "assignedTasks": 0
  },
  "resources": {
    "canViewAllClients": false,
    "canCreateClients": false,
    "canManageUsers": false,
    "canViewAnalytics": false,
    "canManageDepartments": false,
    "canViewAllTasks": false,
    "canCreateProjects": false,
    "canApprove": false,
    "mappedClient": 42,
    "features": [
      "Assigned Tasks",
      "Documents",
      "Dashboard"
    ],
    "restrictions": "Read-only access to assigned client only",
    "restrictedModules": [
      {
        "moduleId": "dashboard",
        "name": "Dashboard",
        "access": "view"
      },
      {
        "moduleId": "tasks",
        "name": "Assigned Tasks",
        "access": "view"
      },
      {
        "moduleId": "documents",
        "name": "Document & File Management",
        "access": "view"
      }
    ],
    "allowedEndpoints": [
      "GET /api/clients/:id",
      "GET /api/tasks",
      "GET /api/tasks/:id",
      "GET /api/documents",
      "GET /api/documents/:id",
      "GET /api/users/profile",
      "GET /api/clients/:id/tasks",
      "GET /api/clients/:id/documents"
    ]
  },
  "sidebar": [
    {
      "id": "dashboard",
      "label": "Dashboard",
      "icon": "dashboard",
      "path": "/dashboard"
    },
    {
      "id": "tasks",
      "label": "Assigned Tasks",
      "icon": "task",
      "path": "/tasks"
    },
    {
      "id": "documents",
      "label": "Document & File Management",
      "icon": "document",
      "path": "/documents"
    }
  ]
}
```

### Key Properties to Use in Frontend

1. **`user.modules`** - Array of modules with access levels
   - Use to render module menu
   - Filter by access level
   - Display only "view" modules for Client-Viewer

2. **`resources.allowedEndpoints`** - Array of allowed API endpoints
   - Use to validate frontend requests
   - Prevent navigation to blocked endpoints
   - Show 403 error if user tries unauthorized action

3. **`resources.restrictedModules`** - Explicitly listed restricted modules
   - Same as user.modules for Client-Viewer
   - Clear documentation of restrictions
   - Use for UI permission checks

4. **`metrics.accessLevel`** - "Limited Read-Only"
   - Display to user in UI
   - Indicate restricted access in headers

---

## 🔄 Comparing Access Levels

### Admin vs Client-Viewer Module Access

| Feature | Admin | Client-Viewer |
|---------|-------|---------------|
| **Access Level** | `full` | `view` |
| **Modules Count** | 13 | 3 |
| **GET Allowed** | ✅ Yes | ✅ Yes |
| **POST Allowed** | ✅ Yes | ❌ No |
| **PUT Allowed** | ✅ Yes | ❌ No |
| **DELETE Allowed** | ✅ Yes | ❌ No |
| **View All Clients** | ✅ Yes | ❌ No (1 client only) |
| **Create/Edit** | ✅ Yes | ❌ No |
| **Manage Users** | ✅ Yes | ❌ No |
| **Approve Workflows** | ✅ Yes | ❌ No |

---

## 🛡️ Security Implementation

### Middleware Validation Layer

When Client-Viewer makes a request:

```
1. Authentication Check
   └─ Verify JWT token is valid
   └─ Extract user role: "Client-Viewer"

2. Module Access Check
   └─ Verify module has "view" access level
   └─ Deny if access level is less restrictive needed

3. HTTP Method Check
   └─ Only allow GET requests
   └─ Deny POST, PUT, DELETE, PATCH

4. Endpoint Whitelist Check
   └─ Check if endpoint in allowedEndpoints
   └─ Deny if endpoint not whitelisted

5. Client Isolation Check
   └─ For client-specific endpoints
   └─ Verify client ID matches mappedClient (42)
   └─ Deny if accessing different client

6. Execute Request
   └─ If all checks pass, proceed to route handler
   └─ Return 200 with data (filtered by client_id if needed)
```

### Error Response Examples

**401 Unauthorized** - Invalid/expired token
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

**403 Forbidden** - Read-only enforcement
```json
{
  "success": false,
  "error": "Client-Viewer users have read-only access. POST, PUT, DELETE not allowed."
}
```

**403 Forbidden** - Endpoint restriction
```json
{
  "success": false,
  "error": "Access denied to GET /api/users/getusers. Client-Viewer has limited read-only access.",
  "allowedEndpoints": [...]
}
```

**403 Forbidden** - Client isolation
```json
{
  "success": false,
  "error": "Access denied: You are only allowed to view client ID 42"
}
```

---

## 📚 Related Files

- **AuthController.js** - Module generation for Client-Viewer
- **RoleBasedLoginResponse.js** - Login response structure
- **middleware/clientViewerAccess.js** - Access control enforcement
- **postman_client_viewer_complete.json** - Postman collection with all tests

---

## ✅ Summary

**Client-Viewer Access Control:**
- ✅ 3 modules with "view" access level
- ✅ 8 allowed GET endpoints
- ✅ All POST/PUT/DELETE blocked (403 Forbidden)
- ✅ Client isolation enforced (mapped to client 42)
- ✅ Read-only access guaranteed at multiple layers
- ✅ Consistent module naming across responses
