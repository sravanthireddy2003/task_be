// Canonical RoleBasedLoginResponse util
// Minimal implementation to keep app functional; replace with real metrics/resources logic.
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
    return { ...base, features };
  }
};