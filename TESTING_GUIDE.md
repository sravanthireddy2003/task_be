# Role-Based Login Testing Guide

## Quick Test Commands

### Test 1: Admin Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@taskmanagement.com",
    "password": "Admin@123",
    "tenantId": "tenant_id_here"
  }' | jq .
```

Expected Response Elements:
- ✅ `metrics.totalUsers` > 0
- ✅ `metrics.totalClients` > 0
- ✅ `metrics.totalTasks` > 0
- ✅ `metrics.totalProjects` > 0
- ✅ `metrics.accessLevel` = "Full Access"
- ✅ `resources.canViewAllClients` = true
- ✅ `sidebar` array with 9+ items
- ✅ `user.phone`, `user.title`, `user.department` populated

---

### Test 2: Manager Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@taskmanagement.com",
    "password": "Manager@123",
    "tenantId": "tenant_id_here"
  }' | jq .
```

Expected Response Elements:
- ✅ `metrics.assignedClients` >= 0
- ✅ `metrics.activeTasks` >= 0
- ✅ `metrics.completedTasks` >= 0
- ✅ `metrics.accessLevel` = "Managed Access"
- ✅ `resources.canViewAllClients` = false
- ✅ `resources.canCreateClients` = true
- ✅ `resources.assignedClientIds` array present
- ✅ `sidebar` array with 5-6 items
- ✅ `resources.restrictions` present

---

### Test 3: Client-Viewer Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "client.viewer@taskmanagement.com",
    "password": "Client@123",
    "tenantId": "tenant_id_here"
  }' | jq .
```

Expected Response Elements:
- ✅ `metrics.role` = "Client"
- ✅ `metrics.mappedClient` exists (client ID)
- ✅ `metrics.assignedTasks` >= 0
- ✅ `metrics.accessLevel` = "Limited Read-Only"
- ✅ `resources.canViewAllClients` = false
- ✅ `resources.canCreateClients` = false
- ✅ `resources.mappedClient` = the single client ID
- ✅ `sidebar` array with 3 items (Dashboard, My Tasks, Documents)
- ✅ `resources.restrictions` = "Read-only access to assigned client only"

---

## Using Postman Collection

### Import Collection
1. Open Postman
2. Click "Import"
3. Select `postman_complete_client_management_v2.json`
4. Update variables in collection:
   - `{{baseUrl}}` → http://localhost:4000
   - `{{tenantId}}` → Your actual tenant ID

### Run Authentication Tests
1. **Admin Login** → Auth folder → Admin Login
   - Should return full admin metrics and all permissions
2. **Manager Login** → Auth folder → Manager Login
   - Should return assigned client metrics only
3. **Client Login** → Auth folder → Client Login
   - Should return single client + task metrics only

### Validate Token
1. After each login, copy the `token` from response
2. Go to any protected endpoint (e.g., GET /api/clients)
3. Set Authorization header: `Bearer {{token}}`
4. Request should succeed for valid endpoints

---

## Manual Testing Checklist

### Admin User Test
- [ ] Login with admin account
- [ ] Verify response has `metrics.totalUsers` > 0
- [ ] Verify `metrics.totalClients` > 0
- [ ] Verify `metrics.totalTasks` > 0
- [ ] Verify `resources.canViewAllClients` = true
- [ ] Verify sidebar has "Users" menu item
- [ ] Verify sidebar has "Analytics" menu item
- [ ] Verify sidebar has "Settings" menu item
- [ ] Should be able to access GET /api/users
- [ ] Should be able to access GET /api/clients (all)
- [ ] Should be able to access GET /api/admin/dashboard

### Manager User Test
- [ ] Login with manager account
- [ ] Verify response has `metrics.assignedClients`
- [ ] Verify `resources.assignedClientIds` array exists
- [ ] Verify `resources.canViewAllClients` = false
- [ ] Verify sidebar does NOT have "Users" menu item
- [ ] Verify sidebar does NOT have "Analytics" menu item
- [ ] Verify sidebar has "My Clients" menu item
- [ ] Verify sidebar has "Tasks" menu item
- [ ] Should be able to access GET /api/clients (assigned only)
- [ ] Should NOT be able to access GET /api/users
- [ ] Should NOT be able to access GET /api/admin/dashboard

### Client-Viewer User Test
- [ ] Login with viewer account
- [ ] Verify response has `metrics.mappedClient` (single client ID)
- [ ] Verify response has `metrics.assignedTasks`
- [ ] Verify `resources.mappedClient` matches `metrics.mappedClient`
- [ ] Verify `resources.canCreateClients` = false
- [ ] Verify sidebar has only 3 items
- [ ] Verify sidebar has "My Tasks" (not "All Tasks")
- [ ] Verify sidebar has "Documents" (not "All Documents")
- [ ] Should be able to see only their assigned client
- [ ] Should NOT be able to create new clients
- [ ] Should NOT be able to manage other clients

---

## Response Structure Validation

### Check Login Response Has All Fields
```javascript
// After successful login, response should have:
const loginResponse = {
  token: "string",           // ✅ Check present
  refreshToken: "string",    // ✅ Check present
  user: {
    id: "string",            // ✅ Check present
    email: "string",         // ✅ Check present
    name: "string",          // ✅ Check present
    role: "string",          // ✅ Check present (Admin, Manager, Client-Viewer, Employee)
    phone: "string",         // ✅ Check present
    title: "string",         // ✅ Check present
    department: "string",    // ✅ Check present
    modules: []              // ✅ Check present
  },
  metrics: {
    // ✅ Check role-specific fields present
    role: "string",
    accessLevel: "string"
  },
  resources: {
    // ✅ Check permission fields present
    canViewAllClients: boolean,
    canCreateClients: boolean,
    canManageUsers: boolean,
    features: []
  },
  sidebar: []                 // ✅ Check array of menu items
};
```

---

## Debugging Failed Tests

### Issue: Response missing `metrics` field
**Solution:**
1. Check RoleBasedLoginResponse.js is in `controller/utils/`
2. Check AuthController.js is importing the module:
   ```javascript
   const RoleBasedLoginResponse = require('./utils/RoleBasedLoginResponse');
   ```
3. Check `completeLoginForUser()` is calling:
   ```javascript
   const metrics = await RoleBasedLoginResponse.getDashboardMetrics(...);
   ```
4. Restart server: `npm start`

### Issue: Response missing `sidebar` field
**Solution:**
1. Check RoleBasedLoginResponse.js has `getSidebarForRole()` function
2. Check AuthController.js is calling it:
   ```javascript
   const sidebar = RoleBasedLoginResponse.getSidebarForRole(user.role);
   ```
3. Check function returns proper array structure

### Issue: Manager sees all clients (should see only assigned)
**Solution:**
1. Check database has `manager_id` column in `clientss` table
2. Check manager has clients assigned:
   ```sql
   SELECT * FROM clientss WHERE manager_id = 'manager_id_here';
   ```
3. Check RoleBasedLoginResponse.js manager metrics query

### Issue: Client-Viewer sees multiple clients (should see one)
**Solution:**
1. Check database has `client_viewers` table
2. Check viewer is assigned to only one client:
   ```sql
   SELECT * FROM client_viewers WHERE user_id = 'viewer_id_here';
   ```
3. Check viewer has exactly one record

---

## Email Delivery Testing

### Verify Email Was Sent to Client
When creating a new client with a viewer account:

1. Check server logs for:
   ```
   Viewer credentials sent to client@email.com: Success
   ```

2. Or if failed:
   ```
   Viewer credentials sent to client@email.com: Failed
   Error: <error message>
   ```

3. If no message appears:
   - Email service not called (check ClientsApi_v2.js line 320 & 728)
   - Verify `await emailService.sendCredentials()` is present

### Test Email Manually
```bash
curl -X POST http://localhost:4000/api/clients \
  -H "Authorization: Bearer {{adminToken}}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "email": "test.client@example.com",
    "phone": "1234567890",
    "address": "123 Main St",
    "city": "City",
    "state": "State",
    "country": "Country",
    "zipCode": "12345",
    "gst": "123456789012345",
    "viewer_email": "viewer@example.com",
    "status": "Active"
  }'
