const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

// Verify JWT and attach user to req.user. Also enforce tenant if present.
async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.SECRET || 'secret');
    if (!payload || !payload.id) return res.status(401).json({ message: 'Invalid token' });

    // Fetch user from DB by internal _id
    const sql = 'SELECT * FROM users WHERE _id = ? LIMIT 1';
    db.query(sql, [payload.id], (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err });
      if (!results || results.length === 0) return res.status(401).json({ message: 'User not found' });
      const user = results[0];

      // tenant enforcement: if req.tenantId exists, ensure user.tenant_id matches
      if (req.tenantId && String(user.tenant_id) !== String(req.tenantId)) {
        return res.status(403).json({ message: 'Tenant mismatch' });
      }

      req.user = user;
      next();
    });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token', error: e.message });
  }
}

// role(s) can be a string or an array of allowed roles
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ message: 'Insufficient role' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
