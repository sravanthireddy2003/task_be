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
    // check for isDeleted column before using it in WHERE
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
    // Attempt full insert, but fall back gracefully if DB schema lacks some columns
    // include email/phone in full insert (if table has these columns this will succeed)
    const fullInsertSql = 'INSERT INTO clientss (ref, name, company, billing_address, office_address, gst_number, tax_id, industry, notes, status, manager_id, email, phone, created_at, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)';
    const fullParams = [ref, name, company, billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, status, managerId || null, email || null, phone || null];
    let clientId;
    try {
      const result = await q(fullInsertSql, fullParams);
      clientId = result.insertId;
    } catch (e) {
      // If columns are missing, fall back to a minimal insert and try to update optional fields
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        const fallback = await q('INSERT INTO clientss (ref, name, company) VALUES (?, ?, ?)', [ref, name, company]);
        clientId = fallback.insertId;
        logger.debug('Full client insert failed; used minimal fallback insert.');
        try { await q('UPDATE clientss SET billing_address = ?, office_address = ?, gst_number = ?, tax_id = ?, industry = ?, notes = ?, manager_id = ?, email = ?, phone = ? WHERE id = ?', [billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, managerId || null, email || null, phone || null, clientId]); } catch (u) { /* ignore update failures for optional columns */ }
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

router.get('/:id', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
  try {
    const id = req.params.id; const clientRow = (await q('SELECT * FROM clientss WHERE id = ? LIMIT 1', [id]));
    if (!clientRow || clientRow.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
    const client = clientRow[0];
    const contacts = await q('SELECT id, name, email, phone, designation, is_primary FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, id ASC', [id]).catch(() => []);
    if ((!client.email || client.email === null) && contacts && contacts.length > 0 && contacts[0].email) { client.email = contacts[0].email; }
    if ((!client.phone || client.phone === null) && contacts && contacts.length > 0 && contacts[0].phone) { client.phone = contacts[0].phone; }
    const documents = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [id]).catch(() => []);
    const activities = await q('SELECT id, actor_id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [id]).catch(() => []);
    let projectCount = 0, taskCount = 0, completedTasks = 0, pendingTasks = 0, billableHours = null, assignedManager = null;
    try { const pc = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]); projectCount = pc[0] ? pc[0].c : 0; const tc = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]); taskCount = tc[0] ? tc[0].c : 0; const comp = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]); completedTasks = comp[0] ? comp[0].c : 0; const pend = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]); pendingTasks = pend[0] ? pend[0].c : 0; const mgr = await q('SELECT manager_id FROM clientss WHERE id = ? LIMIT 1', [id]); assignedManager = mgr[0] ? mgr[0].manager_id : null; } catch (e) { logger.debug('Skipping some dashboard metrics: ' + e.message); }
    return res.json({ success: true, data: { client, contacts, documents, activities, dashboard: { projectCount, taskCount, completedTasks, pendingTasks, billableHours, assignedManager } } });
  } catch (e) { logger.error('Error fetching client details: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const payload = req.body || {}; delete payload.id; delete payload.ref; const allowed = ['name','company','billing_address','office_address','gst_number','tax_id','industry','notes','status','manager_id']; const setCols = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { setCols.push(`${k} = ?`); params.push(payload[k]); } if (setCols.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' }); params.push(id); await q(`UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`, params); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'update', JSON.stringify(payload)]).catch(()=>{}); return res.json({ success: true, message: 'Client updated' }); } catch (e) { logger.error('Error updating client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', requireRole('Admin'), async (req, res) => { try { const id = req.params.id; await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'soft-delete', 'soft deleted']).catch(()=>{}); return res.json({ success: true, message: 'Client soft-deleted' }); } catch (e) { logger.error('Error soft deleting client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/restore', requireRole('Admin'), async (req, res) => { try { const id = req.params.id; await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'restore', 'restored']).catch(()=>{}); return res.json({ success: true, message: 'Client restored' }); } catch (e) { logger.error('Error restoring client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/permanent', requireRole('Admin'), async (req, res) => { try { const id = req.params.id; await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM clientss WHERE id = ?', [id]); return res.json({ success: true, message: 'Client permanently deleted' }); } catch (e) { logger.error('Error permanently deleting client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => { try { const id = req.params.id; const { managerId } = req.body; if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' }); await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [managerId, id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'assign-manager', JSON.stringify({ managerId })]).catch(()=>{}); return res.json({ success: true, message: 'Manager assigned' }); } catch (e) { logger.error('Error assigning manager: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/contacts', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const { name, email, phone, designation, is_primary } = req.body; if (!name) return res.status(400).json({ success: false, error: 'name required' }); if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]); return res.status(201).json({ success: true, data: { id: r.insertId } }); } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.put('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; const payload = req.body || {}; if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const allowed = ['name','email','phone','designation','is_primary']; const sets = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); } if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' }); params.push(contactId); await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params); return res.json({ success: true, message: 'Contact updated' }); } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.delete('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const contactId = req.params.contactId; await q('DELETE FROM client_contacts WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Contact deleted' }); } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.post('/:id/contacts/:contactId/set-primary', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Primary contact set' }); } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.post('/:id/documents', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const { file_url, file_name, file_type, uploaded_by } = req.body; if (!file_url || !file_name) return res.status(400).json({ success: false, error: 'file_url and file_name required' }); const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, file_url, file_name, file_type || null, uploaded_by || (req.user && req.user._id ? req.user._id : null)]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify({ id: r.insertId, file_name })]).catch(()=>{}); return res.status(201).json({ success: true, data: { id: r.insertId } }); } catch (e) { logger.error('Error attaching document: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

module.exports = router;

// Assign manager
router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { managerId } = req.body;
    if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' });
    await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [managerId, id]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'assign-manager', JSON.stringify({ managerId })]).catch(()=>{});
    return res.json({ success: true, message: 'Manager assigned' });
  } catch (e) {
    logger.error('Error assigning manager: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Contacts CRUD
router.post('/:id/contacts', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id;
    const { name, email, phone, designation, is_primary } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); }
    const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]);
    return res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id; const contactId = req.params.contactId;
    const payload = req.body || {};
    if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); }
    const allowed = ['name','email','phone','designation','is_primary'];
    const sets = []; const params = [];
    for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); }
    if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' });
    params.push(contactId);
    await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params);
    return res.json({ success: true, message: 'Contact updated' });
  } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const contactId = req.params.contactId;
    await q('DELETE FROM client_contacts WHERE id = ?', [contactId]);
    return res.json({ success: true, message: 'Contact deleted' });
  } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/contacts/:contactId/set-primary', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id; const contactId = req.params.contactId;
    await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
    await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]);
    return res.json({ success: true, message: 'Primary contact set' });
  } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

