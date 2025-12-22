/**
 * Role-Based Login Response Handler
 * Returns customized data based on user role (Admin, Manager, Client)
 * Includes dashboard metrics, accessible resources, and role-specific settings
 */

const db = require(__root + 'db');

function buildTenantClause(alias = 'clientss', tenantId) {
  const tenantParam = tenantId ?? null;
  const column = `${alias}.tenant_id`;
  return {
    clause: `(${column} = ? OR ${column} IS NULL OR ${column} = 0 OR ? IS NULL)`,
    params: [tenantParam, tenantParam]
  };
}

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

function buildManagerClause(userId, externalId) {
  const primaryId = normalizeIdentifier(userId);
  const external = normalizeIdentifier(externalId);
  const managerSet = new Set();
  if (primaryId !== null) managerSet.add(primaryId);
  if (external !== null) managerSet.add(external);
  const managerIds = Array.from(managerSet);
  const clauseParts = managerIds.map(() => 'manager_id = ?').join(' OR ');
  const clause = clauseParts ? `(${clauseParts}) OR user_id = ?` : 'user_id = ?';
  const params = [...managerIds, userId];
  return { clause, params };
}

/**
 * Get role-specific dashboard metrics
 */
async function getDashboardMetrics(userId, userRole, tenantId, userExternalId) {
  return new Promise(async (resolve) => {
    try {
      const metrics = {
        Admin: async () => {
          const stats = await Promise.all([
            new Promise(r => db.query('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM clientss WHERE tenant_id = ?', [tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE tenant_id = ?', [tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM projects WHERE tenant_id = ?', [tenantId], (e, res) => r(res && res[0] ? res[0].count : 0)))
          ]);
          return {
            totalUsers: stats[0],
            totalClients: stats[1],
            totalTasks: stats[2],
            totalProjects: stats[3],
            role: 'Admin',
            accessLevel: 'Full Access'
          };
        },

        Manager: async () => {
          const tenantFilter = buildTenantClause('clientss', tenantId);
          const managerMatch = buildManagerClause(userId, userExternalId);
          const clientClause = `${managerMatch.clause} AND ${tenantFilter.clause}`;
          const clientParams = [...managerMatch.params, ...tenantFilter.params];
          const stats = await Promise.all([
            new Promise(r => db.query(`SELECT COUNT(*) as count FROM clientss WHERE ${clientClause}`, clientParams, (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to_manager = ? AND tenant_id = ?', [userId, tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to_manager = ? AND stage = "completed" AND tenant_id = ?', [userId, tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
          ]);
          return {
            assignedClients: stats[0],
            activeTasks: stats[1],
            completedTasks: stats[2],
            role: 'Manager',
            accessLevel: 'Managed Access'
          };
        },

        'Client-Viewer': async () => {
          // Get client mapped to this viewer
          const clientId = await new Promise(r => 
            db.query('SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1', [userId], 
              (e, res) => r(res && res[0] ? res[0].client_id : null))
          );
          
          if (!clientId) return { role: 'Client', accessLevel: 'Limited Read-Only', mappedClient: null, assignedTasks: 0 };
          
          const taskCount = await new Promise(r => 
            db.query('SELECT COUNT(*) as count FROM tasks WHERE client_id = ? AND tenant_id = ?', [clientId, tenantId], 
              (e, res) => r(res && res[0] ? res[0].count : 0))
          );
          
          return {
            role: 'Client',
            accessLevel: 'Limited Read-Only',
            mappedClient: clientId,
            assignedTasks: taskCount
          };
        },

        Employee: async () => {
          const stats = await Promise.all([
            new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND tenant_id = ?', [userId, tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
            new Promise(r => db.query('SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND stage = "completed" AND tenant_id = ?', [userId, tenantId], (e, res) => r(res && res[0] ? res[0].count : 0))),
          ]);
          return {
            myTasks: stats[0],
            completedTasks: stats[1],
            role: 'Employee',
            accessLevel: 'Limited Access'
          };
        }
      };

      const handler = metrics[userRole] || metrics['Employee'];
      const data = await handler();
      resolve(data);
    } catch (e) {
      console.error('Error getting dashboard metrics:', e.message);
      resolve({ role: userRole, accessLevel: 'Unknown', error: e.message });
    }
  });
}

/**
 * Get accessible resources based on role
 */
async function getAccessibleResources(userId, userRole, tenantId, userExternalId) {
  return new Promise(async (resolve) => {
    try {
      const resources = {
        Admin: async () => ({
          canViewAllClients: true,
          canCreateClients: true,
          canManageUsers: true,
          canViewAnalytics: true,
          canManageDepartments: true,
          canViewAllTasks: true,
          canCreateProjects: true,
          canApprove: true,
          features: ['Clients', 'Users', 'Tasks', 'Projects', 'Dashboard', 'Analytics', 'Reports', 'Settings']
        }),

        Manager: async () => {
          const tenantFilter = buildTenantClause('clientss', tenantId);
          const managerMatch = buildManagerClause(userId, userExternalId);
          const clause = `${managerMatch.clause} AND ${tenantFilter.clause}`;
          const params = [...managerMatch.params, ...tenantFilter.params];
          const clientIds = await new Promise(r =>
            db.query(
              `SELECT id FROM clientss WHERE ${clause}`,
              params,
              (e, res) => r(res ? res.map(r => r.id) : [])
            )
          );
          return {
            canViewAllClients: false,
            canCreateClients: true,
            canManageUsers: true,
            canViewAnalytics: true,
            canManageDepartments: false,
            canViewAllTasks: false,
            canCreateProjects: true,
            canApprove: false,
            assignedClientIds: clientIds,
            features: ['User Management', 'Assigned Clients', 'Tasks', 'Projects', 'Dashboard', 'Reports'],
            restrictions: 'Can only view assigned clients and their tasks'
          };
        },

        'Client-Viewer': async () => {
          const clientData = await new Promise(r =>
            db.query('SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1', [userId],
              (e, res) => r(res && res[0] ? res[0] : null))
          );
          return {
            canViewAllClients: false,
            canCreateClients: false,
            canManageUsers: false,
            canViewAnalytics: false,
            canManageDepartments: false,
            canViewAllTasks: false,
            canCreateProjects: false,
            canApprove: false,
            mappedClient: clientData ? clientData.client_id : null,
            features: ['Assigned Tasks', 'Documents', 'Dashboard'],
            restrictions: 'Read-only access to assigned client only',
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
          };
        },

        Employee: async () => ({
          canViewAllClients: false,
          canCreateClients: false,
          canManageUsers: false,
          canViewAnalytics: false,
          canManageDepartments: false,
          canViewAllTasks: false,
          canCreateProjects: false,
          canApprove: false,
          features: ['Assigned Tasks', 'Dashboard', 'Chat'],
          restrictions: 'Can only view assigned tasks'
        })
      };

      const handler = resources[userRole] || resources['Employee'];
      const data = await handler();
      resolve(data);
    } catch (e) {
      console.error('Error getting accessible resources:', e.message);
      resolve({ features: [], restrictions: 'Error loading resources' });
    }
  });
}

/**
 * Get role-specific sidebar menu items
 */
function getSidebarForRole(role) {
  const menus = {
    Admin: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/admin/dashboard' },
      { id: 'clients', label: 'Clients', icon: 'business', path: '/admin/clients', children: [
        { id: 'clients-list', label: 'Client List', path: '/admin/clients' },
        { id: 'clients-create', label: 'Add Client', path: '/admin/clients/create' }
      ]},
      { id: 'users', label: 'User Management', icon: 'people', path: '/admin/users' },
      { id: 'departments', label: 'Departments', icon: 'domain', path: '/admin/departments' },
      { id: 'tasks', label: 'Tasks', icon: 'task', path: '/admin/tasks' },
      { id: 'projects', label: 'Projects', icon: 'project', path: '/admin/projects' },
      { id: 'analytics', label: 'Analytics', icon: 'analytics', path: '/admin/analytics' },
      { id: 'reports', label: 'Reports', icon: 'report', path: '/admin/reports' },
      { id: 'settings', label: 'Settings', icon: 'settings', path: '/admin/settings' }
    ],

    Manager: [
      { id: 'users', label: 'User Management', icon: 'people', path: '/manager/users' },
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/manager/dashboard' },
      { id: 'clients', label: 'My Clients', icon: 'business', path: '/manager/clients' },
      { id: 'tasks', label: 'Tasks', icon: 'task', path: '/manager/tasks' },
      { id: 'projects', label: 'Projects', icon: 'project', path: '/manager/projects' },
      { id: 'reports', label: 'Reports', icon: 'report', path: '/manager/reports' }
    ],

    'Client-Viewer': [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/client/dashboard' },
      { id: 'tasks', label: 'Assigned Tasks', icon: 'task', path: '/client/tasks' },
      { id: 'documents', label: 'Document & File Management', icon: 'document', path: '/client/documents' }
    ],

    Employee: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/employee/dashboard' },
      { id: 'tasks', label: 'My Tasks', icon: 'task', path: '/employee/tasks' }
    ]
  };

  return menus[role] || menus['Employee'];
}

module.exports = {
  getDashboardMetrics,
  getAccessibleResources,
  getSidebarForRole
};
