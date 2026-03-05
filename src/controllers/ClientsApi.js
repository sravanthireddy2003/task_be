const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const errorResponse = require(__root + 'utils/errorResponse');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
const NotificationService = require('../services/notificationService');
let env;
try { env = require(__root + 'config/env'); } catch (e) { env = require('../config/env'); }

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
    let targetName = filename;
    const targetPath = () => path.join(uploadsDir, targetName);
    if (fs.existsSync(targetPath())) {
      const ts = Date.now();
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      targetName = `${base}_${ts}${ext}`;
    }
    const matched = base64data.match(/^data:(.*);base64,(.*)$/);
    const b64 = matched ? matched[2] : base64data;
    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(targetPath(), buffer);
    return `${env.BASE_URL || env.FRONTEND_URL}/uploads/${encodeURIComponent(targetName)}`;
  } catch (e) {
    logger.debug('Failed to save base64 file: ' + (e && e.message));
    return null;
  }
}
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');

const emailService = require(__root + 'utils/emailService');
require('dotenv').config();

router.use(requireAuth);
const clientViewer = require(__root + 'middleware/clientViewer');

router.use(clientViewer);

function guessMimeType(filename) {
  if (!filename) return null;

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

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') return value === 0;
  const str = String(value).trim();
  return str === '' || str === '0';
}

async function resolveUserId(value) {
  if (isEmptyValue(value)) return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const rows = await q('SELECT _id FROM users WHERE _id = ? LIMIT 1', [Number(raw)]).catch(() => []);
    return Array.isArray(rows) && rows.length ? rows[0]._id : null;
  }
  const rows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [raw]).catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0]._id : null;
}

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

