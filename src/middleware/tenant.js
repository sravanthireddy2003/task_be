const db = require('../db');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Extract tenant id from headers or body and attach to req.
// If not provided and no token present, allow to proceed (auth middleware will handle later).
// If token is present, derive tenant from token's user id (look up user.tenant_id).
module.exports = async function tenantMiddleware(req, res, next) {
  try {
    // First, try explicit tenant ID from headers/body/query
    let tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenantId) || (req.query && req.query.tenantId);
    if (tenantId) {
      req.tenantId = tenantId;
      return next();
    }

    // Try to derive from Authorization Bearer token
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      // No tenant provided and no token - allow next middleware (requireAuth) to handle
      return next();
    }

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET || 'secret', { ignoreExpiration: true });
    } catch (e) {
      // Invalid token - allow requireAuth middleware to handle the error
      return next();
    }

    const userId = payload && payload.id;
    if (!userId) {
      // No user id in token - allow requireAuth to handle
      return next();
    }

    // lookup tenant_id from users table. Tokens may contain either internal `_id` (number)
    // or `public_id` (string). Try both to resolve tenant reliably.
    const q = 'SELECT tenant_id FROM users WHERE _id = ? OR public_id = ? LIMIT 1';
    db.query(q, [userId, String(userId)], (err, results) => {
      if (err) {
        return next();
      }
      if (results && results.length > 0) {
        req.tenantId = results[0].tenant_id;
      }
      return next();
    });
  } catch (e) {
    // Unexpected error - allow next middleware to handle
    return next();
  }
};
