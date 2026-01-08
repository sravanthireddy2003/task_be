// src/rules/ruleContext.js
// Build rule evaluation context from request and user data

const buildRuleContext = (req, user, resource = {}) => {
  const context = {
    userId: user ? user._id : null,
    userRole: user ? user.role : null,
    userDepartment: user ? user.department : null,
    resourceOwnerId: resource.ownerId || resource.userId || null,
    resourceId: resource.id || req.params.id || null,
    action: req.method + '_' + (req.route && req.route.path ? req.route.path : req.path || req.url).replace(/\//g, '_').toUpperCase(),
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