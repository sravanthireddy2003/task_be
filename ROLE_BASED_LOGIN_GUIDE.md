# Updated Authentication System - Admin, Manager, Client Login

## Overview
The authentication system has been updated to provide role-specific login responses with customized dashboard metrics, accessible resources, and UI navigation based on user role.

---

## Login Flow Changes

### Before (Old Response)
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "user_public_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "Admin",
    "modules": [...]
  }
}
```

### After (New Response - Enhanced)
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "user_public_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "Admin",
    "phone": "1234567890",
    "title": "Administrator",
    "department": "IT",
    "modules": [...]
  },
  "metrics": {
    "totalUsers": 45,
    "totalClients": 12,
    "totalTasks": 156,
    "totalProjects": 8,
    "role": "Admin",
    "accessLevel": "Full Access"
  },
  "resources": {
    "canViewAllClients": true,
    "canCreateClients": true,
    "canManageUsers": true,
    "canViewAnalytics": true,
    "canManageDepartments": true,
    "canViewAllTasks": true,
    "canCreateProjects": true,
    "canApprove": true,
    "features": ["Clients", "Users", "Tasks", "Projects", "Dashboard", "Analytics", "Reports", "Settings"]
  },
  "sidebar": [
    { "id": "dashboard", "label": "Dashboard", "icon": "dashboard", "path": "/dashboard" },
    { "id": "clients", "label": "Clients", "icon": "business", "path": "/clients", ... },
    ...
  ]
}
```

---

## Role-Specific Responses

### 1. ADMIN Login Response

**Dashboard Metrics:**
- Total Users
- Total Clients
- Total Tasks
- Total Projects
- Access Level: "Full Access"

**Accessible Resources:**
- ✅ Can view all clients
- ✅ Can create clients
- ✅ Can manage users
- ✅ Can view analytics
- ✅ Can manage departments
- ✅ Can view all tasks
- ✅ Can create projects
- ✅ Can approve workflows

**Sidebar Items:**
```
- Dashboard
- User Management
- Clients (with Add Client option)
- Departments
- Tasks
- Projects
- Analytics
- Reports
- Settings
```

**Features Available:**
- Clients, Users, Tasks, Projects, Dashboard, Analytics, Reports, Settings

---

### 2. MANAGER Login Response

**Dashboard Metrics:**
- Assigned Clients (count of clients assigned to manager)
- Active Tasks (assigned tasks)
- Completed Tasks (successfully completed)
- Access Level: "Managed Access"

**Accessible Resources:**
- ❌ Cannot view all clients
- ✅ Can create clients
- ❌ Cannot manage users
- ✅ Can view analytics
- ❌ Cannot manage departments
- ❌ Cannot view all tasks
- ✅ Can create projects
- ❌ Cannot approve
- 🔒 Restrictions: "Can only view assigned clients and their tasks"
- 📋 Assigned Client IDs: [1, 5, 12, ...] (specific clients assigned)

**Sidebar Items:**
```
- Dashboard
- My Clients
- Tasks
- Projects
- Reports
```

**Features Available:**
- Assigned Clients, Tasks, Projects, Dashboard, Reports

---

### 3. CLIENT-VIEWER Login Response

**Dashboard Metrics:**
- Mapped Client ID (the specific client this viewer is assigned to)
- Assigned Tasks (tasks for their client)
- Access Level: "Limited Read-Only"

**Accessible Resources:**
- ❌ Cannot view all clients
- ❌ Cannot create clients
- ❌ Cannot manage users
- ❌ Cannot view analytics
- ❌ Cannot manage departments
- ❌ Cannot view all tasks
- ❌ Cannot create projects
- ❌ Cannot approve
- 🔒 Restrictions: "Read-only access to assigned client only"
- 📋 Mapped Client: 5 (can only see data for this client)

**Sidebar Items:**
```
- Dashboard
- My Tasks
- Documents
```

**Features Available:**
- Assigned Tasks, Documents, Dashboard (view-only)

---

### 4. EMPLOYEE Login Response

**Dashboard Metrics:**
- My Tasks (count of tasks assigned to employee)
- Completed Tasks
- Access Level: "Limited Access"

