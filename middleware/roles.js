const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

// Verify JWT and attach user to req.user. Also enforce tenant if present.
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization || req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.SECRET || 'secret');
    if (!payload || !payload.id) return res.status(401).json({ message: 'Invalid token' });

    // payload.id may be internal numeric _id or external public_id (string)
    const tokenId = payload.id;
    const isNumeric = /^\d+$/.test(String(tokenId));
    const sql = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    db.query(sql, [tokenId], (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err });
      if (!results || results.length === 0) return res.status(401).json({ message: 'User not found' });
      const user = results[0];

      // tenant enforcement: if req.tenantId exists, ensure user.tenant_id matches
      if (req.tenantId && String(user.tenant_id) !== String(req.tenantId)) {
        return res.status(403).json({ message: 'Tenant mismatch' });
      }

      // normalize user object attached to request: expose external `id` for API consumers
      const externalId = user.public_id || user._id;
      req.user = {
        _id: user._id,
        id: externalId,
        public_id: user.public_id || null,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id
      };
      // token valid and not expired
      req.tokenExpired = false;
      next();
    });
  } catch (e) {
    // If token expired, attempt to decode/verify ignoring expiration so we can
    // attach the user (useful for flows that want to recover or refresh tokens).
    if (e && e.name === 'TokenExpiredError') {
      try {
        const payload = jwt.verify(token, process.env.SECRET || 'secret', { ignoreExpiration: true });
        if (!payload || !payload.id) return res.status(401).json({ message: 'Invalid token' });

        const tokenId = payload.id;
        const isNumeric = /^\d+$/.test(String(tokenId));
        const sql = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
        return db.query(sql, [tokenId], (err, results) => {
          if (err) return res.status(500).json({ message: 'DB error', error: err });
          if (!results || results.length === 0) return res.status(401).json({ message: 'User not found' });
          const user = results[0];

          if (req.tenantId && String(user.tenant_id) !== String(req.tenantId)) {
            return res.status(403).json({ message: 'Tenant mismatch' });
          }

          const externalId = user.public_id || user._id;
          req.user = {
            _id: user._id,
            id: externalId,
            public_id: user.public_id || null,
            name: user.name,
            email: user.email,
            role: user.role,
            tenant_id: user.tenant_id
          };
          // mark that the token was expired; callers can decide how to handle
          req.tokenExpired = true;
          next();
        });
      } catch (e2) {
        return res.status(401).json({ message: 'Invalid token', error: e2.message });
      }
    }
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
