const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require(__root + 'db');

// Simple JWT auth middleware that loads user from DB and attaches to req.user
module.exports = async function (req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.SECRET || 'secret');
    const tokenId = decoded.id;
    if (!tokenId) return res.status(401).json({ error: 'Invalid token' });

    // if tokenId is numeric, treat as internal _id; otherwise treat as public_id
    const isNumeric = /^\d+$/.test(String(tokenId));
    const sql = isNumeric ? 'SELECT _id, public_id, name, email, role, tenant_id FROM users WHERE _id = ? LIMIT 1' : 'SELECT _id, public_id, name, email, role, tenant_id FROM users WHERE public_id = ? LIMIT 1';
    db.query(sql, [tokenId], (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error', details: err.message });
      if (!rows || rows.length === 0) return res.status(401).json({ error: 'User not found' });
      const u = rows[0];
      // attach both internal and external ids; `id` is the external/public id for API consumers
      req.user = { _id: u._id, id: u.public_id || String(u._id), name: u.name, email: u.email, role: u.role, tenant_id: u.tenant_id };
      next();
    });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token', details: e.message });
  }
};
