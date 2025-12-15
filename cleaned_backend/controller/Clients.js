const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const emailService = require(__root + 'utils/emailService');
require('dotenv').config();

router.use(requireAuth);

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Cache and helper to check for column existence (prevents ER_BAD_FIELD_ERROR)
const columnCache = {};
async function hasColumn(table, column) {
  const key = `${table}::${column}`;
  if (columnCache[key] !== undefined) return columnCache[key];
  try {
    const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
    const ok = Array.isArray(rows) && rows.length > 0;
    columnCache[key] = ok;
    return ok;
  } catch (e) {
    columnCache[key] = false;
    return false;
  }
}

async function tableExists(tableName) {
  const rows = await q("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureClientTables() {
  try {
    if (!await tableExists('client_contacts')) {
      await q("CREATE TABLE IF NOT EXISTS client_contacts (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), designation VARCHAR(255), is_primary TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    if (!await tableExists('client_documents')) {
      await q("CREATE TABLE IF NOT EXISTS client_documents (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, file_url TEXT, file_name VARCHAR(255), file_type VARCHAR(100), uploaded_by INT, uploaded_at DATETIME DEFAULT NOW(), is_active TINYINT(1) DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    if (!await tableExists('client_activity_logs')) {
      await q("CREATE TABLE IF NOT EXISTS client_activity_logs (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, actor_id INT, action VARCHAR(255), details TEXT, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
  } catch (e) {
    logger.warn('Failed to ensure client supporting tables: ' + e.message);
  }
}

router.post('/', requireRole('Admin'), async (req, res) => {
  try {
    await ensureClientTables();
    const { name, company, billingAddress, officeAddress, gstNumber, taxId, industry, notes, status = 'Active', managerId, contacts = [], enableClientPortal = false, createViewer = false, email, phone } = req.body;
    if (!name || !company) return res.status(400).json({ success: false, error: 'name and company required' });
    const hasIsDeleted = await hasColumn('clientss', 'isDeleted');
    const dupSql = hasIsDeleted ? 'SELECT id FROM clientss WHERE name = ? AND isDeleted != 1 LIMIT 1' : 'SELECT id FROM clientss WHERE name = ? LIMIT 1';
    const dup = await q(dupSql, [name]);
    if (Array.isArray(dup) && dup.length > 0) return res.status(409).json({ success: false, error: 'Client with that name already exists' });
    const compInit = (company || '').substring(0, 3).toUpperCase() || name.substring(0, 3).toUpperCase();
    const last = await q('SELECT ref FROM clientss WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', [`${compInit}%`]);
    let seq = '0001';
    if (Array.isArray(last) && last.length > 0) {
      const lastn = parseInt(last[0].ref.slice(-4) || '0', 10) || 0;
      seq = (lastn + 1).toString().padStart(4, '0');
    }
    const ref = `${compInit}${seq}`;
    const fullInsertSql = 'INSERT INTO clientss (ref, name, company, billing_address, office_address, gst_number, tax_id, industry, notes, status, manager_id, email, phone, created_at, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)';
    const fullParams = [ref, name, company, billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, status, managerId || null, email || null, phone || null];
    let clientId;
    try {
      const result = await q(fullInsertSql, fullParams);
      clientId = result.insertId;
    } catch (e) {
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        const fallback = await q('INSERT INTO clientss (ref, name, company) VALUES (?, ?, ?)', [ref, name, company]);
        clientId = fallback.insertId;
        logger.debug('Full client insert failed; used minimal fallback insert.');
        try { await q('UPDATE clientss SET billing_address = ?, office_address = ?, gst_number = ?, tax_id = ?, industry = ?, notes = ?, manager_id = ?, email = ?, phone = ? WHERE id = ?', [billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, managerId || null, email || null, phone || null, clientId]); } catch (u) { }
      } else { throw e; }
    }
    if (Array.isArray(contacts) && contacts.length > 0) { for (const c of contacts) { await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]); } }
    if (managerId) { const onboardingTasks = [{ title: 'KYC Verification', desc: 'Verify client KYC documents and identity' },{ title: 'Contract Signing', desc: 'Obtain signed contract from client' },{ title: 'Project Setup', desc: 'Create initial project skeleton and workspace' },{ title: 'Access Provision', desc: 'Provision access for client viewers and internal users' }]; for (const t of onboardingTasks) { try { await q('INSERT INTO tasks (title, description, assigned_to, created_at, status, client_id) VALUES (?, ?, ?, NOW(), ?, ?)', [t.title, t.desc, managerId, 'Open', clientId]); } catch (e) { logger.debug('Skipping task insert (tasks table missing?): ' + e.message); } } }
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [clientId, req.user && req.user._id ? req.user._id : null, 'create', JSON.stringify({ createdBy: req.user ? req.user.id : null })]);
    let viewerInfo = null;
    if (createViewer || enableClientPortal) {
      const tempPassword = crypto.randomBytes(6).toString('hex');
      try {
        const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
        const publicId = crypto.randomBytes(8).toString('hex');
        const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())';
        await q(insertUserSql, [publicId, `${name} (Viewer)`, null, hashed, 'Client-Viewer', 1]);
        if (contacts && contacts.length > 0 && contacts[0].email) { try { emailService.sendCredentials(contacts[0].email, contacts[0].name || 'Client', publicId, tempPassword); } catch (e) { logger.warn('Failed sending client viewer credentials: ' + e.message); } }
        viewerInfo = { publicId };
      } catch (e) { logger.warn('Failed to create client-viewer: ' + e.message); }
    }
    return res.status(201).json({ success: true, data: { id: clientId, ref, name, company }, viewer: viewerInfo });
  } catch (e) { logger.error('Error creating client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10); const perPage = Math.min(parseInt(req.query.perPage || '25', 10), 200);
    const search = req.query.search || null; const status = req.query.status || null; const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    let where = []; let params = [];
    const hasIsDeletedList = await hasColumn('clientss', 'isDeleted');
    const hasStatus = await hasColumn('clientss', 'status');
    const hasManager = await hasColumn('clientss', 'manager_id');
    const hasCreatedAt = await hasColumn('clientss', 'created_at');
    if (!includeDeleted && hasIsDeletedList) { where.push('isDeleted != 1'); }
    if (status && hasStatus) { where.push('status = ?'); params.push(status); }
    if (search) { where.push('(name LIKE ? OR company LIKE ? OR ref LIKE ?)'); params.push('%' + search + '%', '%'+search+'%', '%'+search+'%'); }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const countSql = `SELECT COUNT(*) as c FROM clientss ${whereSql}`; const total = (await q(countSql, params))[0].c || 0; const offset = (page - 1) * perPage;
    const selectCols = ['clientss.id','clientss.ref','clientss.name','clientss.company']; if (hasStatus) selectCols.push('clientss.status'); if (hasManager) selectCols.push('clientss.manager_id'); if (hasCreatedAt) selectCols.push('clientss.created_at');
    let joinClause = '';
    const hasClientContacts = await tableExists('client_contacts');
    const hasEmailCol = await hasColumn('clientss', 'email');
    const hasPhoneCol = await hasColumn('clientss', 'phone');
    if (hasClientContacts) {
      joinClause = ' LEFT JOIN (SELECT client_id, email, phone FROM client_contacts WHERE is_primary = 1) pc ON pc.client_id = clientss.id ';
      if (!hasEmailCol) selectCols.push('pc.email AS email'); else selectCols.push('clientss.email');
      if (!hasPhoneCol) selectCols.push('pc.phone AS phone'); else selectCols.push('clientss.phone');
    } else { if (hasEmailCol) selectCols.push('clientss.email'); if (hasPhoneCol) selectCols.push('clientss.phone'); }
    const listSql = `SELECT ${selectCols.join(', ')} FROM clientss ${joinClause} ${whereSql} ${hasCreatedAt ? 'ORDER BY clientss.created_at DESC' : 'ORDER BY clientss.id DESC'} LIMIT ? OFFSET ?`;
    const rows = await q(listSql, params.concat([perPage, offset]));
    return res.json({ success: true, data: rows, meta: { total, page, perPage } });
  } catch (e) { logger.error('Error listing clients: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