```

Check:
1. Response includes `viewer` object with `viewer_email`
2. Server logs show email sent message
3. Check email inbox for credentials email

---

## Performance Testing

### Login Response Time Check
```bash
time curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@taskmanagement.com",
    "password": "Admin@123"
  }' > /dev/null
```

Target: < 500ms for login response

### Database Query Monitoring
Add logging in RoleBasedLoginResponse.js:
```javascript
console.time(`Dashboard Metrics for ${userRole}`);
// ... database queries
console.timeEnd(`Dashboard Metrics for ${userRole}`);
```

---

## Integration Testing Sequence

### Day 1: Basic Login
- [ ] Test admin login returns all fields
- [ ] Test manager login returns assigned only
- [ ] Test client login returns mapped client
- [ ] Verify tokens work for subsequent requests

### Day 2: Permission Testing
- [ ] Admin can access all endpoints
- [ ] Manager cannot access /api/users
- [ ] Client cannot access /api/clients (except mapped)
- [ ] Verify middleware blocks unauthorized access

### Day 3: Email Testing
- [ ] Create client with viewer → email sent
- [ ] Check email delivery logs
- [ ] Viewer can login with credentials

### Day 4: UI Integration
- [ ] Frontend loads sidebar from response
- [ ] Dashboard displays metrics correctly
- [ ] Features hidden/shown based on permissions
- [ ] Navigation works for each role

---

## Success Criteria

✅ All tests passing when:
1. Admin login returns 10+ sidebar items
2. Manager login returns 5-6 sidebar items
3. Client login returns 3 sidebar items
4. Email sent message appears in logs
5. Tokens work for API requests
6. Permissions properly enforced

---

## Contact & Support

If tests fail:
1. Check server logs: `npm start`
2. Verify database has required data
3. Check SMTP configuration in .env
4. Review error messages in browser console
5. Check network requests in DevTools
