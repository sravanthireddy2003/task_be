const db = require(__root + 'db');

async function getDashboardMetrics(userId, userRole, tenantId) {
  return new Promise(async (resolve) => {
    try {
      const metrics = {
        Admin: async () => ({ role: 'Admin', accessLevel: 'Full Access' }),
        Manager: async () => ({ role: 'Manager', accessLevel: 'Managed Access' }),
        'Client-Viewer': async () => {
          const clientId = await new Promise(r => db.query('SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1', [userId], (e, res) => r(res && res[0] ? res[0].client_id : null)));
          if (!clientId) return { role: 'Client', accessLevel: 'Limited Read-Only', mappedClient: null, assignedTasks: 0 };
          const taskCount = await new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE client_id = ? AND tenant_id = ?', [clientId, tenantId], (e, res) => r(res && res[0] ? res[0].count : 0)));
          return { role: 'Client', accessLevel: 'Limited Read-Only', mappedClient: clientId, assignedTasks: taskCount };
        },
        Employee: async () => ({ role: 'Employee', accessLevel: 'Limited Access' })
      };
      const handler = metrics[userRole] || metrics['Employee'];
      const data = await handler();
      resolve(data);
    } catch (e) {
      resolve({ role: userRole, accessLevel: 'Unknown', error: e.message });
    }
  });
}

async function getAccessibleResources(userId, userRole, tenantId) {
  return new Promise(async (resolve) => {
    try {
      const resources = {
        Admin: async () => ({ canViewAllClients: true, canCreateClients: true, features: ['Clients','Users','Tasks'] }),
        Manager: async () => ({ canViewAllClients: false, canCreateClients: true, features: ['Assigned Clients','Tasks','Projects'] }),
        'Client-Viewer': async () => ({ canViewAllClients: false, canCreateClients: false, mappedClient: await new Promise(r => db.query('SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1', [userId], (e, res) => r(res && res[0] ? res[0].client_id : null))), features: ['Assigned Tasks','Documents','Dashboard'], restrictions: 'Read-only access to assigned client only', restrictedModules: [ { moduleId: 'dashboard', name: 'Dashboard', access: 'view' }, { moduleId: 'tasks', name: 'Assigned Tasks', access: 'view' }, { moduleId: 'documents', name: 'Document & File Management', access: 'view' } ], allowedEndpoints: [ 'GET /api/clients/:id', 'GET /api/tasks', 'GET /api/documents' ] }),
        Employee: async () => ({ canViewAllClients: false, features: ['Assigned Tasks','Dashboard'] })
      };
      const handler = resources[userRole] || resources['Employee'];
      const data = await handler();
      resolve(data);
    } catch (e) {
      resolve({ features: [], restrictions: 'Error loading resources' });
    }
  });
}

function getSidebarForRole(role) {
  const menus = {
    Admin: [ { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard' }, { id: 'clients', label: 'Clients', icon: 'business', path: '/clients' }, { id: 'users', label: 'User Management', icon: 'people', path: '/users' } ],
    Manager: [ { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard' }, { id: 'clients', label: 'My Clients', icon: 'business', path: '/clients' }, { id: 'tasks', label: 'Tasks', icon: 'task', path: '/tasks' } ],
    'Client-Viewer': [ { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard' }, { id: 'tasks', label: 'Assigned Tasks', icon: 'task', path: '/tasks' }, { id: 'documents', label: 'Document & File Management', icon: 'document', path: '/documents' } ],
    Employee: [ { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard' }, { id: 'tasks', label: 'My Tasks', icon: 'task', path: '/tasks' } ]
  };
  return menus[role] || menus['Employee'];
}

module.exports = { getDashboardMetrics, getAccessibleResources, getSidebarForRole };
