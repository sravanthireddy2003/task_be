# Client-Viewer Access Control Implementation

## Overview

The Client-Viewer Access Control Middleware enforces read-only access and endpoint restrictions for users with the `Client-Viewer` role. This ensures that client viewers can only:

1. **View their assigned client's data** (cannot view other clients)
2. **Only use GET requests** (no create, update, or delete operations)
3. **Access only whitelisted endpoints** (limited to: clients, tasks, documents, profile)

---

## Architecture

### Components

1. **Middleware:** `middleware/clientViewerAccess.js`
   - Validates Client-Viewer requests before reaching route handlers
   - Enforces endpoint whitelist
   - Restricts to mapped client ID
   - Returns 403 Forbidden for violations

2. **Integration Points** (in `app.js`):
   ```javascript
   app.use('/api/users', clientViewerAccessControl, StaffUser);
   app.use('/api/tasks', clientViewerAccessControl, tasksCRUD);
   app.use('/api/clients', clientViewerAccessControl, clientsCRUD);
   ```

3. **Login Response Data** (from `RoleBasedLoginResponse.js`):
   ```javascript
   restrictedModules: [
     { moduleId: 'dashboard', name: 'Dashboard', access: 'view' },
     { moduleId: 'tasks', name: 'Assigned Tasks', access: 'view' },
     { moduleId: 'documents', name: 'Documents', access: 'view' }
   ],
   allowedEndpoints: [
     'GET /api/clients/:id',
     'GET /api/tasks',
     'GET /api/documents'
   ]
   ```

---

## Allowed Endpoints

Client-Viewer users can only make GET requests to:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/clients/:id` | View specific client details (if mapped client) |
| `GET /api/tasks` | View assigned tasks list |
| `GET /api/tasks/:id` | View specific task details |
| `GET /api/documents` | View documents list |
| `GET /api/documents/:id` | View specific document details |
| `GET /api/users/profile` | View own user profile |
| `GET /api/clients/:id/tasks` | View tasks for mapped client |
| `GET /api/clients/:id/documents` | View documents for mapped client |

---

## Denied Endpoints & Operations

Client-Viewer users **cannot**:

- **Create/Update/Delete:** All POST, PUT, PATCH, DELETE operations return 403 Forbidden
- **View all clients:** They can only view their mapped client (via `/api/clients/:id` with matching ID)
- **View other users:** The `/api/users/getusers` endpoint requires Admin role
- **Access restricted endpoints:** Any endpoint not in the allowedEndpoints list returns 403 Forbidden

### Example Forbidden Requests

```bash
# ❌ POST request - not allowed
POST /api/tasks/123 -d '{"status": "completed"}'
# Response: 403 Forbidden - Client-Viewer users have read-only access

# ❌ View different client
GET /api/clients/999  (if mapped to client 42)
# Response: 403 Forbidden - You are only allowed to view client ID 42

# ❌ Access restricted endpoint
GET /api/users/getusers
# Response: 403 Forbidden - Access denied to GET /api/users/getusers

# ❌ Delete operation
DELETE /api/tasks/123
# Response: 403 Forbidden - Client-Viewer users have read-only access
```

---

## Flow Diagram

```
Client Request
    ↓
Authentication Middleware (requireAuth)
    ↓
Client-Viewer Access Control Middleware
    ├─ Not Client-Viewer? → Pass through to route handler
    ├─ Not GET request? → Return 403 (read-only)
    ├─ Endpoint not whitelisted? → Return 403 (forbidden endpoint)
    ├─ Client ID mismatch? → Return 403 (wrong client)
    └─ All checks pass → Pass through to route handler
    ↓
Route Handler (executes normally)
    ↓
Response (200, 404, 500, etc.)
```

---

## Implementation Details

### Middleware Code Walkthrough

#### 1. Skip for Non-Client-Viewer Roles
```javascript
if (!req.user || req.user.role !== 'Client-Viewer') {
  return next();  // Other roles bypass all restrictions
}
```

#### 2. Enforce Read-Only (GET Only)
```javascript
if (req.method !== 'GET') {
  return res.status(403).json({
    success: false,
    error: 'Client-Viewer users have read-only access. POST, PUT, DELETE not allowed.'
  });
}
```

#### 3. Retrieve Mapped Client ID
```javascript
const clientId = await new Promise(resolve => {
  db.query(
    'SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1',
    [req.user._id],
    (err, results) => {
      resolve(results && results[0] ? results[0].client_id : null);
    }
  );
});
```

#### 4. Validate Against Endpoint Whitelist
```javascript
const allowedPatterns = [
  /^\/api\/clients\/\d+$/,
  /^\/api\/tasks$/,
  /^\/api\/documents$/,
  // ... etc
];

