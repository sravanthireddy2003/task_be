// allowRoles middleware
module.exports.allowRoles = function allowRoles(roles) {
  // normalize roles to array
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
};

// helper to check inside handlers
module.exports.userHasRole = function (req, role) {
  return req.user && req.user.role === role;
};
