const db = require(__root + 'db');
const logger = require(__root + 'logger');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));

// Minimal role-based enforcement inside service. The system uses rule engine
// for authorization flow; this provides a second-layer enforcement.
function canAssign(user) {
  if (!user || !user.role) return false;
  const role = String(user.role).toLowerCase();
  return role === 'admin' || role === 'manager';
}

module.exports = {
  // documentId, assigneeId, accessType (e.g., 'READ')
  async assignAccess({ documentId, assigneeId, accessType = 'READ', user = {} }) {
    if (!documentId || !assigneeId) {
      const err = new Error('documentId and assigneeId required');
      err.status = 400;
      throw err;
    }

    if (!canAssign(user)) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }

    const createdAt = new Date();
    const res = await q(
      'INSERT INTO document_access (document_id, user_id, access_type, assigned_by, created_at) VALUES (?, ?, ?, ?, ?)',
      [documentId, assigneeId, accessType, user && (user.id || user._id) || null, createdAt]
    );

    return { id: res.insertId, documentId, assigneeId, accessType };
  }
};