const isAllowed = allowedPatterns.some(pattern => pattern.test(requestPath));
if (!isAllowed) {
  return res.status(403).json({
    success: false,
    error: `Access denied to ${req.method} ${requestPath}...`
  });
}
```

#### 5. Validate Client ID Match
```javascript
const clientIdMatch = requestPath.match(/\/api\/clients\/(\d+)/);
if (clientIdMatch) {
  const requestedClientId = parseInt(clientIdMatch[1], 10);
  if (requestedClientId !== clientId) {
    return res.status(403).json({
      success: false,
      error: `Access denied: You are only allowed to view client ID ${clientId}`
    });
  }
}
```

#### 6. Attach Context for Route Handlers
```javascript
req.viewerMappedClientId = clientId;
req.accessLevel = 'Limited Read-Only';
req.allowedModules = ['Dashboard', 'Assigned Tasks', 'Documents'];
```

---

## Integration Pattern

### How It Works in the Stack

1. **Request arrives at `/api/clients/42`**
   ```
   GET /api/clients/42
   Header: Authorization: Bearer <jwt-token>
   ```

2. **Auth middleware validates token** (`requireAuth`)
   ```javascript
   // Decodes JWT, sets req.user = { _id, role: 'Client-Viewer', ... }
   ```

3. **Client-Viewer middleware executes**
   ```javascript
   // Checks:
   // ✅ req.user.role === 'Client-Viewer'
   // ✅ req.method === 'GET'
   // ✅ /api/clients/\d+ matches allowed pattern
   // ✅ viewerMappedClientId === 42 (from client_viewers table)
   // ✅ All checks pass → next()
   ```

4. **Route handler executes** (in `ClientsApi.js`)
   ```javascript
   // Proceeds normally to get client with ID 42
   ```

5. **Response sent**
   ```json
   {
     "id": 42,
     "name": "NMIT Solutions",
     "email": "contact@nmit.com",
     ...
   }
   ```

---

## Database Context

### client_viewers Table
```sql
CREATE TABLE client_viewers (
  _id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  public_id VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(_id),
  FOREIGN KEY (user_id) REFERENCES users(_id)
);
```

**Example Query Result:**
```sql
SELECT client_id FROM client_viewers 
WHERE user_id = 7 LIMIT 1;

Result:
| client_id |
|-----------|
| 42        |
```

This maps user_id=7 (Client-Viewer) to client_id=42 (NMIT Solutions).

---

## Error Responses

### 403 Forbidden - Read-Only Violation
```json
{
  "success": false,
  "error": "Client-Viewer users have read-only access. POST, PUT, DELETE not allowed."
}
```

### 403 Forbidden - Client ID Mismatch
```json
{
  "success": false,
  "error": "Access denied: You are only allowed to view client ID 42"
}
```

### 403 Forbidden - Endpoint Not Allowed
```json
{
  "success": false,
  "error": "Access denied to GET /api/users/getusers. Client-Viewer has limited read-only access.",
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
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Access control check failed",
  "details": "[error message if NODE_ENV=development]"
}
```

---

## Testing Client-Viewer Access

### Test Scenario: Login as Client-Viewer

1. **Create Test Client-Viewer**
   ```bash
   # Use the existing NMI0001 client viewer created in send_welcome_email.js
   # Email: ashwini.m@nmit-solutions.com
   # Public ID: ac130b52551931c9
   # Temp Password: b862230ffd46 (or use setup link)
   ```

2. **Login and Get Token**
   ```bash
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "ashwini.m@nmit-solutions.com",
       "password": "b862230ffd46"
     }'
   ```

   **Response:**
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIs...",
     "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
     "user": {
       "id": "ac130b52551931c9",
       "email": "ashwini.m@nmit-solutions.com",
       "name": "Ashwini M",
       "role": "Client-Viewer",
       "phone": null,
       "title": null,
       "department": null,
       "sidebar": [...],
       "metrics": {...},
       "resources": {
         "canViewAllClients": false,
         "mappedClient": 42,
         "features": ["Assigned Tasks", "Documents", "Dashboard"],
         "restrictions": "Read-only access to assigned client only",
         "restrictedModules": [...],
         "allowedEndpoints": [...]
       }
     }
   }
   ```

3. **Test Allowed Endpoint**
   ```bash
   # ✅ Allowed: Get mapped client (42)
   curl -X GET http://localhost:4000/api/clients/42 \
     -H "Authorization: Bearer <token>"
   
   # Response: 200 OK with client data
   ```

4. **Test Denied: Different Client**
   ```bash
   # ❌ Forbidden: Try to get different client
   curl -X GET http://localhost:4000/api/clients/1 \
     -H "Authorization: Bearer <token>"
   
   # Response: 403 Forbidden - "Access denied: You are only allowed to view client ID 42"
   ```

5. **Test Denied: Write Operation**
   ```bash
   # ❌ Forbidden: Try to create task
   curl -X POST http://localhost:4000/api/tasks \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"title": "New Task"}'
   
   # Response: 403 Forbidden - "Client-Viewer users have read-only access"
   ```