**Accessible Resources:**
- ❌ Cannot view all clients
- ❌ Cannot create clients
- ❌ Cannot manage users
- ❌ Cannot view analytics
- ❌ Cannot manage departments
- ❌ Cannot view all tasks
- ❌ Cannot create projects
- ❌ Cannot approve
- 🔒 Restrictions: "Can only view assigned tasks"

**Sidebar Items:**
```
- Dashboard
- My Tasks
```

**Features Available:**
- Assigned Tasks, Dashboard, Chat

---

## Implementation Details

### File: `controller/utils/RoleBasedLoginResponse.js`
**Purpose:** Handles all role-specific logic for login responses

**Functions:**
1. `getDashboardMetrics(userId, userRole, tenantId)` - Retrieves role-appropriate dashboard data
2. `getAccessibleResources(userId, userRole, tenantId)` - Returns accessible features and resources
3. `getSidebarForRole(role)` - Returns UI sidebar structure for role

### File: `controller/AuthController.js` (Updated)
**Change:** `completeLoginForUser()` function now:
1. Calls `RoleBasedLoginResponse.getDashboardMetrics()`
2. Calls `RoleBasedLoginResponse.getAccessibleResources()`
3. Calls `RoleBasedLoginResponse.getSidebarForRole()`
4. Includes additional user fields (phone, title, department)
5. Returns complete role-based response object

---

## Example Login Requests

### Admin Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "adminPassword123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "admin_public_id",
    "email": "admin@company.com",
    "name": "Admin User",
    "role": "Admin",
    "phone": "1234567890",
    "title": "System Administrator",
    "department": "IT",
    "modules": [...]
  },
  "metrics": {
    "totalUsers": 45,
    "totalClients": 12,
    "totalTasks": 156,
    "totalProjects": 8,
    "role": "Admin",
    "accessLevel": "Full Access"
  },
  "resources": {
    "canViewAllClients": true,
    "canCreateClients": true,
    "canManageUsers": true,
    "features": ["Clients", "Users", "Tasks", "Projects", "Dashboard", "Analytics", "Reports", "Settings"]
  },
  "sidebar": [...]
}
```

### Manager Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@company.com",
    "password": "managerPassword123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "manager_public_id",
    "email": "manager@company.com",
    "name": "John Manager",
    "role": "Manager",
    "phone": "9876543210",
    "title": "Sales Manager",
    "department": "Sales",
    "modules": [...]
  },
  "metrics": {
    "assignedClients": 5,
    "activeTasks": 23,
    "completedTasks": 12,
    "role": "Manager",
    "accessLevel": "Managed Access"
  },
  "resources": {
    "canViewAllClients": false,
    "canCreateClients": true,
    "canManageUsers": false,
    "canViewAnalytics": true,
    "assignedClientIds": [1, 3, 5, 7, 12],
    "features": ["Assigned Clients", "Tasks", "Projects", "Dashboard", "Reports"],
    "restrictions": "Can only view assigned clients and their tasks"
  },
  "sidebar": [...]
}
```

### Client-Viewer Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "client.viewer@company.com",
    "password": "clientPassword123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "viewer_public_id",
    "email": "client.viewer@company.com",
    "name": "Client Portal User",
    "role": "Client-Viewer",
    "phone": null,
    "title": null,
    "department": null,
    "modules": [...]
  },
  "metrics": {
    "role": "Client",
    "accessLevel": "Limited Read-Only",
    "mappedClient": 5,
    "assignedTasks": 8
  },
  "resources": {
    "canViewAllClients": false,
    "canCreateClients": false,
    "canManageUsers": false,
    "mappedClient": 5,
    "features": ["Assigned Tasks", "Documents", "Dashboard"],
    "restrictions": "Read-only access to assigned client only"
  },
  "sidebar": [...]
}
```

---

## Frontend Integration Guide

### 1. Store Login Response
```javascript
// After successful login
localStorage.setItem('token', response.token);
localStorage.setItem('refreshToken', response.refreshToken);
localStorage.setItem('user', JSON.stringify(response.user));
localStorage.setItem('metrics', JSON.stringify(response.metrics));
localStorage.setItem('resources', JSON.stringify(response.resources));
```

### 2. Initialize Dashboard
```javascript
const metrics = JSON.parse(localStorage.getItem('metrics'));
if (metrics.role === 'Admin') {
  displayAdminDashboard(metrics);
} else if (metrics.role === 'Manager') {
  displayManagerDashboard(metrics);
} else if (metrics.role === 'Client') {
  displayClientDashboard(metrics);
}
```

### 3. Build Navigation Menu
```javascript
const sidebar = loginResponse.sidebar;
sidebar.forEach(item => {
  if (item.children) {
    // Create dropdown menu
    addDropdownMenu(item);
  } else {
    // Create single menu item
    addMenuItem(item);
  }
});
```

### 4. Check Permissions Before Showing Features
```javascript
const resources = JSON.parse(localStorage.getItem('resources'));