router.post('/', upload.array('documents', 10), ruleEngine(RULES.CLIENT_CREATE), requireRole('Admin'), async (req, res) => {
  try {
    await ensureClientTables();
    const {
      name, company, billingAddress, officeAddress, gstNumber, taxId, industry,
      notes, status = 'Active', managerId, manager_id: managerIdSnake, managerPublicId, manager_public_id, contacts = [], enableClientPortal = false,
      createViewer = false, email, phone, district, pincode, state, documents = []
    } = req.body;

    const inputs = [managerId, managerIdSnake, managerPublicId, manager_public_id];
    const managerInput = inputs.find(v => !isEmptyValue(v)) || null;
    let resolvedManagerId = null;
    if (!isEmptyValue(managerInput)) {
      resolvedManagerId = await resolveUserId(managerInput);
      if (resolvedManagerId === null) {
        return res.status(404).json(errorResponse.notFound('Manager not found', 'NOT_FOUND'));
      }
    }

    if (!name || !company) {
      return res.status(400).json(errorResponse.badRequest('name and company required', 'BAD_REQUEST'));
    }

    const hasIsDeleted = await hasColumn('clientss', 'isDeleted');
    const dupSql = hasIsDeleted
      ? 'SELECT id FROM clientss WHERE name = ? AND isDeleted != 1 LIMIT 1'
      : 'SELECT id FROM clientss WHERE name = ? LIMIT 1';
    const dup = await q(dupSql, [name]);
    if (Array.isArray(dup) && dup.length > 0) {
      return res.status(409).json(errorResponse.conflict('Client with that name already exists', 'CONFLICT'));
    }

    const compInit = (company || '').substring(0, 3).toUpperCase() || name.substring(0, 3).toUpperCase();
    const last = await q('SELECT ref FROM clientss WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', [`${compInit}%`]);
    let seq = '0001';
    if (Array.isArray(last) && last.length > 0) {
      const lastn = parseInt(last[0].ref.slice(-4) || '0', 10) || 0;
      seq = (lastn + 1).toString().padStart(4, '0');
    }
    const ref = `${compInit}${seq}`;

    const fullInsertSql = `
      INSERT INTO clientss (ref, name, company, billing_address, office_address, gst_number,
      tax_id, industry, notes, status, manager_id, email, phone, created_at, isDeleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)
    `;
    const fullParams = [
      ref, name, company, billingAddress || null, officeAddress || null,
      gstNumber || null, taxId || null, industry || null, notes || null,
      status, resolvedManagerId, email || null, phone || null
    ];

    let clientId;
    try {
      const result = await q(fullInsertSql, fullParams);
      clientId = result.insertId;
    } catch (e) {
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        const fallback = await q('INSERT INTO clientss (ref, name, company) VALUES (?, ?, ?)', [ref, name, company]);
        clientId = fallback.insertId;
        logger.debug('Full client insert failed; used minimal fallback insert.');
        try {
          await q(`
            UPDATE clientss SET billing_address = ?, office_address = ?, gst_number = ?,
            tax_id = ?, industry = ?, notes = ?, manager_id = ?, email = ?, phone = ?
            WHERE id = ?
          `, [billingAddress || null, officeAddress || null, gstNumber || null, taxId || null,
          industry || null, notes || null, resolvedManagerId, email || null, phone || null, clientId]);
        } catch (u) { }
      } else {
        throw e;
      }
    }

    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const c of contacts) {
        await q(`
          INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]);
      }
    }

    if (Array.isArray(contacts) && contacts.length > 0) {
      const bcrypt = require('bcryptjs');
      for (const c of contacts) {
        try {
          if (!c || !c.email) continue;
          const emailAddr = String(c.email).trim();

          const exists = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [emailAddr]).catch(() => []);
          if (Array.isArray(exists) && exists.length > 0) {
            const existingId = exists[0]._id;

            try { await q('INSERT IGNORE INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, existingId]); } catch (e) { }
            continue;
          }

          const tempPassword = crypto.randomBytes(6).toString('hex');
          const hashed = await bcrypt.hash(tempPassword, 10);
          const publicId = crypto.randomBytes(8).toString('hex');
          const displayName = c.name || `${company} Contact`;

          const insertSql = `INSERT INTO users (public_id, name, email, password, role, title, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
          const r = await q(insertSql, [publicId, displayName, emailAddr, hashed, 'Client-Viewer', 'Client Viewer', 1]);
          const newUserId = r && r.insertId ? r.insertId : null;
          if (newUserId) {
            try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]); } catch (e) { }

            try {
              if (await hasColumn('clientss', 'user_id')) {

                if (c.is_primary) {
                  await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, clientId]).catch(() => { });
                } else {
                  await q('UPDATE clientss SET user_id = COALESCE(user_id, ?) WHERE id = ?', [newUserId, clientId]).catch(() => { });
                }
              }
            } catch (e) {
              logger.debug('Failed updating clientss.user_id: ' + (e && e.message));
            }

            try {
              const setupLink = `${env.FRONTEND_URL || env.BASE_URL}/auth/setup?uid=${publicId}`;
              const tpl = emailService.welcomeTemplate({ name: displayName, email: emailAddr, role: 'Client-Viewer', title: 'Client Portal Access', tempPassword, createdBy: 'System Admin', createdAt: new Date(), setupLink });
              await emailService.sendEmail({ to: emailAddr, subject: tpl.subject, text: tpl.text, html: tpl.html });
            } catch (e) {
              logger.warn('Failed sending credentials to contact ' + emailAddr + ': ' + (e && e.message));
            }
          }
        } catch (e) {
          logger.debug('Failed creating user for contact: ' + (e && e.message));
        }
      }
    }

    try {
      const optionalCols = [];
      const optionalParams = [];
      if (district && await hasColumn('clientss', 'district')) {
        optionalCols.push('district = ?'); optionalParams.push(district);
      }
      if (pincode && await hasColumn('clientss', 'pincode')) {
        optionalCols.push('pincode = ?'); optionalParams.push(pincode);
      }
      if (state && await hasColumn('clientss', 'state')) {
        optionalCols.push('state = ?'); optionalParams.push(state);
      }
      if (optionalCols.length > 0) {
        optionalParams.push(clientId);
        await q(`UPDATE clientss SET ${optionalCols.join(', ')} WHERE id = ?`, optionalParams);
      }
    } catch (e) {
      logger.debug('Optional client fields update skipped: ' + e.message);
    }

    const attachedDocuments = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        try {

          const storedPath = '/uploads/' + encodeURIComponent(file.filename);
          const fileType = mime.lookup(file.originalname) || file.mimetype || null;
          const r = await q(`
            INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active)
            VALUES (?, ?, ?, ?, ?, NOW(), 1)
          `, [clientId, storedPath, file.originalname, fileType, req.user._id]);
          attachedDocuments.push({ id: r.insertId, file_url: storedPath, file_name: file.originalname, file_type: fileType });
        } catch (e) {
          logger.debug('Failed to attach document for client ' + clientId + ': ' + (e && e.message));
        }
      }
    }

    if (Array.isArray(documents) && documents.length > 0) {
      for (const d of documents) {
        if (!d) continue;
        const fileName = d.file_name || d.fileName || null;
        if (!fileName) continue;
        const fileUrlCandidate = d.file_url || d.fileUrl || null;

        let storedPath = null;

        try {

          if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && fileUrlCandidate.startsWith('/uploads/')) {
            storedPath = fileUrlCandidate;
          }

          else if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && fileUrlCandidate.startsWith('data:')) {

            const safeName = fileName.replace(/[^a-zA-Z0-9._()-]/g, '_');
            const savedUrl = saveBase64ToUploads(fileUrlCandidate, safeName);
            if (savedUrl) {
              const parsed = savedUrl.replace(/^(?:https?:\/\/[^\/]+)?/, '');
              storedPath = parsed.startsWith('/') ? parsed : '/' + parsed;
            }
          }

          else if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && (fileUrlCandidate.startsWith('blob:') || /^https?:\/\//i.test(fileUrlCandidate))) {
            logger.debug('Skipping external/blob document reference for client ' + clientId + ': ' + String(fileUrlCandidate).slice(0, 200));
            storedPath = null;
          }

          else {
            const uploadsDir = path.join(__dirname, '..', 'uploads');
            const candidate = path.join(uploadsDir, fileName);
            if (fs.existsSync(candidate)) storedPath = '/uploads/' + encodeURIComponent(fileName);
          }

          if (!storedPath) continue; // nothing saved for this entry; skip inserting a DB row

          const fileType = d.file_type || d.fileType || mime.lookup(fileName) || null;
          const r = await q(`
            INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active)
            VALUES (?, ?, ?, ?, ?, NOW(), 1)
          `, [clientId, storedPath, fileName, fileType, d.uploaded_by || d.uploadedBy || req.user._id]);
          attachedDocuments.push({ id: r.insertId, file_url: storedPath, file_name: fileName, file_type: fileType });
        } catch (e) {
          logger.debug('Failed to attach document for client ' + clientId + ': ' + (e && e.message));
        }
      }
    }

    let primaryContactEmail = null;
    let primaryContactName = null;
    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const c of contacts) {
        if (c && c.is_primary && c.email) {
          primaryContactEmail = c.email;
          primaryContactName = c.name || null;
          break;
        }
      }
    }
    if (!primaryContactEmail && email) primaryContactEmail = email;

    let viewerInfo = null;

    if ((createViewer || enableClientPortal) && (primaryContactEmail || email)) {
      const userEmail = primaryContactEmail || email;
      logger.info('Creating user for client', clientId, 'email:', userEmail);

      const tempPassword = crypto.randomBytes(6).toString('hex');
      const publicId = crypto.randomBytes(8).toString('hex');

      try {
        const bcrypt = require('bcryptjs');
        const hashed = await new Promise((resolve, reject) => {
          bcrypt.hash(tempPassword, 10, (err, hash) => (err ? reject(err) : resolve(hash)));
        });

        const roleToInsert = enableClientPortal ? 'Client-Viewer' : 'Client-Viewer';
        const displayName = enableClientPortal ? (primaryContactName || name) : `${name} (Viewer)`;

        const insertUserSql = `
      INSERT INTO users (public_id, name, email, password, role, title, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
        const userRes = await q(insertUserSql, [publicId, displayName, userEmail, hashed, roleToInsert, 'Client Viewer', 1]);
        const newUserId = userRes.insertId;

        try {
          await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]);
        } catch (e) {

        }

        try {
          if (await hasColumn('clientss', 'user_id')) {
            await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, clientId]).catch(() => { });
          }
        } catch (e) {
          logger.debug('Failed to set clientss.user_id for portal user: ' + (e && e.message));
        }

        const setupLink = `${env.FRONTEND_URL || env.BASE_URL}/auth/setup?uid=${publicId}`;
        const userTemplate = emailService.welcomeTemplate({
          name: displayName,
          email: userEmail,
          role: roleToInsert,
          title: enableClientPortal ? `Client - ${company}` : 'Client Portal Access',
          tempPassword,
          createdBy: 'System Admin',
          createdAt: new Date(),
          setupLink
        });

        await emailService.sendEmail({ to: userEmail, subject: userTemplate.subject, text: userTemplate.text, html: userTemplate.html });

        viewerInfo = { publicId, userId: newUserId, role: roleToInsert };
        logger.info('✅ Client/user credentials sent:', publicId);
      } catch (e) {
        logger.error('User creation failed:', e && e.message);
      }
    }

    let clientCredentials = null;
    if (primaryContactEmail || email) {
      const clientEmail = primaryContactEmail || email;
      const clientPortalLink = `${env.FRONTEND_URL || env.BASE_URL}/client-portal/${ref}`;

      try {
        const existing = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [clientEmail]).catch(() => []);
        if (!existing || existing.length === 0) {
          const bcrypt = require('bcryptjs');
          const clientTempPassword = crypto.randomBytes(6).toString('hex');
          const hashed = await new Promise((resolve, reject) => bcrypt.hash(clientTempPassword, 10, (err, hash) => (err ? reject(err) : resolve(hash))));
          const publicIdForClient = crypto.randomBytes(8).toString('hex');
          const displayNameForClient = primaryContactName || name || `Client ${ref}`;

          const ins = await q(`INSERT INTO users (public_id, name, email, password, role, title, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, [publicIdForClient, displayNameForClient, clientEmail, hashed, 'Client-Viewer', 'Client Viewer', 1]).catch((e) => { throw e; });
          const newUid = ins && ins.insertId ? ins.insertId : null;
          if (newUid) {

            try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUid]).catch(() => { }); } catch (e) { }
            try { if (await hasColumn('clientss', 'user_id')) await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUid, clientId]).catch(() => { }); } catch (e) { logger.debug('Failed setting clientss.user_id for client email user: ' + (e && e.message)); }
            clientCredentials = { email: clientEmail, tempPassword: clientTempPassword, publicId: publicIdForClient, userId: newUid };
          }
        }
      } catch (e) {
        logger.debug('Failed ensuring client user exists: ' + (e && e.message));
      }

      const clientTempPasswordToUse = clientCredentials ? clientCredentials.tempPassword : null;
      const clientTemplate = emailService.welcomeTemplate({
        name: primaryContactName || name,
        email: clientEmail,
        role: 'Client',
        title: `Client - ${company}`,
        tempPassword: clientTempPasswordToUse,
        createdBy: 'System Admin',
        createdAt: new Date(),
        setupLink: clientPortalLink
      });

      try {
        await emailService.sendEmail({ to: clientEmail, subject: clientTemplate.subject, text: clientTemplate.text, html: clientTemplate.html });
        logger.info('✅ Client welcome sent:', clientEmail);
      } catch (e) {
        logger.warn('Client welcome failed:', e.message);
      }
    }

    await q(`
      INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [clientId, req.user && req.user._id ? req.user._id : null, 'create',
      JSON.stringify({ createdBy: req.user ? req.user.id : null })]);

    try {
      const auditController = require('./auditController');
      auditController.log({
        user_id: req.user._id,
        tenant_id: req.user.tenant_id,
        action: 'CREATE_CLIENT',
        entity: 'Client',
        entity_id: String(clientId),
        details: { name, company, ref, managerId: resolvedManagerId }
      });
    } catch (auditErr) {
      logger.warn('Failed to log create_client audit:', auditErr.message);
    }

    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Client Added', `New client "${name}" has been added`, 'CLIENT_ADDED', 'client', clientId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Client creation notification error:', notifErr);
      }
    })();

    let managerName = null;
    let managerPublicIdStr = null;
    if (resolvedManagerId) {
      try {
        const mgrRows = await q('SELECT name, public_id FROM users WHERE _id = ? LIMIT 1', [resolvedManagerId]);
        if (mgrRows && mgrRows.length) {
          managerName = mgrRows[0].name;
          managerPublicIdStr = mgrRows[0].public_id;
        }
      } catch (e) { }
    }

    return res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: {
        id: clientId,
        ref,
        name,
        company,
        email: primaryContactEmail || email || null,
        phone,
        status,
        manager_id: resolvedManagerId,
        managerId: resolvedManagerId,
        manager_name: managerName,
        manager_public_id: managerPublicIdStr,
        documentsCount: attachedDocuments.length,
        contactsCount: (Array.isArray(contacts) ? contacts.length : 0),
        viewerInfo: viewerInfo || null,
        clientCredentials: clientCredentials ? { email: clientCredentials.email, publicId: clientCredentials.publicId } : null
      }
    });

  } catch (e) {
    logger.error('Error creating client: ' + e.message);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.get('/', ruleEngine(RULES.CLIENT_VIEW), requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10); const perPage = Math.min(parseInt(req.query.perPage || '25', 10), 200);
    const search = req.query.search || null; const status = req.query.status || null; const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
    let where = []; let params = [];

    if (req.user && req.user.role === 'Client-Viewer') {
      if (!req.viewerClientId) return res.status(403).json(errorResponse.forbidden('Viewer not mapped to a client', 'FORBIDDEN'));
      where.push('clientss.id = ?'); params.push(req.viewerClientId);
    }
    const hasIsDeletedList = await hasColumn('clientss', 'isDeleted');
    const hasStatus = await hasColumn('clientss', 'status');
    const hasManager = await hasColumn('clientss', 'manager_id');
    const hasCreatedAt = await hasColumn('clientss', 'created_at');

    if (!includeDeleted && hasIsDeletedList) { where.push('isDeleted != 1'); }
    if (status && hasStatus) { where.push('status = ?'); params.push(status); }
    if (search) { where.push('(name LIKE ? OR company LIKE ? OR ref LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const countSql = `SELECT COUNT(*) as c FROM clientss ${whereSql}`;
    const total = (await q(countSql, params))[0].c || 0;
    const offset = (page - 1) * perPage;

    const selectCols = ['clientss.id', 'clientss.ref', 'clientss.name', 'clientss.company'];
    if (hasStatus) selectCols.push('clientss.status');
    if (hasManager) {
      selectCols.push('clientss.manager_id');

      selectCols.push('(SELECT public_id FROM users WHERE _id = clientss.manager_id OR public_id = clientss.manager_id LIMIT 1) AS manager_public_id');
      selectCols.push('(SELECT name FROM users WHERE _id = clientss.manager_id OR public_id = clientss.manager_id LIMIT 1) AS manager_name');
    }
    if (hasCreatedAt) selectCols.push('clientss.created_at');

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


    const listSql = `SELECT ${selectCols.join(', ')} FROM clientss ${joinClause} ${whereSql} ${hasCreatedAt ? 'ORDER BY clientss.created_at DESC' : 'ORDER BY clientss.id DESC'} LIMIT ? OFFSET ?`;
    const rows = await q(listSql, params.concat([perPage, offset]));

    const enhancedRows = await Promise.all(rows.map(async (r) => {
      try {
        const docs = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [r.id]).catch(() => []);
        r.documents = Array.isArray(docs) ? docs : [];
      } catch (e) {
        r.documents = [];
      }

      if ((!r.manager_name || r.manager_name === null) && r.manager_id) {
        try {
          const mgr = await q('SELECT public_id, name FROM users WHERE _id = ? OR public_id = ? LIMIT 1', [r.manager_id, String(r.manager_id)]).catch(() => []);
          if (Array.isArray(mgr) && mgr.length > 0) {
            r.manager_public_id = mgr[0].public_id || r.manager_public_id || null;
            r.manager_name = mgr[0].name || r.manager_name || null;
          }
        } catch (e) {

        }
      }

      return r;
    }));

    return res.json({ success: true, data: enhancedRows, meta: { total, page, perPage } });
  } catch (e) { logger.error('Error listing clients: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); }
});

router.get('/:id', ruleEngine(RULES.CLIENT_VIEW), requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
  try {
    const id = req.params.id;

    if (req.user && req.user.role === 'Client-Viewer') {
      if (!req.viewerClientId) return res.status(403).json(errorResponse.forbidden('Viewer not mapped to a client', 'FORBIDDEN'));
      if (String(req.viewerClientId) !== String(id)) return res.status(403).json(errorResponse.forbidden('Access denied', 'FORBIDDEN'));
    }
    const clientRow = (await q('SELECT * FROM clientss WHERE id = ? LIMIT 1', [id]));
    if (!clientRow || clientRow.length === 0) return res.status(404).json(errorResponse.notFound('Client not found', 'NOT_FOUND'));
    const client = clientRow[0];

    if ((!client.createdAt || client.createdAt === null) && client.created_at) client.createdAt = client.created_at;
    let contacts = await q('SELECT id, name, email, phone, designation, is_primary FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, id ASC', [id]).catch(() => []);

    if ((!contacts || contacts.length === 0) && (client.email || client.phone)) {
      contacts = [{ id: null, name: null, email: client.email || null, phone: client.phone || null, designation: null, is_primary: 1 }];
    }

    try {

      if (client.manager_id === 0) client.manager_id = null;

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
    let documents = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [id]).catch(() => []);
    try {
      const base = req.protocol + '://' + req.get('host');
      documents = (documents || []).map(d => {
        try {
          if (d && d.file_url && String(d.file_url).startsWith('/uploads/')) {
            const rel = String(d.file_url).replace(/^\/uploads\//, '');
            const parts = rel.split('/').map(p => encodeURIComponent(p));
            return { ...d, file_url: base + '/uploads/' + parts.join('/') };
          }
        } catch (e) { }
        return d;
      });
    } catch (e) { }
    const activities = await q('SELECT id, actor_id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [id]).catch(() => []);

    let projects = [];
    try {
      projects = await q(`
        SELECT 
          p.id,
          p.public_id,
          p.name,
          p.description,
          p.priority,
          p.status,
          p.start_date,
          p.end_date,
          p.budget,
          p.created_at,
          p.updated_at,
          pm.public_id as project_manager_public_id,
          pm.name as project_manager_name
        FROM projects p
        LEFT JOIN users pm ON p.project_manager_id = pm._id
        WHERE p.client_id = ? AND p.is_active = 1
        ORDER BY p.created_at DESC
      `, [id]);

      // If the requester is a Manager (not admin), restrict visible projects to those
      // assigned to this manager. This enforces Manager -> Assigned Projects -> Clients mapping.
      if (req.user && String(req.user.role).toLowerCase() === 'manager') {
        try {
          const mgrProjects = await gatherManagerProjects(req);
          const mgrIds = new Set((mgrProjects || []).map(p => String(p.id)));
          const mgrPublicIds = new Set((mgrProjects || []).map(p => String(p.public_id)));
          projects = (projects || []).filter(p => (p && (p.id && mgrIds.has(String(p.id)) || (p.public_id && mgrPublicIds.has(String(p.public_id))))));
        } catch (e) {
          projects = [];
        }
      }
    } catch (e) {
      logger.debug('Failed to fetch client projects: ' + e.message);
      projects = [];
    }

    let tasks = [];
    try {
      // If projects were filtered for the manager, only include tasks for those projects.
      const projectIds = (projects || []).map(p => p.id).filter(Boolean);
      const projectPublicIds = (projects || []).map(p => p.public_id).filter(Boolean);

      if (req.user && String(req.user.role).toLowerCase() === 'manager' && (!projectIds.length && !projectPublicIds.length)) {
        // Manager has no visible projects for this client -> no tasks
        tasks = [];
      } else {
        const whereClause = (projectIds.length || projectPublicIds.length)
          ? `WHERE (${projectIds.length ? 't.project_id IN (?)' : ''}${projectIds.length && projectPublicIds.length ? ' OR ' : ''}${projectPublicIds.length ? "t.project_public_id IN (?)" : ''})`
          : 'WHERE t.client_id = ?';
        const params = (projectIds.length || projectPublicIds.length)
          ? [].concat(projectIds.length ? [projectIds] : []).concat(projectPublicIds.length ? [projectPublicIds] : [])
          : [id];

        const taskRows = await q(`
          SELECT 
            t.id,
            t.public_id,
            t.title,
            t.description,
            t.stage,
            t.taskDate,
            t.priority,
            t.status,
            t.time_alloted,
            t.estimated_hours,
            t.createdAt,
            t.updatedAt,
            t.project_id,
            t.project_public_id,
            p.name as project_name,
            p.public_id as project_public_id_ref,
            GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
            GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
            GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
          FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          LEFT JOIN taskassignments ta ON ta.task_id = t.id
          LEFT JOIN users u ON u._id = ta.user_id
          ${whereClause}
          GROUP BY t.id
          ORDER BY t.createdAt DESC
        `, params);

        tasks = (taskRows || []).map(r => {
          const assignedIds = r.assigned_user_ids ? String(r.assigned_user_ids).split(',') : [];
          const assignedPublic = r.assigned_user_public_ids ? String(r.assigned_user_public_ids).split(',') : [];
          const assignedNames = r.assigned_user_names ? String(r.assigned_user_names).split(',') : [];

          const assignedUsers = assignedIds.map((uid, i) => ({
            id: assignedPublic[i] || uid,
            internalId: String(uid),
            name: assignedNames[i] || null
          }));

          return {
            id: r.id,
            public_id: r.public_id,
            title: r.title,
            description: r.description,
            stage: r.stage,
            taskDate: r.taskDate,
            priority: r.priority,
            status: r.status,
            time_alloted: r.time_alloted,
            estimated_hours: r.estimated_hours,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            project_id: r.project_id,
            project_public_id: r.project_public_id || r.project_public_id_ref,
            project_name: r.project_name,
            assigned_users: assignedUsers,
            subtasks: []
          };
        });

        // fetch subtasks for the returned tasks and attach
        const taskIds = tasks.map(t => t.id).filter(Boolean);
        if (taskIds.length) {
          try {
            const subs = await q(`SELECT id, COALESCE(task_id, task_Id) AS task_id, COALESCE(project_id, project_Id) AS project_id, title, description, due_date, tag, status, estimated_hours, completed_at, created_at, updated_at, created_by FROM subtasks WHERE COALESCE(task_id, task_Id) IN (?)`, [taskIds]);
            const subMap = {};
            (subs || []).forEach(s => {
              if (!s || s.task_id === undefined || s.task_id === null) return;
              const key = String(s.task_id);
              // ensure subtask belongs to same project as its parent task
              const parentTask = tasks.find(t => String(t.id) === key);
              if (!parentTask) return;
              const subProjectId = s.project_id != null ? String(s.project_id) : null;
              if (subProjectId && String(parentTask.project_id) !== subProjectId) return;
              subMap[key] = subMap[key] || [];
              subMap[key].push({
                id: s.id,
                title: s.title || null,
                description: s.description || null,
                due_date: s.due_date || null,
                tag: s.tag || null,
                status: s.status || null,
                estimated_hours: s.estimated_hours != null ? Number(s.estimated_hours) : null,
                completed_at: s.completed_at || null,
                created_at: s.created_at || null,
                updated_at: s.updated_at || null,
                created_by: s.created_by || null
              });
            });
            tasks.forEach(t => { const key = String(t.id); if (subMap[key]) t.subtasks = subMap[key]; });
          } catch (e) {
            // ignore subtasks fetch errors
          }
        }
      }
    } catch (e) {
      logger.debug('Failed to fetch client tasks: ' + e.message);
      tasks = [];
    }

    // attach tasks to their respective projects so the client response nests tasks under each project
    try {
      const taskMap = {};
      (tasks || []).forEach(t => {
        const key = String(t.project_id || '');
        taskMap[key] = taskMap[key] || [];
        taskMap[key].push(t);
      });
      projects = (projects || []).map(p => ({ ...p, tasks: taskMap[String(p.id)] || [] }));
    } catch (e) {
      logger.debug('Failed to attach tasks to projects: ' + (e && e.message));
    }

    let projectCount = 0, taskCount = 0, completedTasks = 0, pendingTasks = 0, billableHours = null, assignedManager = null;
    try {
      const pc = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]); projectCount = pc[0] ? pc[0].c : 0;
      const tc = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]); taskCount = tc[0] ? tc[0].c : 0;
      const comp = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]); completedTasks = comp[0] ? comp[0].c : 0;
      const pend = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]); pendingTasks = pend[0] ? pend[0].c : 0;
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
    return res.json({ success: true, data: { client, contacts, documents, activities, projects, dashboard: { projectCount, taskCount, completedTasks, pendingTasks, billableHours, assignedManager } } });
  } catch (e) { logger.error('Error fetching client details: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); }
});

router.put(
  '/:id',
  ruleEngine(RULES.CLIENT_UPDATE),
  requireRole(['Admin', 'Manager']),
  async (req, res) => {
    try {
      const id = req.params.id;


      const existing = await q(
        `SELECT 
          id, name, company, billing_address, office_address,
          gst_number, tax_id, industry, notes, status,
          manager_id, email, phone, district, state, pincode
         FROM clientss
         WHERE id = ?
         LIMIT 1`,
        [id]
      );

      if (!existing || existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      const before = existing[0];


      let payload = req.body || {};
      delete payload.id;
      delete payload.ref;

      // Smart manager resolution: check all possible keys and pick the first non-empty one
      const managerInputs = [payload.managerId, payload.manager_id, payload.managerPublicId, payload.manager_public_id];
      const hasManagerInput = managerInputs.some(v => v !== undefined);

      if (hasManagerInput) {
        // If we have any manager input, find the best value or default to null (clear manager)
        const validManager = managerInputs.find(v => !isEmptyValue(v));
        payload.manager_id = validManager || null;
      }

      if (payload.taxId !== undefined) payload.tax_id = payload.taxId;
      if (payload.billingAddress !== undefined) payload.billing_address = payload.billingAddress;
      if (payload.officeAddress !== undefined) payload.office_address = payload.officeAddress;
      if (payload.gstNumber !== undefined) payload.gst_number = payload.gstNumber;

      if (payload.address !== undefined && !payload.billing_address) {
        payload.billing_address = payload.address;
      }

      delete payload.managerId;
      delete payload.taxId;
      delete payload.billingAddress;
      delete payload.officeAddress;
      delete payload.gstNumber;
      delete payload.address;
      delete payload.managerPublicId;
      delete payload.manager_public_id;


      if (payload.manager_id !== undefined) {
        if (payload.manager_id) {
          const resolved = await resolveUserId(payload.manager_id);
          if (!resolved) {
            return res.status(404).json({
              success: false,
              message: 'Manager not found'
            });
          }
          payload.manager_id = resolved;
        } else {
          payload.manager_id = null;
        }
      }


      const allowed = [
        'name', 'company', 'billing_address', 'office_address',
        'gst_number', 'tax_id', 'industry', 'notes', 'status',
        'manager_id', 'email', 'phone', 'district', 'state', 'pincode'
      ];

      const setCols = [];
      const params = [];

      for (const key of allowed) {
        if (payload[key] !== undefined && String(payload[key]) !== String(before[key])) {
          setCols.push(`${key} = ?`);
          params.push(payload[key]);
        }
      }


      if (setCols.length === 0) {
        return res.json({
          success: true,
          message: 'No changes detected',
          data: before
        });
      }


      params.push(id);
      await q(
        `UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`,
        params
      );


      const updated = await q(
        `SELECT 
          id, name, company, billing_address, office_address,
          gst_number, tax_id, industry, notes, status,
          manager_id, email, phone, district, state, pincode,
          (SELECT public_id FROM users WHERE _id = clientss.manager_id LIMIT 1) as manager_public_id,
          (SELECT name FROM users WHERE _id = clientss.manager_id LIMIT 1) as manager_name
         FROM clientss
         WHERE id = ?
         LIMIT 1`,
        [id]
      );


      q(
        `INSERT INTO client_activity_logs 
         (client_id, actor_id, action, details, created_at)
         VALUES (?, ?, 'update', ?, NOW())`,
        [
          id,
          req.user?._id || null,
          JSON.stringify(payload)
        ]
      ).catch(() => { });


      NotificationService.createAndSendToRoles(
        ['Admin'],
        'Client Updated',
        `Client "${updated[0].name}" was updated`,
        'CLIENT_UPDATED',
        'client',
        id,
        req.user?.tenant_id
      ).catch(() => { });

      try {
        const auditController = require('./auditController');
        auditController.log({
          user_id: req.user._id,
          tenant_id: req.user.tenant_id,
          action: 'UPDATE_CLIENT',
          entity: 'Client',
          entity_id: String(id),
          details: { name: updated[0].name, updates: payload }
        });
      } catch (auditErr) {
        logger.warn('Failed to log update_client audit:', auditErr.message);
      }


      return res.json({
        success: true,
        message: 'Client updated successfully',
        data: updated[0]
      });

    } catch (err) {
      logger.error('Client update error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to update client'
      });
    }
  }
);


async function permanentlyDeleteClientById(id) {
  const viewerRows = await q('SELECT user_id FROM client_viewers WHERE client_id = ?', [id]).catch(() => []);
  const candidateIds = new Set();
  (viewerRows || []).forEach(row => { if (row && row.user_id) candidateIds.add(Number(row.user_id)); });
  const clientUserRows = await q('SELECT user_id FROM clientss WHERE id = ? LIMIT 1', [id]).catch(() => []);
  if (Array.isArray(clientUserRows) && clientUserRows.length && clientUserRows[0].user_id) {
    candidateIds.add(Number(clientUserRows[0].user_id));
  }
  const resolvedIds = Array.from(candidateIds).filter(v => Number.isFinite(v) && v > 0);
  if (resolvedIds.length) {
    const matchingUsers = await q('SELECT _id FROM users WHERE _id IN (?) AND role = ?', [resolvedIds, 'Client-Viewer']).catch(() => []);
    const deleteIds = Array.isArray(matchingUsers)
      ? Array.from(new Set(matchingUsers.map(u => Number(u._id)).filter(v => Number.isFinite(v) && v > 0)))
      : [];
    if (deleteIds.length) {
      await q('DELETE FROM client_viewers WHERE user_id IN (?)', [deleteIds]).catch(() => { });
      await q('DELETE FROM users WHERE _id IN (?)', [deleteIds]).catch(() => { });
    }
  }
  await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(() => { });
  await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(() => { });
  await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(() => { });
  await q('DELETE FROM clientss WHERE id = ?', [id]);
  await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => { });
}

router.delete('/:id', ruleEngine(RULES.CLIENT_DELETE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    await permanentlyDeleteClientById(id);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'deleted', 'permanently deleted']).catch(() => { });    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Client Deleted', `Client with ID "${id}" has been deleted`, 'CLIENT_DELETED', 'client', id, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Client delete notification error:', notifErr);
      }
    })(); return res.json({ success: true, message: 'Client permanently deleted' });
  } catch (e) {
    logger.error('Error deleting client: ' + e.message);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.delete('/:id/permanent', ruleEngine(RULES.CLIENT_DELETE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const viewerRows = await q('SELECT user_id FROM client_viewers WHERE client_id = ?', [id]).catch(() => []);
    const candidateIds = new Set();
    (viewerRows || []).forEach(row => { if (row && row.user_id) candidateIds.add(Number(row.user_id)); });
    const clientUserRows = await q('SELECT user_id FROM clientss WHERE id = ? LIMIT 1', [id]).catch(() => []);
    if (Array.isArray(clientUserRows) && clientUserRows.length && clientUserRows[0].user_id) {
      candidateIds.add(Number(clientUserRows[0].user_id));
    }
    const resolvedIds = Array.from(candidateIds).filter(v => Number.isFinite(v) && v > 0);
    if (resolvedIds.length) {
      const matchingUsers = await q('SELECT _id FROM users WHERE _id IN (?) AND role = ?', [resolvedIds, 'Client-Viewer']).catch(() => []);
      const deleteIds = Array.isArray(matchingUsers)
        ? Array.from(new Set(matchingUsers.map(u => Number(u._id)).filter(v => Number.isFinite(v) && v > 0)))
        : [];
      if (deleteIds.length) {
        await q('DELETE FROM client_viewers WHERE user_id IN (?)', [deleteIds]).catch(() => { });
        await q('DELETE FROM users WHERE _id IN (?)', [deleteIds]).catch(() => { });
      }
    }
    await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(() => { });
    await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(() => { });
    await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(() => { });
    await q('DELETE FROM clientss WHERE id = ?', [id]);
    await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => { });
    return res.json({ success: true, message: 'Client permanently deleted' });
  } catch (e) { logger.error('Error permanently deleting client: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); }
});

router.post('/:id/assign-manager', ruleEngine(RULES.CLIENT_UPDATE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { managerId, manager_id: managerIdSnake, managerPublicId } = req.body || {};
    const hasManagerField = Object.prototype.hasOwnProperty.call(req.body || {}, 'managerId')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'manager_id')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'managerPublicId');
    if (!hasManagerField) {
      return res.status(400).json(errorResponse.badRequest('managerId required', 'BAD_REQUEST'));
    }
    const managerInput = managerId ?? managerIdSnake ?? managerPublicId ?? null;
    let finalManagerId = null;
    if (!isEmptyValue(managerInput)) {
      finalManagerId = await resolveUserId(managerInput);
      if (finalManagerId === null) {
        return res.status(404).json(errorResponse.notFound('Manager not found', 'NOT_FOUND'));
      }
    }
    await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [finalManagerId, id]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, req.user && req.user._id ? req.user._id : null, finalManagerId ? 'assign-manager' : 'unassign-manager', JSON.stringify({ managerId: finalManagerId })])
      .catch(() => { });
    return res.json({ success: true, message: finalManagerId ? 'Manager assigned' : 'Manager unassigned' });
  } catch (e) {
    logger.error('Error assigning manager: ' + e.message);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.post('/:id/create-viewer', ruleEngine(RULES.CLIENT_CREATE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { email, name } = req.body;

    if (!email) {
      logger.warn('[CREATE-VIEWER] Missing email');
      return res.status(400).json(errorResponse.badRequest('email required', 'BAD_REQUEST'));
    }

    const tempPassword = crypto.randomBytes(6).toString('hex');

    const hashed = await new Promise((resH, rejH) => {
      require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h));
    });

    const publicId = crypto.randomBytes(8).toString('hex');

    const roleToInsert = 'Client-Viewer';

    const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, title, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())';

    const userRes = await q(insertUserSql, [publicId, name || `Viewer for ${id}`, email, hashed, roleToInsert, 'Client Viewer', 1]);
    const newUserId = userRes && userRes.insertId ? userRes.insertId : null;

    if (newUserId) {
      const verifyRole = await q('SELECT role, public_id FROM users WHERE id = ?', [newUserId]);

      try {
        await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [id, newUserId]);
      } catch (e) {
        logger.error(`[CREATE-VIEWER] Failed client_viewers mapping: ${e.message}`);
      }

      try {
        if (await hasColumn('clientss', 'user_id')) {
          await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, id]);
        }
      } catch (e) {
        logger.error(`[CREATE-VIEWER] Failed clientss update: ${e.message}`);
      }

      if (verifyRole[0]?.role !== 'Client-Viewer') {
        await q('UPDATE users SET role = "Client-Viewer" WHERE id = ?', [newUserId]);
        logger.warn(`[CREATE-VIEWER] FORCE-UPDATED role from "${verifyRole[0]?.role}" to "Client-Viewer"`);
      }
    }

    try {
      await emailService.sendCredentials(email, name || `Client Viewer`, publicId, tempPassword);
    } catch (e) {
      logger.warn(`[CREATE-VIEWER] Email failed: ${e.message}`);
    }

    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, req.user?._id || null, 'create-viewer', JSON.stringify({ userId: newUserId, publicId })])
      .catch(e => logger.error(`[CREATE-VIEWER] Activity log failed: ${e.message}`));

    logger.info(`[CREATE-VIEWER] SUCCESS: ${JSON.stringify({ publicId, userId: newUserId })}`);
    return res.status(201).json({ success: true, data: { publicId, userId: newUserId } });

  } catch (e) {
    logger.error(`[CREATE-VIEWER] FULL ERROR: ${e.stack || e.message}`);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.get('/:id/viewers/:userId', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.params.userId;

    const mapping = await q('SELECT * FROM client_viewers WHERE client_id = ? AND user_id = ? LIMIT 1', [clientId, userId]).catch(() => []);
    if (!mapping || mapping.length === 0) return res.status(404).json(errorResponse.notFound('Viewer not found for this client', 'NOT_FOUND'));
    const users = await q('SELECT _id, public_id, name, email, role, modules FROM users WHERE _id = ? LIMIT 1', [userId]);
    if (!users || users.length === 0) return res.status(404).json(errorResponse.notFound('User not found', 'NOT_FOUND'));
    const u = users[0];
    let modules = null;
    try { modules = u.modules ? (typeof u.modules === 'string' ? JSON.parse(u.modules) : u.modules) : null; } catch (e) { modules = null; }
    return res.json({ success: true, data: { id: u._id, publicId: u.public_id, name: u.name, email: u.email, role: u.role, modules } });
  } catch (e) { logger.error('Error fetching viewer info: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); }
});

router.put('/:id/viewers/:userId/modules', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.params.userId;
    const modules = req.body.modules;
    if (!Array.isArray(modules)) return res.status(400).json(errorResponse.badRequest('modules array required', 'BAD_REQUEST'));

    const mapping = await q('SELECT * FROM client_viewers WHERE client_id = ? AND user_id = ? LIMIT 1', [clientId, userId]).catch(() => []);
    if (!mapping || mapping.length === 0) return res.status(404).json(errorResponse.notFound('Viewer not found for this client', 'NOT_FOUND'));

    const modulesStr = JSON.stringify(modules);
    await q('UPDATE users SET modules = ? WHERE _id = ?', [modulesStr, userId]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [clientId, req.user && req.user._id ? req.user._id : null, 'update-viewer-modules', JSON.stringify({ userId, modules })]).catch(() => { });
    return res.json({ success: true, message: 'Viewer modules updated', data: { userId, modules } });
  } catch (e) { logger.error('Error updating viewer modules: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); }
});

router.post('/:id/contacts', ruleEngine(RULES.CLIENT_CONTACT_ADD), requireRole(['Admin', 'Manager']), async (req, res) => { try { const id = req.params.id; const { name, email, phone, designation, is_primary } = req.body; if (!name) return res.status(400).json(errorResponse.badRequest('name required', 'BAD_REQUEST')); if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]); return res.status(201).json({ success: true, data: { id: r.insertId } }); } catch (e) { logger.error('Error adding contact: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); } });

router.put('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; const payload = req.body || {}; if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const allowed = ['name', 'email', 'phone', 'designation', 'is_primary']; const sets = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); } if (!sets.length) return res.status(400).json(errorResponse.badRequest('No fields', 'BAD_REQUEST')); params.push(contactId); await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params); return res.json({ success: true, message: 'Contact updated' }); } catch (e) { logger.error('Error updating contact: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); } });

router.delete('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => { try { const contactId = req.params.contactId; await q('DELETE FROM client_contacts WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Contact deleted' }); } catch (e) { logger.error('Error deleting contact: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); } });

router.post('/:id/contacts/:contactId/set-primary', ruleEngine(RULES.CLIENT_CONTACT_UPDATE), requireRole(['Admin', 'Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Primary contact set' }); } catch (e) { logger.error('Error setting primary contact: ' + e.message); return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message })); } });

router.post('/:id/documents', ruleEngine(RULES.CLIENT_UPDATE), requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const id = req.params.id;

    const docs = Array.isArray(req.body.documents) ? req.body.documents : (req.body.file_name ? [req.body] : []);
    if (!docs || docs.length === 0) return res.status(400).json(errorResponse.badRequest('file_name (or file_url + file_name) required', 'BAD_REQUEST'));

    const inserted = [];
    for (const d of docs) {
      if (!d) continue;
      const fileName = d.file_name || d.fileName || null;
      if (!fileName) continue;
      const candidate = d.file_url || d.fileUrl || null;
      let storedPath = '/uploads/' + encodeURIComponent(fileName);
      if (candidate && typeof candidate === 'string' && candidate.startsWith('/uploads/')) storedPath = candidate;
      try {
        const fileType = d.file_type || d.fileType || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, storedPath, fileName, fileType, d.uploaded_by || d.uploadedBy || (req.user && req.user._id ? req.user._id : null)]);
        const docRec = { id: r.insertId, file_url: storedPath, file_name: fileName, file_type: fileType };
        inserted.push(docRec);

        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify(docRec)]).catch(() => { });
      } catch (e) {
        logger.debug('Failed inserting document for client ' + id + ': ' + (e && e.message));
      }
    }

    if (inserted.length === 0) return res.status(400).json(errorResponse.badRequest('No valid documents provided', 'BAD_REQUEST'));
    return res.status(201).json({ success: true, data: inserted });
  } catch (e) {
    logger.error('Error attaching document(s): ' + e.message);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.post('/:id/upload', ruleEngine(RULES.UPLOAD_CREATE), requireRole(['Admin', 'Manager']), upload.array('files', 20), async (req, res) => {
  try {
    const id = req.params.id;
    if (!req.files || req.files.length === 0) return res.status(400).json(errorResponse.badRequest('No files uploaded', 'BAD_REQUEST'));
    const inserted = [];
    for (const f of req.files) {
      try {
        const fileName = f.originalname || f.filename;
        const storedPath = '/uploads/' + encodeURIComponent(f.filename);
        const fileType = f.mimetype || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, storedPath, fileName, fileType, req.user && req.user._id ? req.user._id : null]);
        const docRec = { id: r.insertId, file_url: storedPath, file_name: fileName, file_type: fileType };
        inserted.push(docRec);
        await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'attach-document', JSON.stringify(docRec)]).catch(() => { });
      } catch (e) {
        logger.debug('Failed inserting uploaded file for client ' + id + ': ' + (e && e.message));
      }
    }
    if (inserted.length === 0) return res.status(500).json({ success: false, error: 'Failed to save uploaded files' });
    return res.status(201).json({ success: true, data: inserted });
  } catch (e) {
    logger.error('Error in file upload: ' + e.message);
    return res.status(500).json(errorResponse.serverError('Operation failed', 'SERVER_ERROR', { details: e.message }));
  }
});

router.get('/settings', requireRole(['Admin', 'Manager', 'Employee', 'Client-Viewer']), (req, res) => {
  const settings = {
    version: "1.0.0",
    general: {
      site_name: "Task Manager",
      support_email: "support@taskmanager.com",
      timezone: "Asia/Kolkata"
    },
    database: {
      primary_db: "connected",
      replica_db: "connected"
    },
    security: {
      password_expiry: true,
      login_notifications: true,
      session_timeout: false
    },
    notifications: {
      email_alerts: true,
      sms_alerts: false,
      weekly_summary: true
    },
    api: {
      base_url: "https://api.taskmanager.com",
      public_key: "pk_live_123456",
      secret_key: "sk_live_123456"
    }
  };
  return res.json({ success: true, data: settings });
});

router.put('/settings', requireRole(['Admin', 'Manager', 'Employee', 'Client-Viewer']), (req, res) => {
  const updates = req.body;
  const current = {
    version: "1.0.0",
    general: {
      site_name: "Task Manager",
      support_email: "support@taskmanager.com",
      timezone: "Asia/Kolkata"
    },
    database: {
      primary_db: "connected",
      replica_db: "connected"
    },
    security: {
      password_expiry: true,
      login_notifications: true,
      session_timeout: false
    },
    notifications: {
      email_alerts: true,
      sms_alerts: false,
      weekly_summary: true
    },
    api: {
      base_url: "https://api.taskmanager.com",
      public_key: "pk_live_123456",
      secret_key: "sk_live_123456"
    }
  };
  Object.keys(updates).forEach(key => {
    if (current[key]) {
      Object.assign(current[key], updates[key]);
    }
  });
  return res.json({ success: true, data: current });
});

module.exports = router;


