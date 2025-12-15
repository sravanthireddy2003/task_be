const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');

// configure multer to save files into uploads/ directory
const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsRoot);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const name = `${base}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

function saveBase64ToUploads(base64data, filename) {
  try {
    if (!base64data || !filename) return null;
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    // Avoid overwriting: if file exists, append timestamp
    let targetName = filename;
    const targetPath = () => path.join(uploadsDir, targetName);
    if (fs.existsSync(targetPath())) {
      const ts = Date.now();
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      targetName = `${base}_${ts}${ext}`;
    }
    // base64 may include data:<mime>;base64, prefix — strip if present
    const matched = base64data.match(/^data:(.*);base64,(.*)$/);
    const b64 = matched ? matched[2] : base64data;
    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(targetPath(), buffer);
    return `${process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:4000'}/uploads/${encodeURIComponent(targetName)}`;
  } catch (e) {
    logger.debug('Failed to save base64 file: ' + (e && e.message));
    return null;
  }
}
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const emailService = require(__root + 'utils/emailService');
require('dotenv').config();

router.use(requireAuth);
const clientViewer = require(__root + 'middleware/clientViewer');
// attach viewer mapping when present
router.use(clientViewer);

function guessMimeType(filename) {
  if (!filename) return null;
  // prefer mime-types lookup, fall back to extension map
  const m = mime.lookup(filename);
  if (m) return m;
  const ext = (path.extname(filename) || '').toLowerCase().replace('.', '');
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    txt: 'text/plain',
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext] || null;
}

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
    if (!await tableExists('client_viewers')) {
      await q("CREATE TABLE IF NOT EXISTS client_viewers (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, user_id INT NOT NULL, created_at DATETIME DEFAULT NOW(), UNIQUE KEY uniq_client_user (client_id, user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
  } catch (e) {
    logger.warn('Failed to ensure client supporting tables: ' + e.message);
  }
}

