// allowRoles middleware
module.exports.allowRoles = function allowRoles(roles) {
  // normalize roles to array and compare case-insensitively
  const allowed = (Array.isArray(roles) ? roles : [roles]).map(r => String(r || '').toLowerCase());
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userRole = String(req.user.role || '').toLowerCase();
    if (!allowed.includes(userRole)) return res.status(403).json({ error: 'Forbidden: admin routes only' });
    next();
  };
};

// helper to check inside handlers
module.exports.userHasRole = function (req, role) {
  const userRole = req.user && req.user.role ? String(req.user.role).toLowerCase() : '';
  return userRole === String(role || '').toLowerCase();
};