if (resources.canCreateClients) {
  showCreateClientButton();
} else {
  hideCreateClientButton();
}

if (resources.canManageUsers) {
  showUserManagementMenu();
} else {
  hideUserManagementMenu();
}
```

---

## Database Queries Used

### Admin Metrics
```sql
SELECT COUNT(*) as count FROM users WHERE tenant_id = ?
SELECT COUNT(*) as count FROM clientss WHERE tenant_id = ?
SELECT COUNT(*) as count FROM tasks WHERE tenant_id = ?
SELECT COUNT(*) as count FROM projects WHERE tenant_id = ?
```

### Manager Metrics
```sql
SELECT COUNT(*) as count FROM clientss WHERE manager_id = ? AND tenant_id = ?
SELECT COUNT(*) as count FROM tasks WHERE assigned_to_manager = ? AND tenant_id = ?
SELECT COUNT(*) as count FROM tasks WHERE assigned_to_manager = ? AND stage = "completed" AND tenant_id = ?
```

### Client-Viewer Metrics
```sql
SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1
SELECT COUNT(*) as count FROM tasks WHERE client_id = ? AND tenant_id = ?
```

---

## Security Considerations

1. **Role-Based Access Control (RBAC)**: All features are gated by role
2. **Client Isolation**: Client-Viewers can only see their assigned client
3. **Manager Scope**: Managers can only see assigned clients
4. **Admin Full Access**: Admins have unrestricted access to all resources
5. **Feature Hiding**: UI elements hidden based on `resources` object
6. **Backend Validation**: All API endpoints validate user permissions (not just frontend hiding)

---

## Testing the Updated Login System

### Test Case 1: Admin Login
1. Login as admin@company.com
2. Verify response includes all metrics (totalUsers, totalClients, etc.)
3. Verify sidebar shows all menu items
4. Verify resources show all canX flags as true

### Test Case 2: Manager Login
1. Login as manager@company.com
2. Verify response shows only assigned clients count
3. Verify sidebar shows only manager menu items
4. Verify resources show assignedClientIds array
5. Verify restrictions message is present

### Test Case 3: Client-Viewer Login
1. Login as viewer@company.com
2. Verify response shows mappedClient and assignedTasks
3. Verify sidebar shows only client menu items (Dashboard, Tasks, Documents)
4. Verify all canX flags are false except view operations
5. Verify restrictions: "Read-only access to assigned client only"

---

## Files Modified/Created

✅ **Created:** `controller/utils/RoleBasedLoginResponse.js` (190+ lines)
✅ **Updated:** `controller/AuthController.js` → `completeLoginForUser()` function

---

## Next Steps

1. **Frontend Implementation**: Update login form and dashboard to use new response fields
2. **UI Components**: Build role-specific dashboards
3. **Navigation**: Dynamically generate sidebar from `sidebar` array
4. **Permissions**: Check `resources` object before displaying features
5. **API Security**: Ensure backend endpoints validate permissions (use middleware)

---

## Rollback Plan

If you need to revert to the old login response, simply:
1. Remove the role-based data collection from `completeLoginForUser()`
2. Return only the original `{ token, refreshToken, user }`
3. Frontend will continue to work with basic user info

The system is backward compatible and can be disabled by catching the error in RoleBasedLoginResponse.js.