6. **Test Denied: Restricted Endpoint**
   ```bash
   # ❌ Forbidden: Try to list all users
   curl -X GET http://localhost:4000/api/users/getusers \
     -H "Authorization: Bearer <token>"
   
   # Response: 403 Forbidden - "Access denied to GET /api/users/getusers"
   ```

---

## Security Considerations

### What This Middleware Protects

✅ **Prevents Unauthorized Access:**
- Client-Viewer cannot see other clients' data
- Client-Viewer cannot perform write operations
- Client-Viewer cannot access admin endpoints

✅ **Defense in Depth:**
- Frontend: Uses `restrictedModules` to hide restricted UI
- API Layer (Middleware): Validates all incoming requests
- Database: Relies on role-based queries in route handlers

### What This Middleware Does NOT Protect

⚠️ **Additional Controls Recommended:**

1. **Route Handler Validation:** Each endpoint should also validate `req.user.role` before returning data
2. **Query Filtering:** Database queries should filter by mapped client_id for Client-Viewer
3. **Audit Logging:** Log all Client-Viewer access attempts for compliance

### Example: Defense in Depth in Route Handler

```javascript
// In ClientsApi.js GET /api/clients/:id
router.get('/:id', requireAuth, async (req, res) => {
  const clientId = parseInt(req.params.id, 10);
  
  // ADDITIONAL VALIDATION in route handler
  if (req.user.role === 'Client-Viewer') {
    if (req.viewerMappedClientId !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }
  
  // Proceed with query
  db.query('SELECT * FROM clients WHERE _id = ?', [clientId], ...);
});
```

---

## Configuration & Customization

### Modifying Allowed Endpoints

To add more allowed endpoints, edit `middleware/clientViewerAccess.js`:

```javascript
const allowedPatterns = [
  /^\/api\/clients\/\d+$/,           // GET /api/clients/:id
  /^\/api\/tasks$/,                  // GET /api/tasks
  /^\/api\/tasks\/\d+$/,             // GET /api/tasks/:id
  /^\/api\/documents$/,              // GET /api/documents
  /^\/api\/documents\/\d+$/,         // GET /api/documents/:id
  /^\/api\/users\/profile$/,         // GET /api/users/profile
  /^\/api\/clients\/\d+\/tasks$/,    // GET /api/clients/:id/tasks
  /^\/api\/clients\/\d+\/documents$/, // GET /api/clients/:id/documents
  
  // ADD NEW ENDPOINTS HERE
  /^\/api\/new-feature$/,
  /^\/api\/new-feature\/\d+$/,
];
```

### Modifying Restricted Modules

To add more restricted modules, edit `RoleBasedLoginResponse.js`:

```javascript
'Client-Viewer': async () => {
  return {
    ...
    restrictedModules: [
      { moduleId: 'dashboard', name: 'Dashboard', access: 'view' },
      { moduleId: 'tasks', name: 'Assigned Tasks', access: 'view' },
      { moduleId: 'documents', name: 'Documents', access: 'view' },
      
      // ADD NEW MODULES HERE
      { moduleId: 'new-module', name: 'New Module', access: 'view' }
    ],
    allowedEndpoints: [
      ...
      'GET /api/new-feature',
      'GET /api/new-feature/:id'
    ]
  };
}
```

---

## Deployment Checklist

- [x] Middleware created: `middleware/clientViewerAccess.js`
- [x] Integrated into app.js for all protected routes
- [x] AuthController modified to exclude modules for Client-Viewer
- [x] RoleBasedLoginResponse includes restrictedModules and allowedEndpoints
- [ ] Test suite created for middleware validation
- [ ] Documentation completed
- [ ] Code review completed
- [ ] Staging deployment tested
- [ ] Production rollout scheduled

---

## Support & Troubleshooting

### Client-Viewer Cannot See Their Client

**Problem:** Client-Viewer gets 403 Forbidden when accessing `GET /api/clients/:id`

**Solution:**
1. Verify client_viewers table has a row with this user_id
2. Confirm the requested client_id matches the mapped client_id
3. Check middleware logs for exact error message

### Endpoint Returns 404 Instead of 403

**Problem:** Middleware isn't catching the request

**Solution:**
1. Verify middleware is correctly integrated in app.js
2. Check that the endpoint path matches the allowed regex patterns
3. Ensure middleware runs before route handler

### Too Many 403 Errors in Logs

**Problem:** Client-Viewer frequently hitting forbidden endpoints

**Solution:**
1. Check frontend is using `resources.allowedEndpoints` to enforce UI restrictions
2. Verify `resources.restrictedModules` is correctly configured in login response
3. Consider adding more allowed endpoints if legitimate use cases exist

---

## Related Files

- `middleware/clientViewerAccess.js` - Enforcement middleware
- `controller/AuthController.js` - Conditional modules in login response
- `controller/utils/RoleBasedLoginResponse.js` - Restricted modules definition
- `app.js` - Middleware integration points
- `db.js` - Database connection for client_viewers queries

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-XX | Initial implementation |

---

**Status:** ✅ **Implementation Complete** - Ready for testing and deployment
