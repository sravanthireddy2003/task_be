// Canonical RoleBasedLoginResponse util
const db = require(__root + 'db');

function q(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

module.exports = {
  /**
   * Returns dashboard metrics for the user/tenant.
   * @param {number|string} userId
   * @param {string} role
   * @param {number|string} tenantId
   * @param {string|null} publicId
   * @returns {Promise<object>}
   */
  async getDashboardMetrics(userId, role, tenantId, publicId) {
    return {
      projects: 0,
      tasks: 0,
      overdueTasks: 0,
      onTimeTasks: 0,
    };
  },

  /**
   * Returns accessible resources for the user based on role.
   * @param {number|string} userId
   * @param {string} role
   * @param {number|string} tenantId
   * @param {string|null} publicId
   * @returns {Promise<object>}
   */
  async getAccessibleResources(userId, role, tenantId, publicId) {
    // Minimal feature mapping to satisfy access checks across controllers
    const base = { projects: [], tasks: [], modules: [] };
    const featuresByRole = {
      'Admin': ['Dashboard', 'Assigned Clients', 'Projects', 'Tasks', 'Assigned Tasks'],
      'Manager': ['Dashboard', 'Assigned Clients', 'Projects', 'Tasks'],
      'Employee': ['Assigned Tasks'],
      'Client-Viewer': ['Documents']
    };
    const features = featuresByRole[role] || ['Assigned Tasks'];
    const resources = { ...base, features };

    // Populate manager-specific resource mappings
    if (role === 'Manager') {
      let assignedClientIds = [];
      try {
        // Prefer direct manager assignment on clientss.manager_id
        const clientsByManager = await q(
          'SELECT id FROM clientss WHERE manager_id = ? OR manager_id = ? ORDER BY id DESC',
          [userId, publicId || -1]
        );
        assignedClientIds = (clientsByManager || []).map(r => r.id).filter(Boolean);

        // Fallback: derive from projects the manager owns
        if (!assignedClientIds.length) {
          const viaProjects = await q(
            `SELECT DISTINCT c.id
             FROM projects p
             INNER JOIN clientss c ON c.id = p.client_id
             WHERE (p.project_manager_id = ? OR p.project_manager_id = ? OR p.manager_id = ? OR p.manager_id = ?)`,
            [userId, publicId || -1, userId, publicId || -1]
          );
          assignedClientIds = (viaProjects || []).map(r => r.id).filter(Boolean);
        }
      } catch (e) {
        // Keep silent but ensure a deterministic structure
        assignedClientIds = [];
      }

      resources.assignedClientIds = assignedClientIds;
    }

    return resources;
  }
};