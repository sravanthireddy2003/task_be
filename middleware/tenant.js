const db = require('../db');
const jwt = require('jsonwebtoken');

// Extract tenant id from headers or body and attach to req.
// If not provided, try to derive from Bearer token's user id (look up user.tenant_id).
module.exports = async function tenantMiddleware(req, res, next) {
  try {
    let tenantId = req.headers['x-tenant-id'] || req.body && req.body.tenantId || req.query && req.query.tenantId;
    if (tenantId) {
      req.tenantId = tenantId;
      return next();
    }

    // Try to derive from Authorization Bearer token
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(400).json({ message: 'Missing tenant id (x-tenant-id header or tenantId body/query).' });
    }

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.SECRET || 'secret');
    } catch (e) {
      return res.status(400).json({ message: 'Missing tenant id and invalid/expired token.' });
    }

    const userId = payload && payload.id;
    if (!userId) return res.status(400).json({ message: 'Missing tenant id and token did not contain user id.' });

    // lookup tenant_id from users table. Tokens may contain either internal `_id` (number)
    // or `public_id` (string). Try both to resolve tenant reliably.
    const q = 'SELECT tenant_id FROM users WHERE _id = ? OR public_id = ? LIMIT 1';
    db.query(q, [userId, String(userId)], (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error while resolving tenant id', error: err.message });
      if (!results || results.length === 0) {
        return res.status(400).json({ message: 'Unable to resolve tenant id for user in token' });
      }
      req.tenantId = results[0].tenant_id;
      return next();
    });
  } catch (e) {
    return res.status(500).json({ message: 'Internal error resolving tenant', error: e.message });
  }
};
