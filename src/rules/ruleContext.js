// src/rules/ruleContext.js
// Build rule evaluation context from request and user data

const buildRuleContext = (req, user, resource = {}) => {
  const context = {
    userId: user ? user._id : null,
    userRole: user ? user.role : null,
    userDepartment: user ? user.department : null,
    resourceOwnerId: resource.ownerId || resource.userId || null,
    resourceId: resource.id || req.params.id || null,
    // Provide multiple action variants to improve matching against stored rule action formats
    // - route-based (e.g., POST_CREATEJSON or POST_)
    // - baseUrl+route (e.g., POST_API_PROJECTS_TASKS_CREATEJSON)
    // - full path (e.g., POST_API_PROJECTS_TASKS_CREATEJSON)
    action: (() => {
      try {
        const norm = s => (s || '').toString().replace(/^\//, '').replace(/\//g, '_').toUpperCase();
        const routePart = req.route && req.route.path ? norm(req.route.path) : '';
        const basePart = req.baseUrl ? norm(req.baseUrl) : '';
        const pathPart = norm(req.path || req.url || '');
        const variants = [];
        variants.push(`${req.method}_${routePart}`); // primary
        if (basePart && routePart) variants.push(`${req.method}_${basePart}_${routePart}`);
        if (pathPart) variants.push(`${req.method}_${pathPart}`);
        // Ensure unique
        return Array.from(new Set(variants));
      } catch (e) {
        return `${req.method}_`;
      }
    })(),
    payload: req.body || {},
    recordStatus: resource.status || null,
    timestamp: new Date().toISOString(),
    ip: req.ip || (req.connection && req.connection.remoteAddress) || 'unknown',
    // Configurable thresholds from env
    LEAVE_MAX_DAYS: parseInt(process.env.LEAVE_MAX_DAYS || '5', 10),
    OTP_MAX_REQUESTS: parseInt(process.env.OTP_MAX_REQUESTS || '3', 10),
    // Add recent requests count if available (would need to be fetched)
    recentRequests: 0 // Placeholder, implement based on your rate limiting logic
  };

  // Add leave days if in payload
  if (context.payload.leaveDays) {
    context.leaveDays = context.payload.leaveDays;
  }

  return context;
};

module.exports = { buildRuleContext };