// Attach document metadata to client (use Uploads route to upload file and pass file_url here)
router.post('/:id/documents', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id;
    const { file_url, file_name, file_type, uploaded_by } = req.body;
    if (!file_url || !file_name) return res.status(400).json({ success: false, error: 'file_url and file_name required' });
    const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, file_url, file_name, file_type || null, uploaded_by || (req.user && req.user._id ? req.user._id : null)]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify({ id: r.insertId, file_name })]).catch(()=>{});
    return res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) { logger.error('Error attaching document: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const emailService = require(__root + 'utils/emailService');
require('dotenv').config();

// All client endpoints require auth
router.use(requireAuth);

// promise wrapper for db.query
function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// helper: check if table exists
async function tableExists(tableName) {
  const rows = await q("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

// Try to create supporting tables if missing: client_contacts, client_documents, client_activity_logs
async function ensureClientTables() {
  try {
    if (!await tableExists('client_contacts')) {
      await q(`CREATE TABLE IF NOT EXISTS client_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        designation VARCHAR(255),
        is_primary TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW()
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    }
    if (!await tableExists('client_documents')) {
      await q(`CREATE TABLE IF NOT EXISTS client_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        file_url TEXT,
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        uploaded_by INT,
        uploaded_at DATETIME DEFAULT NOW(),
        module.exports = router;

// Soft delete client
router.delete('/:id', requireRole('Admin'), async (req, res) => {
const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const emailService = require(__root + 'utils/emailService');
require('dotenv').config();

// All client endpoints require auth
router.use(requireAuth);

// promise wrapper for db.query
function q(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

// helper: check if table exists
async function tableExists(tableName) {
    const rows = await q("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
    return Array.isArray(rows) && rows.length > 0;
}

// Try to create supporting tables if missing: client_contacts, client_documents, client_activity_logs
async function ensureClientTables() {
    try {
        if (!await tableExists('client_contacts')) {
            await q("CREATE TABLE IF NOT EXISTS client_contacts (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        client_id INT NOT NULL,\n        name VARCHAR(255) NOT NULL,\n        email VARCHAR(255),\n        phone VARCHAR(50),\n        designation VARCHAR(255),\n        is_primary TINYINT(1) DEFAULT 0,\n        created_at DATETIME DEFAULT NOW()\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        }
        if (!await tableExists('client_documents')) {
            await q("CREATE TABLE IF NOT EXISTS client_documents (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        client_id INT NOT NULL,\n        file_url TEXT,\n        file_name VARCHAR(255),\n        file_type VARCHAR(100),\n        uploaded_by INT,\n        uploaded_at DATETIME DEFAULT NOW(),\n        is_active TINYINT(1) DEFAULT 1\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        }
        if (!await tableExists('client_activity_logs')) {
            await q("CREATE TABLE IF NOT EXISTS client_activity_logs (\n        id INT AUTO_INCREMENT PRIMARY KEY,\n        client_id INT NOT NULL,\n        actor_id INT,\n        action VARCHAR(255),\n        details TEXT,\n        created_at DATETIME DEFAULT NOW()\n      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        }
    } catch (e) {
        logger.warn('Failed to ensure client supporting tables: ' + e.message);
    }
}

// Create Client
router.post('/', requireRole('Admin'), async (req, res) => {
    try {
        await ensureClientTables();

        const {
            name,
            company,
            billingAddress,
            officeAddress,
            gstNumber,
            taxId,
            industry,
            notes,
            status = 'Active',
            managerId,
            contacts = [],
            enableClientPortal = false,
            createViewer = false
        } = req.body;

        if (!name || !company) return res.status(400).json({ success: false, error: 'name and company required' });

        // deny duplicate active client names (simple check)
        const dup = await q('SELECT id FROM clientss WHERE name = ? AND isDeleted != 1 LIMIT 1', [name]);
        if (Array.isArray(dup) && dup.length > 0) return res.status(409).json({ success: false, error: 'Client with that name already exists' });

        // Generate a reference (company initials + 4-digit)
        const compInit = (company || '').substring(0, 3).toUpperCase() || name.substring(0, 3).toUpperCase();
        const last = await q('SELECT ref FROM clientss WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', [`${compInit}%`]);
        let seq = '0001';
        if (Array.isArray(last) && last.length > 0) {
            const lastn = parseInt(last[0].ref.slice(-4) || '0', 10) || 0;
            seq = (lastn + 1).toString().padStart(4, '0');
        }
        const ref = `${compInit}${seq}`;

        const insertSql = `INSERT INTO clientss (ref, name, company, billing_address, office_address, gst_number, tax_id, industry, notes, status, manager_id, created_at, isDeleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)`;
        const params = [ref, name, company, billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, status, managerId || null];
        const result = await q(insertSql, params);
        const clientId = result.insertId;

        // insert contacts if provided
        if (Array.isArray(contacts) && contacts.length > 0) {
            for (const c of contacts) {
                await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]);
            }
        }

        // Auto-create onboarding tasks if manager assigned
        if (managerId) {
            const onboardingTasks = [
                { title: 'KYC Verification', desc: 'Verify client KYC documents and identity' },
                { title: 'Contract Signing', desc: 'Obtain signed contract from client' },
                { title: 'Project Setup', desc: 'Create initial project skeleton and workspace' },
                { title: 'Access Provision', desc: 'Provision access for client viewers and internal users' }
            ];
            for (const t of onboardingTasks) {
                try {
                    await q('INSERT INTO tasks (title, description, assigned_to, created_at, status, client_id) VALUES (?, ?, ?, NOW(), ?, ?)', [t.title, t.desc, managerId, 'Open', clientId]);
                } catch (e) {
                    // tasks table may not exist; ignore if insert fails
                    logger.debug('Skipping task insert (tasks table missing?): ' + e.message);
                }
            }
        }

        // log activity
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [clientId, req.user && req.user._id ? req.user._id : null, 'create', JSON.stringify({ createdBy: req.user ? req.user.id : null })]);

        // Optionally create client-viewer user
        let viewerInfo = null;
        if (createViewer || enableClientPortal) {
            const tempPassword = crypto.randomBytes(6).toString('hex');
            try {
                const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
                const publicId = crypto.randomBytes(8).toString('hex');
                const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())';
                await q(insertUserSql, [publicId, `${name} (Viewer)`, null, hashed, 'Client-Viewer', 1]);
                // send email with credentials if email provided
                if (contacts && contacts.length > 0 && contacts[0].email) {
                    try { emailService.sendCredentials(contacts[0].email, contacts[0].name || 'Client', publicId, tempPassword); } catch (e) { logger.warn('Failed sending client viewer credentials: ' + e.message); }
                }
                viewerInfo = { publicId };
            } catch (e) {
                logger.warn('Failed to create client-viewer: ' + e.message);
            }
        }

        const out = { success: true, data: { id: clientId, ref, name, company }, viewer: viewerInfo };
        return res.status(201).json(out);
    } catch (e) {
        logger.error('Error creating client: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// List Clients with pagination, search, filters
router.get('/', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const perPage = Math.min(parseInt(req.query.perPage || '25', 10), 200);
        const search = req.query.search || null;
        const status = req.query.status || null; // Active/On Hold/Closed
        const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';

        let where = [];
        let params = [];
        if (!includeDeleted) { where.push('isDeleted != 1'); }
        if (status) { where.push('status = ?'); params.push(status); }
        if (search) { where.push('(name LIKE ? OR company LIKE ? OR ref LIKE ?)'); params.push('%' + search + '%', '%'+search+'%', '%'+search+'%'); }

        const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
        const countSql = `SELECT COUNT(*) as c FROM clientss ${whereSql}`;
        const total = (await q(countSql, params))[0].c || 0;
        const offset = (page - 1) * perPage;
        const listSql = `SELECT id, ref, name, company, status, manager_id, created_at FROM clientss ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        const rows = await q(listSql, params.concat([perPage, offset]));

        return res.json({ success: true, data: rows, meta: { total, page, perPage } });
    } catch (e) {
        logger.error('Error listing clients: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Get single client with contacts, documents, activity and basic dashboard stats
router.get('/:id', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
    try {
        const id = req.params.id;
        const clientRow = (await q('SELECT * FROM clientss WHERE id = ? LIMIT 1', [id]));
        if (!clientRow || clientRow.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
        const client = clientRow[0];

        const contacts = await q('SELECT id, name, email, phone, designation, is_primary FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, id ASC', [id]).catch(() => []);
        const documents = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [id]).catch(() => []);
        const activities = await q('SELECT id, actor_id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [id]).catch(() => []);

        // dashboard stats: projects count, tasks count, completed/pending
        let projectCount = 0, taskCount = 0, completedTasks = 0, pendingTasks = 0, billableHours = null, assignedManager = null;
        try {
            const pc = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]); projectCount = pc[0] ? pc[0].c : 0;
            const tc = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]); taskCount = tc[0] ? tc[0].c : 0;
            const comp = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]); completedTasks = comp[0] ? comp[0].c : 0;
            const pend = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]); pendingTasks = pend[0] ? pend[0].c : 0;
            const mgr = await q('SELECT manager_id FROM clientss WHERE id = ? LIMIT 1', [id]); assignedManager = mgr[0] ? mgr[0].manager_id : null;
        } catch (e) {
            logger.debug('Skipping some dashboard metrics: ' + e.message);
        }

        return res.json({ success: true, data: { client, contacts, documents, activities, dashboard: { projectCount, taskCount, completedTasks, pendingTasks, billableHours, assignedManager } } });
    } catch (e) {
        logger.error('Error fetching client details: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Update client
router.put('/:id', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const id = req.params.id;
        const payload = req.body || {};
        // disallow setting id/ref directly
        delete payload.id; delete payload.ref;
        const allowed = ['name','company','billing_address','office_address','gst_number','tax_id','industry','notes','status','manager_id'];
        const setCols = [];
        const params = [];
        for (const k of allowed) if (payload[k] !== undefined) { setCols.push(`${k} = ?`); params.push(payload[k]); }
        if (setCols.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' });
        params.push(id);
        await q(`UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`, params);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'update', JSON.stringify(payload)]).catch(()=>{});
        return res.json({ success: true, message: 'Client updated' });
    } catch (e) {
        logger.error('Error updating client: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Soft delete client
router.delete('/:id', requireRole('Admin'), async (req, res) => {
    try {
        const id = req.params.id;
        await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'soft-delete', 'soft deleted']).catch(()=>{});
        return res.json({ success: true, message: 'Client soft-deleted' });
    } catch (e) {
        logger.error('Error soft deleting client: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Restore client
router.post('/:id/restore', requireRole('Admin'), async (req, res) => {
    try {
        const id = req.params.id;
        await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'restore', 'restored']).catch(()=>{});
        return res.json({ success: true, message: 'Client restored' });
    } catch (e) {
        logger.error('Error restoring client: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Permanent delete (Admin only)
router.delete('/:id/permanent', requireRole('Admin'), async (req, res) => {
    try {
        const id = req.params.id;
        await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{});
        await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{});
        await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{});
        await q('DELETE FROM clientss WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Client permanently deleted' });
    } catch (e) {
        logger.error('Error permanently deleting client: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Assign manager
router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => {
    try {
        const id = req.params.id;
        const { managerId } = req.body;
        if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' });
        await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [managerId, id]);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'assign-manager', JSON.stringify({ managerId })]).catch(()=>{});
        return res.json({ success: true, message: 'Manager assigned' });
    } catch (e) {
        logger.error('Error assigning manager: ' + e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Contacts CRUD
router.post('/:id/contacts', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const id = req.params.id;
        const { name, email, phone, designation, is_primary } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name required' });
        if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); }
        const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]);
        return res.status(201).json({ success: true, data: { id: r.insertId } });
    } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const id = req.params.id; const contactId = req.params.contactId;
        const payload = req.body || {};
        if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); }
        const allowed = ['name','email','phone','designation','is_primary'];
        const sets = []; const params = [];
        for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); }
        if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' });
        params.push(contactId);
        await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params);
        return res.json({ success: true, message: 'Contact updated' });
    } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const contactId = req.params.contactId;
        await q('DELETE FROM client_contacts WHERE id = ?', [contactId]);
        return res.json({ success: true, message: 'Contact deleted' });
    } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/contacts/:contactId/set-primary', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const id = req.params.id; const contactId = req.params.contactId;
        await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
        await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]);
        return res.json({ success: true, message: 'Primary contact set' });
    } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

// Attach document metadata to client (use Uploads route to upload file and pass file_url here)
router.post('/:id/documents', requireRole(['Admin','Manager']), async (req, res) => {
    try {
        const id = req.params.id;
        const { file_url, file_name, file_type, uploaded_by } = req.body;
        if (!file_url || !file_name) return res.status(400).json({ success: false, error: 'file_url and file_name required' });
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, file_url, file_name, file_type || null, uploaded_by || (req.user && req.user._id ? req.user._id : null)]);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify({ id: r.insertId, file_name })]).catch(()=>{});
        return res.status(201).json({ success: true, data: { id: r.insertId } });
    } catch (e) { logger.error('Error attaching document: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
                try {
                    const pc = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]); projectCount = pc[0] ? pc[0].c : 0;
                    const tc = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]); taskCount = tc[0] ? tc[0].c : 0;
                    const comp = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]); completedTasks = comp[0] ? comp[0].c : 0;
                    const pend = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]); pendingTasks = pend[0] ? pend[0].c : 0;
                    const mgr = await q('SELECT manager_id FROM clientss WHERE id = ? LIMIT 1', [id]); assignedManager = mgr[0] ? mgr[0].manager_id : null;
                    // billableHours requires timesheets table; if missing, skip
                } catch (e) {
                    logger.debug('Skipping some dashboard metrics: ' + e.message);
                }

                return res.json({ success: true, data: { client, contacts, documents, activities, dashboard: { projectCount, taskCount, completedTasks, pendingTasks, billableHours, assignedManager } } });
            } catch (e) {
                logger.error('Error fetching client details: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Update client
        router.put('/clients/:id', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const id = req.params.id;
                const payload = req.body || {};
                // disallow setting id/ref directly
                delete payload.id; delete payload.ref;
                const allowed = ['name','company','billing_address','office_address','gst_number','tax_id','industry','notes','status','manager_id'];
                const setCols = [];
                const params = [];
                for (const k of allowed) if (payload[k] !== undefined) { setCols.push(`${k} = ?`); params.push(payload[k]); }
                if (setCols.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' });
                params.push(id);
                await q(`UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`, params);
                await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'update', JSON.stringify(payload)]).catch(()=>{});
                return res.json({ success: true, message: 'Client updated' });
            } catch (e) {
                logger.error('Error updating client: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Soft delete client
        router.delete('/clients/:id', requireRole('Admin'), async (req, res) => {
            try {
                const id = req.params.id;
                await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
                await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'soft-delete', 'soft deleted']).catch(()=>{});
                return res.json({ success: true, message: 'Client soft-deleted' });
            } catch (e) {
                logger.error('Error soft deleting client: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Restore client
        router.post('/clients/:id/restore', requireRole('Admin'), async (req, res) => {
            try {
                const id = req.params.id;
                await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]);
                await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'restore', 'restored']).catch(()=>{});
                return res.json({ success: true, message: 'Client restored' });
            } catch (e) {
                logger.error('Error restoring client: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Permanent delete (Admin only) - deletes client and associated contacts/documents/activity. Use with caution.
        router.delete('/clients/:id/permanent', requireRole('Admin'), async (req, res) => {
            try {
                const id = req.params.id;
                await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{});
                await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{});
                await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{});
                await q('DELETE FROM clientss WHERE id = ?', [id]);
                return res.json({ success: true, message: 'Client permanently deleted' });
            } catch (e) {
                logger.error('Error permanently deleting client: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Assign manager
        router.post('/clients/:id/assign-manager', requireRole('Admin'), async (req, res) => {
            try {
                const id = req.params.id;
                const { managerId } = req.body;
                if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' });
                await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [managerId, id]);
                await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'assign-manager', JSON.stringify({ managerId })]).catch(()=>{});
                return res.json({ success: true, message: 'Manager assigned' });
            } catch (e) {
                logger.error('Error assigning manager: ' + e.message);
                return res.status(500).json({ success: false, error: e.message });
            }
        });

        // Contacts CRUD
        router.post('/clients/:id/contacts', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const id = req.params.id;
                const { name, email, phone, designation, is_primary } = req.body;
                if (!name) return res.status(400).json({ success: false, error: 'name required' });
                if (is_primary) {
                    await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
                }
                const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]);
                return res.status(201).json({ success: true, data: { id: r.insertId } });
            } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
        });

        router.put('/clients/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const { id, contactId } = { id: req.params.id, contactId: req.params.contactId };
                const payload = req.body || {};
                if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); }
                const allowed = ['name','email','phone','designation','is_primary'];
                const sets = []; const params = [];
                for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); }
                if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' });
                params.push(contactId);
                await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params);
                return res.json({ success: true, message: 'Contact updated' });
            } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
        });

        router.delete('/clients/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const contactId = req.params.contactId;
                await q('DELETE FROM client_contacts WHERE id = ?', [contactId]);
                return res.json({ success: true, message: 'Contact deleted' });
            } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
        });

        router.post('/clients/:id/contacts/:contactId/set-primary', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const { id, contactId } = { id: req.params.id, contactId: req.params.contactId };
                await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
                await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]);
                return res.json({ success: true, message: 'Primary contact set' });
            } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
        });

        // Attach document metadata to client (use Uploads route to upload file and pass file_url here)
        router.post('/clients/:id/documents', requireRole(['Admin','Manager']), async (req, res) => {
            try {
                const id = req.params.id;
                const { file_url, file_name, file_type, uploaded_by } = req.body;
                if (!file_url || !file_name) return res.status(400).json({ success: false, error: 'file_url and file_name required' });
                const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, file_url, file_name, file_type || null, uploaded_by || (req.user && req.user._id ? req.user._id : null)]);
                await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify({ id: r.insertId, file_name })]).catch(()=>{});
                return res.status(201).json({ success: true, data: { id: r.insertId } });
            } catch (e) { logger.error('Error attaching document: '+e.message); return res.status(500).json({ success: false, error: e.message }); }
        });

        module.exports = router;
        logger.info(`Client with ID: ${id} deleted successfully.`);
        res.status(200).json({ message: 'Client deleted' });
    });
});

module.exports = router;