router.post('/', requireRole('Admin'), async (req, res) => {
  try {
    await ensureClientTables();
    const { name, company, billingAddress, officeAddress, gstNumber, taxId, industry, notes, status = 'Active', managerId, contacts = [], enableClientPortal = false, createViewer = false, email, phone, district, pincode, state, documents = [] } = req.body;
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
        try {
          await q('UPDATE clientss SET billing_address = ?, office_address = ?, gst_number = ?, tax_id = ?, industry = ?, notes = ?, manager_id = ?, email = ?, phone = ? WHERE id = ?', [billingAddress || null, officeAddress || null, gstNumber || null, taxId || null, industry || null, notes || null, managerId || null, email || null, phone || null, clientId]);
        } catch (u) { /* ignore update failures for optional columns */ }
      } else {
        throw e;
      }
    }
    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const c of contacts) {
        await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]);
      }
    }

    // Apply additional optional fields (district, pincode, state, phone, email) if columns exist
    try {
      const optionalCols = [];
      const optionalParams = [];
      if (district && await hasColumn('clientss', 'district')) { optionalCols.push('district = ?'); optionalParams.push(district); }
      if (pincode && await hasColumn('clientss', 'pincode')) { optionalCols.push('pincode = ?'); optionalParams.push(pincode); }
      if (state && await hasColumn('clientss', 'state')) { optionalCols.push('state = ?'); optionalParams.push(state); }
      if (phone && await hasColumn('clientss', 'phone')) { optionalCols.push('phone = ?'); optionalParams.push(phone); }
      if (email && await hasColumn('clientss', 'email')) { optionalCols.push('email = ?'); optionalParams.push(email); }
      if (optionalCols.length > 0) {
        optionalParams.push(clientId);
        await q(`UPDATE clientss SET ${optionalCols.join(', ')} WHERE id = ?`, optionalParams);
      }
    } catch (e) {
      logger.debug('Optional client fields update skipped: ' + e.message);
    }

    // Insert attached documents in one go (if provided). Each document should have file_url and file_name.
    const attachedDocuments = [];
    if (Array.isArray(documents) && documents.length > 0) {
      for (const d of documents) {
        if (!d) continue;
        // allow payloads that include only file_name (frontend may upload file separately)
        const fileName = d.file_name || d.fileName || null;
        if (!fileName) continue;
        const fileUrl = d.file_url || d.fileUrl || (`${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`);
        try {
          const fileType = d.file_type || d.fileType || guessMimeType(fileName) || null;
          const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [clientId, fileUrl, fileName, fileType, d.uploaded_by || d.uploadedBy || (req.user && req.user._id ? req.user._id : null)]);
          attachedDocuments.push({ id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType });
        } catch (e) {
          logger.debug('Failed to attach document for client ' + clientId + ': ' + (e && e.message));
        }
      }
    }
    if (managerId) {
      const onboardingTasks = [{ title: 'KYC Verification', desc: 'Verify client KYC documents and identity' },{ title: 'Contract Signing', desc: 'Obtain signed contract from client' },{ title: 'Project Setup', desc: 'Create initial project skeleton and workspace' },{ title: 'Access Provision', desc: 'Provision access for client viewers and internal users' }];
      for (const t of onboardingTasks) {
        try { await q('INSERT INTO tasks (title, description, assigned_to, created_at, status, client_id) VALUES (?, ?, ?, NOW(), ?, ?)', [t.title, t.desc, managerId, 'Open', clientId]); } catch (e) { logger.debug('Skipping task insert (tasks table missing?): ' + e.message); }
      }
    }
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [clientId, req.user && req.user._id ? req.user._id : null, 'create', JSON.stringify({ createdBy: req.user ? req.user.id : null })]);
    let viewerInfo = null;
    if (createViewer || enableClientPortal) {
      const tempPassword = crypto.randomBytes(6).toString('hex');
      try {
        const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
        const publicId = crypto.randomBytes(8).toString('hex');
        // prefer contact email if provided
        const viewerEmail = (Array.isArray(contacts) && contacts[0] && contacts[0].email) ? contacts[0].email : (email || null);
        const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())';
        const userRes = await q(insertUserSql, [publicId, `${name} (Viewer)`, viewerEmail, hashed, 'Client-Viewer', 1]);
        const newUserId = userRes && userRes.insertId ? userRes.insertId : null;
        if (newUserId) {
          // create mapping
          try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]); } catch (e) { logger.debug('Failed to create client_viewers mapping: ' + e.message); }
        }
        if (viewerEmail) {
          try { emailService.sendCredentials(viewerEmail, contacts && contacts[0] && contacts[0].name ? contacts[0].name : `${name} (Viewer)`, publicId, tempPassword); } catch (e) { logger.warn('Failed sending client viewer credentials: ' + e.message); }
        }
        viewerInfo = { publicId, userId: newUserId };
      } catch (e) { logger.warn('Failed to create client-viewer: ' + e.message); }
    }
    return res.status(201).json({ success: true, data: { id: clientId, ref, name, company, documents: attachedDocuments }, viewer: viewerInfo });
  } catch (e) { logger.error('Error creating client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.get('/', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10); const perPage = Math.min(parseInt(req.query.perPage || '25', 10), 200);
    const search = req.query.search || null; const status = req.query.status || null; const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    let where = []; let params = [];
    // If caller is a client-viewer, scope results to their mapped client only
    if (req.user && req.user.role === 'Client-Viewer') {
      if (!req.viewerClientId) return res.status(403).json({ success: false, error: 'Viewer not mapped to a client' });
      where.push('clientss.id = ?'); params.push(req.viewerClientId);
    }
    const hasIsDeletedList = await hasColumn('clientss', 'isDeleted');
    const hasStatus = await hasColumn('clientss', 'status');
    const hasManager = await hasColumn('clientss', 'manager_id');
    const hasCreatedAt = await hasColumn('clientss', 'created_at');

    if (!includeDeleted && hasIsDeletedList) { where.push('isDeleted != 1'); }
    if (status && hasStatus) { where.push('status = ?'); params.push(status); }
    if (search) { where.push('(name LIKE ? OR company LIKE ? OR ref LIKE ?)'); params.push('%' + search + '%', '%'+search+'%', '%'+search+'%'); }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const countSql = `SELECT COUNT(*) as c FROM clientss ${whereSql}`;
    const total = (await q(countSql, params))[0].c || 0;
    const offset = (page - 1) * perPage;

    const selectCols = ['clientss.id','clientss.ref','clientss.name','clientss.company'];
    if (hasStatus) selectCols.push('clientss.status');
    if (hasManager) {
      selectCols.push('clientss.manager_id');
      // use scalar subqueries to fetch manager public_id and name to avoid duplicate rows
      selectCols.push('(SELECT public_id FROM users WHERE _id = clientss.manager_id OR public_id = clientss.manager_id LIMIT 1) AS manager_public_id');
      selectCols.push('(SELECT name FROM users WHERE _id = clientss.manager_id OR public_id = clientss.manager_id LIMIT 1) AS manager_name');
    }
    if (hasCreatedAt) selectCols.push('clientss.created_at');

    // If client_contacts table exists, left join the primary contact to surface email/phone
    let joinClause = '';
    const hasClientContacts = await tableExists('client_contacts');
    const hasEmailCol = await hasColumn('clientss', 'email');
    const hasPhoneCol = await hasColumn('clientss', 'phone');
    if (hasClientContacts) {
      joinClause = ' LEFT JOIN (SELECT client_id, email, phone FROM client_contacts WHERE is_primary = 1) pc ON pc.client_id = clientss.id ';
      if (!hasEmailCol) selectCols.push('pc.email AS email');
      else selectCols.push('clientss.email');
      if (!hasPhoneCol) selectCols.push('pc.phone AS phone');
      else selectCols.push('clientss.phone');
    } else {
      if (hasEmailCol) selectCols.push('clientss.email');
      if (hasPhoneCol) selectCols.push('clientss.phone');
    }

    // No extra join for manager — scalar subqueries are used above to fetch manager info

    const listSql = `SELECT ${selectCols.join(', ')} FROM clientss ${joinClause} ${whereSql} ${hasCreatedAt ? 'ORDER BY clientss.created_at DESC' : 'ORDER BY clientss.id DESC'} LIMIT ? OFFSET ?`;
    const rows = await q(listSql, params.concat([perPage, offset]));

    // Attach documents and ensure manager name/public_id are present per row
    const enhancedRows = await Promise.all(rows.map(async (r) => {
      try {
        const docs = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [r.id]).catch(() => []);
        r.documents = Array.isArray(docs) ? docs : [];
      } catch (e) {
        r.documents = [];
      }

      // If manager_name not present but manager_id exists, try to resolve
      if ((!r.manager_name || r.manager_name === null) && r.manager_id) {
        try {
          const mgr = await q('SELECT public_id, name FROM users WHERE _id = ? OR public_id = ? LIMIT 1', [r.manager_id, String(r.manager_id)]).catch(() => []);
          if (Array.isArray(mgr) && mgr.length > 0) {
            r.manager_public_id = mgr[0].public_id || r.manager_public_id || null;
            r.manager_name = mgr[0].name || r.manager_name || null;
          }
        } catch (e) {
          // ignore
        }
      }

      return r;
    }));

    return res.json({ success: true, data: enhancedRows, meta: { total, page, perPage } });
  } catch (e) { logger.error('Error listing clients: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
  try {
    const id = req.params.id;
    // If client-viewer, ensure mapping matches requested client
    if (req.user && req.user.role === 'Client-Viewer') {
      if (!req.viewerClientId) return res.status(403).json({ success: false, error: 'Viewer not mapped to a client' });
      if (String(req.viewerClientId) !== String(id)) return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const clientRow = (await q('SELECT * FROM clientss WHERE id = ? LIMIT 1', [id]));
    if (!clientRow || clientRow.length === 0) return res.status(404).json({ success: false, error: 'Client not found' });
    const client = clientRow[0];

    // normalize createdAt/created_at
    if ((!client.createdAt || client.createdAt === null) && client.created_at) client.createdAt = client.created_at;
    let contacts = await q('SELECT id, name, email, phone, designation, is_primary FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, id ASC', [id]).catch(() => []);
    // If there are no contacts in DB but client row has email/phone, surface them as a synthetic primary contact
    if ((!contacts || contacts.length === 0) && (client.email || client.phone)) {
      contacts = [{ id: null, name: null, email: client.email || null, phone: client.phone || null, designation: null, is_primary: 1 }];
    }

    // Resolve manager internal id, public id and name robustly. Accept numeric _id or public_id strings.
    try {
      // Normalize zero to null
      if (client.manager_id === 0) client.manager_id = null;

      // If manager_id present, try to resolve by internal id first, then by public_id
      if (client.manager_id) {
        let mgr = await q('SELECT _id, public_id, name FROM users WHERE _id = ? LIMIT 1', [client.manager_id]).catch(() => []);
        if (!mgr || mgr.length === 0) {
          mgr = await q('SELECT _id, public_id, name FROM users WHERE public_id = ? LIMIT 1', [String(client.manager_id)]).catch(() => []);
        }
        if (Array.isArray(mgr) && mgr.length > 0) {
          client.manager_id = mgr[0]._id;
          client.manager_public_id = mgr[0].public_id || null;
          client.manager_name = mgr[0].name || null;
        } else {
          client.manager_public_id = client.manager_public_id || null;
          client.manager_name = client.manager_name || null;
        }
      } else if (client.manager_public_id) {
        // If only public id is present, resolve to internal id
        const mgr = await q('SELECT _id, public_id, name FROM users WHERE public_id = ? LIMIT 1', [client.manager_public_id]).catch(() => []);
        if (Array.isArray(mgr) && mgr.length > 0) {
          client.manager_id = mgr[0]._id;
          client.manager_public_id = mgr[0].public_id || null;
          client.manager_name = mgr[0].name || null;
        } else {
          client.manager_id = null;
          client.manager_public_id = client.manager_public_id || null;
          client.manager_name = client.manager_name || null;
        }
      } else {
        client.manager_id = null;
        client.manager_public_id = client.manager_public_id || null;
        client.manager_name = client.manager_name || null;
      }
    } catch (e) {
      client.manager_id = client.manager_id || null;
      client.manager_public_id = client.manager_public_id || null;
      client.manager_name = client.manager_name || null;
    }
    const documents = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [id]).catch(() => []);
    const activities = await q('SELECT id, actor_id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [id]).catch(() => []);
    let projectCount = 0, taskCount = 0, completedTasks = 0, pendingTasks = 0, billableHours = null, assignedManager = null;
    try {
      const pc = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]); projectCount = pc[0] ? pc[0].c : 0;
      const tc = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]); taskCount = tc[0] ? tc[0].c : 0;
      const comp = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]); completedTasks = comp[0] ? comp[0].c : 0;
      const pend = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]); pendingTasks = pend[0] ? pend[0].c : 0;
      // resolve manager public id and name if manager_id present
      if (client.manager_id) {
        try {
          const mgr = await q('SELECT public_id, name FROM users WHERE _id = ? OR public_id = ? LIMIT 1', [client.manager_id, String(client.manager_id)]);
          if (Array.isArray(mgr) && mgr.length > 0) assignedManager = { public_id: mgr[0].public_id, name: mgr[0].name };
          else assignedManager = null;
        } catch (me) {
          assignedManager = null;
        }
      }
    } catch (e) { logger.debug('Skipping some dashboard metrics: ' + e.message); }
    return res.json({ success: true, data: { client, contacts, documents, activities, dashboard: { projectCount, taskCount, completedTasks, pendingTasks, billableHours, assignedManager } } });
  } catch (e) { logger.error('Error fetching client details: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.put('/:id', requireRole(['Admin','Manager']), async (req, res) => {
  try { const id = req.params.id; const payload = req.body || {}; delete payload.id; delete payload.ref; const allowed = ['name','company','billing_address','office_address','gst_number','tax_id','industry','notes','status','manager_id']; const setCols = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { setCols.push(`${k} = ?`); params.push(payload[k]); } if (setCols.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' }); params.push(id); await q(`UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`, params); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'update', JSON.stringify(payload)]).catch(()=>{}); return res.json({ success: true, message: 'Client updated' }); } catch (e) { logger.error('Error updating client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }

});

router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try { const id = req.params.id; await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'soft-delete', 'soft deleted']).catch(()=>{}); return res.json({ success: true, message: 'Client soft-deleted' }); } catch (e) { logger.error('Error soft deleting client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/restore', requireRole('Admin'), async (req, res) => {
  try { const id = req.params.id; await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'restore', 'restored']).catch(()=>{}); return res.json({ success: true, message: 'Client restored' }); } catch (e) { logger.error('Error restoring client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/permanent', requireRole('Admin'), async (req, res) => {
  try { const id = req.params.id; await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{}); await q('DELETE FROM clientss WHERE id = ?', [id]); return res.json({ success: true, message: 'Client permanently deleted' }); } catch (e) { logger.error('Error permanently deleting client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => { try { const id = req.params.id; const { managerId } = req.body; if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' }); await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [managerId, id]); await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'assign-manager', JSON.stringify({ managerId })]).catch(()=>{}); return res.json({ success: true, message: 'Manager assigned' }); } catch (e) { logger.error('Error assigning manager: ' + e.message); return res.status(500).json({ success: false, error: e.message }); } });

