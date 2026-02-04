const db = require('../db');
const jwt = require('jsonwebtoken');
const env = require('../config/env');



module.exports = async function tenantMiddleware(req, res, next) {
  try {

    let tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenantId) || (req.query && req.query.tenantId);
    if (tenantId) {
      req.tenantId = tenantId;
      return next();
    }

    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {

      return next();
    }

    const token = auth.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET || 'secret', { ignoreExpiration: true });
    } catch (e) {

      return next();
    }

    const userId = payload && payload.id;
    if (!userId) {

      return next();
    }


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

    return next();
  }
};