// Create a client-viewer account and map it to this client
router.post('/:id/create-viewer', requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email required' });
    // create user and mapping
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
    const publicId = crypto.randomBytes(8).toString('hex');
    const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())';
    const userRes = await q(insertUserSql, [publicId, name || `Viewer for ${id}`, email, hashed, 'Client-Viewer', 1]);
    const newUserId = userRes && userRes.insertId ? userRes.insertId : null;
    if (newUserId) {
      try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [id, newUserId]); } catch (e) { logger.debug('Failed creating client_viewers mapping: ' + e.message); }
    }
    try { emailService.sendCredentials(email, name || `Client Viewer`, publicId, tempPassword); } catch (e) { logger.warn('Failed sending client viewer credentials: ' + e.message); }
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'create-viewer', JSON.stringify({ userId: newUserId, publicId })]).catch(()=>{});
    return res.status(201).json({ success: true, data: { publicId, userId: newUserId } });
  } catch (e) {
    logger.error('Error creating client viewer: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Get viewer info (including modules) for a specific mapped viewer
router.get('/:id/viewers/:userId', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.params.userId;
    // ensure mapping exists
    const mapping = await q('SELECT * FROM client_viewers WHERE client_id = ? AND user_id = ? LIMIT 1', [clientId, userId]).catch(() => []);
    if (!mapping || mapping.length === 0) return res.status(404).json({ success: false, error: 'Viewer not found for this client' });
    const users = await q('SELECT _id, public_id, name, email, role, modules FROM users WHERE _id = ? LIMIT 1', [userId]);
    if (!users || users.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    const u = users[0];
    let modules = null;
    try { modules = u.modules ? (typeof u.modules === 'string' ? JSON.parse(u.modules) : u.modules) : null; } catch (e) { modules = null; }
    return res.json({ success: true, data: { id: u._id, publicId: u.public_id, name: u.name, email: u.email, role: u.role, modules } });
  } catch (e) { logger.error('Error fetching viewer info: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

// Update modules/permissions for a mapped viewer (Admin/Manager)
router.put('/:id/viewers/:userId/modules', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.params.userId;
    const modules = req.body.modules;
    if (!Array.isArray(modules)) return res.status(400).json({ success: false, error: 'modules array required' });
    // ensure mapping exists
    const mapping = await q('SELECT * FROM client_viewers WHERE client_id = ? AND user_id = ? LIMIT 1', [clientId, userId]).catch(() => []);
    if (!mapping || mapping.length === 0) return res.status(404).json({ success: false, error: 'Viewer not found for this client' });
    // stringify modules and persist to users table
    const modulesStr = JSON.stringify(modules);
    await q('UPDATE users SET modules = ? WHERE _id = ?', [modulesStr, userId]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [clientId, req.user && req.user._id ? req.user._id : null, 'update-viewer-modules', JSON.stringify({ userId, modules })]).catch(()=>{});
    return res.json({ success: true, message: 'Viewer modules updated', data: { userId, modules } });
  } catch (e) { logger.error('Error updating viewer modules: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/contacts', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const { name, email, phone, designation, is_primary } = req.body; if (!name) return res.status(400).json({ success: false, error: 'name required' }); if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]); return res.status(201).json({ success: true, data: { id: r.insertId } }); } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.put('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; const payload = req.body || {}; if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const allowed = ['name','email','phone','designation','is_primary']; const sets = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); } if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' }); params.push(contactId); await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params); return res.json({ success: true, message: 'Contact updated' }); } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.delete('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const contactId = req.params.contactId; await q('DELETE FROM client_contacts WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Contact deleted' }); } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.post('/:id/contacts/:contactId/set-primary', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Primary contact set' }); } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });

router.post('/:id/documents', requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id;
    // Support both single document (file_url+file_name) or an array `documents: [{file_url, file_name, file_type, uploaded_by}, ...]`
    const docs = Array.isArray(req.body.documents) ? req.body.documents : (req.body.file_name ? [req.body] : []);
    if (!docs || docs.length === 0) return res.status(400).json({ success: false, error: 'file_name (or file_url + file_name) required' });

    const inserted = [];
    for (const d of docs) {
      if (!d) continue;
      const fileName = d.file_name || d.fileName || null;
      if (!fileName) continue;
      const fileUrl = d.file_url || d.fileUrl || (`${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`);
      try {
        const fileType = d.file_type || d.fileType || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, fileUrl, fileName, fileType, d.uploaded_by || d.uploadedBy || (req.user && req.user._id ? req.user._id : null)]);
        const docRec = { id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType };
        inserted.push(docRec);
        // log activity per document
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify(docRec)]).catch(()=>{});
      } catch (e) {
        logger.debug('Failed inserting document for client ' + id + ': ' + (e && e.message));
      }
    }

    if (inserted.length === 0) return res.status(400).json({ success: false, error: 'No valid documents provided' });
    return res.status(201).json({ success: true, data: inserted });
  } catch (e) {
    logger.error('Error attaching document(s): '+e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Multipart file upload endpoint: accept files as form-data `files[]`
router.post('/:id/upload', requireRole(['Admin','Manager']), upload.array('files', 20), async (req, res) => {
  try {
    const id = req.params.id;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const inserted = [];
    for (const f of req.files) {
      try {
        const fileName = f.originalname || f.filename;
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(f.filename)}`;
        const fileType = f.mimetype || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, fileUrl, fileName, fileType, req.user && req.user._id ? req.user._id : null]);
        const docRec = { id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType };
        inserted.push(docRec);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify(docRec)]).catch(()=>{});
      } catch (e) {
        logger.debug('Failed inserting uploaded file for client ' + id + ': ' + (e && e.message));
      }
    }
    if (inserted.length === 0) return res.status(500).json({ success: false, error: 'Failed to save uploaded files' });
    return res.status(201).json({ success: true, data: inserted });
  } catch (e) {
    logger.error('Error in file upload: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

