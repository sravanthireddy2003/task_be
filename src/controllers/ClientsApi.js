const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require('../logger');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
const NotificationService = require('../services/notificationService');
 
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
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');
/*
  Rule codes used in this router:
  - CLIENT_CREATE, CLIENT_VIEW, CLIENT_UPDATE, CLIENT_DELETE
  Note: Additional client-specific actions should map to these CRUD codes when possible.
*/
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
 
router.post('/', upload.array('documents', 10), ruleEngine(RULES.CLIENT_CREATE), requireRole('Admin'), async (req, res) => {
  try {
    await ensureClientTables();
    const {
      name, company, billingAddress, officeAddress, gstNumber, taxId, industry,
      notes, status = 'Active', managerId, manager_id: managerIdSnake, contacts = [], enableClientPortal = false,
      createViewer = false, email, phone, district, pincode, state, documents = []
    } = req.body;
 
    const managerInput = managerId ?? managerIdSnake ?? null;
    let resolvedManagerId = null;
    if (!isEmptyValue(managerInput)) {
      resolvedManagerId = await resolveUserId(managerInput);
      if (resolvedManagerId === null) {
        return res.status(404).json({ success: false, error: 'Manager not found' });
      }
    }

    if (!name || !company) {
      return res.status(400).json({ success: false, error: 'name and company required' });
    }
 
    // Check duplicate client
    const hasIsDeleted = await hasColumn('clientss', 'isDeleted');
    const dupSql = hasIsDeleted
      ? 'SELECT id FROM clientss WHERE name = ? AND isDeleted != 1 LIMIT 1'
      : 'SELECT id FROM clientss WHERE name = ? LIMIT 1';
    const dup = await q(dupSql, [name]);
    if (Array.isArray(dup) && dup.length > 0) {
      return res.status(409).json({ success: false, error: 'Client with that name already exists' });
    }
 
    // Generate reference number
    const compInit = (company || '').substring(0, 3).toUpperCase() || name.substring(0, 3).toUpperCase();
    const last = await q('SELECT ref FROM clientss WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', [`${compInit}%`]);
    let seq = '0001';
    if (Array.isArray(last) && last.length > 0) {
      const lastn = parseInt(last[0].ref.slice(-4) || '0', 10) || 0;
      seq = (lastn + 1).toString().padStart(4, '0');
    }
    const ref = `${compInit}${seq}`;
 
    // Insert client with fallback for missing columns
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
        } catch (u) { /* ignore update failures for optional columns */ }
      } else {
        throw e;
      }
    }
 
    // Insert contacts
    if (Array.isArray(contacts) && contacts.length > 0) {
      for (const c of contacts) {
        await q(`
          INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]);
      }
    }

    // Create user accounts for each contact that has an email (store in users table and map to client_viewers)
    if (Array.isArray(contacts) && contacts.length > 0) {
      const bcrypt = require('bcryptjs');
      for (const c of contacts) {
        try {
          if (!c || !c.email) continue;
          const emailAddr = String(c.email).trim();

          // skip if user already exists
          const exists = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [emailAddr]).catch(() => []);
          if (Array.isArray(exists) && exists.length > 0) {
            const existingId = exists[0]._id;
            // ensure client_viewers mapping exists
            try { await q('INSERT IGNORE INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, existingId]); } catch (e) {}
            continue;
          }

          const tempPassword = crypto.randomBytes(6).toString('hex');
          const hashed = await bcrypt.hash(tempPassword, 10);
          const publicId = crypto.randomBytes(8).toString('hex');
          const displayName = c.name || `${company} Contact`;

          const insertSql = `INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
          const r = await q(insertSql, [publicId, displayName, emailAddr, hashed, 'Client-Viewer', 1]);
          const newUserId = r && r.insertId ? r.insertId : null;
          if (newUserId) {
            try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]); } catch (e) {}

            // If clientss.user_id column exists, set it to this new user for primary contact
            try {
              if (await hasColumn('clientss', 'user_id')) {
                // Only set when primary contact or when client.user_id is empty
                if (c.is_primary) {
                  await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, clientId]).catch(()=>{});
                } else {
                  // attempt to set if currently null
                  await q('UPDATE clientss SET user_id = COALESCE(user_id, ?) WHERE id = ?', [newUserId, clientId]).catch(()=>{});
                }
              }
            } catch (e) {
              logger.debug('Failed updating clientss.user_id: ' + (e && e.message));
            }

            // send credentials email
            try {
              const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/auth/setup?uid=${publicId}`;
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
 
    // Update optional fields (district, pincode, state)
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
 
    // Insert documents from uploaded files
    const attachedDocuments = [];
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const storedPath = '/uploads/' + encodeURIComponent(file.filename);
          const fileType = mime.lookup(file.originalname) || file.mimetype || null;
          const r = await q(`
            INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active)
            VALUES (?, ?, ?, ?, ?, NOW(), 1)
          `, [clientId, storedPath, file.originalname, fileType, req.user && req.user._id ? req.user._id : null]);
          attachedDocuments.push({ id: r.insertId, file_url: `${baseUrl}${storedPath}`, file_name: file.originalname, file_type: fileType });
        } catch (e) {
          logger.debug('Failed to attach document for client ' + clientId + ': ' + (e && e.message));
        }
      }
    }

    // Also handle documents array if provided (backward compatibility)
    // Only persist a document entry when the backend has saved the file (or the path already points to /uploads/).
    if (Array.isArray(documents) && documents.length > 0) {
      for (const d of documents) {
        if (!d) continue;
        const fileName = d.file_name || d.fileName || null;
        if (!fileName) continue;
        const fileUrlCandidate = d.file_url || d.fileUrl || null;

        let storedPath = null;
        try {
          // If the client provided a server-side uploads path, preserve it
          if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && fileUrlCandidate.startsWith('/uploads/')) {
            storedPath = fileUrlCandidate;
          }

          // If client supplied a base64 payload, save it to uploads
          else if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && fileUrlCandidate.startsWith('data:')) {
            const safeName = fileName.replace(/[^a-zA-Z0-9._()-]/g, '_');
            const savedUrl = saveBase64ToUploads(fileUrlCandidate, safeName);
            if (savedUrl) {
              try {
                const parsed = new URL(savedUrl);
                storedPath = parsed.pathname || savedUrl.replace(/^(?:https?:\/\/[^\/]+)?/, '');
              } catch (e) {
                storedPath = savedUrl.replace(/^(?:https?:\/\/[^\/]+)?/, '');
                if (!storedPath.startsWith('/')) storedPath = '/' + storedPath;
              }
            }
          }

          // If client provided a blob: URL or external URL, skip — cannot persist server-side
          else if (fileUrlCandidate && typeof fileUrlCandidate === 'string' && (fileUrlCandidate.startsWith('blob:') || /^https?:\/\//i.test(fileUrlCandidate))) {
            logger.debug('Skipping external/blob document reference for client ' + clientId + ': ' + String(fileUrlCandidate).slice(0, 200));
            storedPath = null;
          }

          // As a last resort, if the client only provided a filename and there is an already-uploaded file matching it, prefer that
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
          `, [clientId, storedPath, fileName, fileType, d.uploaded_by || d.uploadedBy || (req.user && req.user._id ? req.user._id : null)]);
          attachedDocuments.push({ id: r.insertId, file_url: `${baseUrl}${storedPath}`, file_name: fileName, file_type: fileType });
        } catch (e) {
          logger.debug('Failed to attach document for client ' + clientId + ': ' + (e && e.message));
        }
      }
    }
 
// Find primary contact email FIRST
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
 
// ✅ DUAL EMAIL SYSTEM: Client Welcome + Viewer Credentials
let viewerInfo = null;
 
// 1. CREATE VIEWER or CLIENT PORTAL USER (if requested)
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
      INSERT INTO users (public_id, name, email, password, role, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;
    const userRes = await q(insertUserSql, [publicId, displayName, userEmail, hashed, roleToInsert, 1]);
    const newUserId = userRes.insertId;

    // map to client_viewers so client-scoped access works
    try {
      await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]);
    } catch (e) {
      // ignore mapping errors
    }

    // set clientss.user_id to this created portal user when applicable
    try {
      if (await hasColumn('clientss', 'user_id')) {
        await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, clientId]).catch(()=>{});
      }
    } catch (e) {
      logger.debug('Failed to set clientss.user_id for portal user: ' + (e && e.message));
    }

    // send credentials email using welcomeTemplate
    const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/auth/setup?uid=${publicId}`;
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
 
// 2. CLIENT WELCOME EMAIL (Always sent if email exists)
let clientCredentials = null;
if (primaryContactEmail || email) {
  const clientEmail = primaryContactEmail || email;
  const clientPortalLink = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/client-portal/${ref}`;

  // Ensure a `users` row exists for the client email. If missing, create one and persist temp password.
  try {
    const existing = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [clientEmail]).catch(() => []);
    if (!existing || existing.length === 0) {
      const bcrypt = require('bcryptjs');
      const clientTempPassword = crypto.randomBytes(6).toString('hex');
      const hashed = await new Promise((resolve, reject) => bcrypt.hash(clientTempPassword, 10, (err, hash) => (err ? reject(err) : resolve(hash))));
      const publicIdForClient = crypto.randomBytes(8).toString('hex');
      const displayNameForClient = primaryContactName || name || `Client ${ref}`;

      const ins = await q(`INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [publicIdForClient, displayNameForClient, clientEmail, hashed, 'Client-Viewer', 1]).catch((e) => { throw e; });
      const newUid = ins && ins.insertId ? ins.insertId : null;
      if (newUid) {
        // map to client_viewers and set clientss.user_id when available
        try { await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUid]).catch(()=>{}); } catch (e) {}
        try { if (await hasColumn('clientss', 'user_id')) await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUid, clientId]).catch(()=>{}); } catch (e) { logger.debug('Failed setting clientss.user_id for client email user: ' + (e && e.message)); }
        clientCredentials = { email: clientEmail, tempPassword: clientTempPassword, publicId: publicIdForClient, userId: newUid };
      }
    }
  } catch (e) {
    logger.debug('Failed ensuring client user exists: ' + (e && e.message));
  }

  // Generate/send welcome email (include temp password if we created one)
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
    // Log activity
    await q(`
      INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `, [clientId, req.user && req.user._id ? req.user._id : null, 'create',
        JSON.stringify({ createdBy: req.user ? req.user.id : null })]);
 
    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Client Added', `New client "${name}" has been added`, 'CLIENT_ADDED', 'client', clientId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        console.error('Client creation notification error:', notifErr);
      }
    })();

  } catch (e) {
    logger.error('Error creating client: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});
 
router.get('/', ruleEngine(RULES.CLIENT_VIEW), requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
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
 
router.get('/:id', ruleEngine(RULES.CLIENT_VIEW), requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
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
        } catch (e) {}
        return d;
      });
    } catch (e) {}
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
 
router.put('/:id', ruleEngine(RULES.CLIENT_UPDATE), requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    delete payload.id;
    delete payload.ref;
    if (payload.managerId !== undefined && payload.manager_id === undefined) {
      payload.manager_id = payload.managerId;
      delete payload.managerId;
    }
    if (payload.manager_id !== undefined) {
      if (!isEmptyValue(payload.manager_id)) {
        const resolved = await resolveUserId(payload.manager_id);
        if (resolved === null) {
          return res.status(404).json({ success: false, error: 'Manager not found' });
        }
        payload.manager_id = resolved;
      } else {
        payload.manager_id = null;
      }
    }
    const allowed = ['name','company','billing_address','office_address','gst_number','tax_id','industry','notes','status','manager_id'];
    const setCols = [];
    const params = [];
    for (const k of allowed) if (payload[k] !== undefined) { setCols.push(`${k} = ?`); params.push(payload[k]); }
    if (setCols.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' });
    params.push(id);
    await q(`UPDATE clientss SET ${setCols.join(', ')} WHERE id = ?`, params);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'update', JSON.stringify(payload)]).catch(()=>{});    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Client Updated', `Client with ID "${id}" has been updated`, 'CLIENT_UPDATED', 'client', id, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        console.error('Client update notification error:', notifErr);
      }
    })();    return res.json({ success: true, message: 'Client updated' });
  } catch (e) {
    logger.error('Error updating client: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});
 
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
      await q('DELETE FROM client_viewers WHERE user_id IN (?)', [deleteIds]).catch(() => {});
      await q('DELETE FROM users WHERE _id IN (?)', [deleteIds]).catch(() => {});
    }
  }
  await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{});
  await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{});
  await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{});
  await q('DELETE FROM clientss WHERE id = ?', [id]);
  await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => {});
}

router.delete('/:id', ruleEngine(RULES.CLIENT_DELETE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    await permanentlyDeleteClientById(id);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user && req.user._id ? req.user._id : null, 'deleted', 'permanently deleted']).catch(()=>{});    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Client Deleted', `Client with ID "${id}" has been deleted`, 'CLIENT_DELETED', 'client', id, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        console.error('Client delete notification error:', notifErr);
      }
    })();    return res.json({ success: true, message: 'Client permanently deleted' });
  } catch (e) {
    logger.error('Error deleting client: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
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
        await q('DELETE FROM client_viewers WHERE user_id IN (?)', [deleteIds]).catch(() => {});
        await q('DELETE FROM users WHERE _id IN (?)', [deleteIds]).catch(() => {});
      }
    }
    await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(()=>{});
    await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(()=>{});
    await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(()=>{});
    await q('DELETE FROM clientss WHERE id = ?', [id]);
    await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => {});
    return res.json({ success: true, message: 'Client permanently deleted' });
  } catch (e) { logger.error('Error permanently deleting client: ' + e.message); return res.status(500).json({ success: false, error: e.message }); }
});
 
router.post('/:id/assign-manager', ruleEngine(RULES.CLIENT_UPDATE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { managerId, manager_id: managerIdSnake, managerPublicId } = req.body || {};
    const hasManagerField = Object.prototype.hasOwnProperty.call(req.body || {}, 'managerId')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'manager_id')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'managerPublicId');
    if (!hasManagerField) {
      return res.status(400).json({ success: false, error: 'managerId required' });
    }
    const managerInput = managerId ?? managerIdSnake ?? managerPublicId ?? null;
    let finalManagerId = null;
    if (!isEmptyValue(managerInput)) {
      finalManagerId = await resolveUserId(managerInput);
      if (finalManagerId === null) {
        return res.status(404).json({ success: false, error: 'Manager not found' });
      }
    }
    await q('UPDATE clientss SET manager_id = ? WHERE id = ?', [finalManagerId, id]);
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
      [id, req.user && req.user._id ? req.user._id : null, finalManagerId ? 'assign-manager' : 'unassign-manager', JSON.stringify({ managerId: finalManagerId })])
      .catch(() => {});
    return res.json({ success: true, message: finalManagerId ? 'Manager assigned' : 'Manager unassigned' });
  } catch (e) {
    logger.error('Error assigning manager: ' + e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});
 
// Create a client-viewer account and map it to this client
router.post('/:id/create-viewer', ruleEngine(RULES.CLIENT_CREATE), requireRole('Admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { email, name } = req.body;
    
    // DEBUG: Log incoming request
    logger.info(`[CREATE-VIEWER] Request: id=${id}, email=${email}, name=${name}`);
    
    if (!email) {
      logger.warn('[CREATE-VIEWER] Missing email');
      return res.status(400).json({ success: false, error: 'email required' });
    }

    // Generate credentials
    const tempPassword = crypto.randomBytes(6).toString('hex');
    logger.info(`[CREATE-VIEWER] Generated tempPassword: ${tempPassword}`);
    
    const hashed = await new Promise((resH, rejH) => {
      require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h));
    });
    logger.info('[CREATE-VIEWER] Password hashed successfully');

    const publicId = crypto.randomBytes(8).toString('hex');
    logger.info(`[CREATE-VIEWER] Generated publicId: ${publicId}`);

    // CRITICAL DEBUG: Role before insert
    const roleToInsert = 'Client-Viewer';
    logger.info(`[CREATE-VIEWER] Role TO INSERT: "${roleToInsert}" (type: ${typeof roleToInsert}, length: ${roleToInsert.length})`);

    const insertUserSql = 'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())';
    logger.info(`[CREATE-VIEWER] SQL: ${insertUserSql}`);
    logger.info(`[CREATE-VIEWER] Params: [${publicId}, "${name || `Viewer for ${id}`}", "${email}", "${hashed?.substring(0,10)}...", "${roleToInsert}", 1]`);

    const userRes = await q(insertUserSql, [publicId, name || `Viewer for ${id}`, email, hashed, roleToInsert, 1]);
    const newUserId = userRes && userRes.insertId ? userRes.insertId : null;
    
    logger.info(`[CREATE-VIEWER] Insert result: ${JSON.stringify(userRes)}`);
    logger.info(`[CREATE-VIEWER] New user ID: ${newUserId}`);

    if (newUserId) {
      // DEBUG: Verify what was actually saved in DB
      const verifyRole = await q('SELECT role, public_id FROM users WHERE id = ?', [newUserId]);
      logger.info(`[CREATE-VIEWER] DB SAVED role: "${verifyRole[0]?.role}" (type: ${typeof verifyRole[0]?.role})`);
      logger.info(`[CREATE-VIEWER] DB SAVED public_id: "${verifyRole[0]?.public_id}"`);

      // Create mapping
      try {
        await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [id, newUserId]);
        logger.info(`[CREATE-VIEWER] client_viewers mapping created`);
      } catch (e) {
        logger.error(`[CREATE-VIEWER] Failed client_viewers mapping: ${e.message}`);
      }

      // Update clientss.user_id if column exists
      try {
        if (await hasColumn('clientss', 'user_id')) {
          await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newUserId, id]);
          logger.info(`[CREATE-VIEWER] clientss.user_id updated to ${newUserId}`);
        }
      } catch (e) {
        logger.error(`[CREATE-VIEWER] Failed clientss update: ${e.message}`);
      }

      // FORCE CORRECT ROLE if wrong (temporary fix)
      if (verifyRole[0]?.role !== 'Client-Viewer') {
        await q('UPDATE users SET role = "Client-Viewer" WHERE id = ?', [newUserId]);
        logger.warn(`[CREATE-VIEWER] FORCE-UPDATED role from "${verifyRole[0]?.role}" to "Client-Viewer"`);
      }
    }

    // Send email
    try {
      await emailService.sendCredentials(email, name || `Client Viewer`, publicId, tempPassword);
      logger.info(`[CREATE-VIEWER] Credentials email sent to ${email}`);
    } catch (e) {
      logger.warn(`[CREATE-VIEWER] Email failed: ${e.message}`);
    }

    // Log activity
    await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', 
      [id, req.user?._id || null, 'create-viewer', JSON.stringify({ userId: newUserId, publicId })])
      .catch(e => logger.error(`[CREATE-VIEWER] Activity log failed: ${e.message}`));

    logger.info(`[CREATE-VIEWER] SUCCESS: ${JSON.stringify({ publicId, userId: newUserId })}`);
    return res.status(201).json({ success: true, data: { publicId, userId: newUserId } });

  } catch (e) {
    logger.error(`[CREATE-VIEWER] FULL ERROR: ${e.stack || e.message}`);
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
 
router.post('/:id/contacts', ruleEngine(RULES.CLIENT_CONTACT_ADD), requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const { name, email, phone, designation, is_primary } = req.body; if (!name) return res.status(400).json({ success: false, error: 'name required' }); if (is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]); return res.status(201).json({ success: true, data: { id: r.insertId } }); } catch (e) { logger.error('Error adding contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });
 
router.put('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; const payload = req.body || {}; if (payload.is_primary) { await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); } const allowed = ['name','email','phone','designation','is_primary']; const sets = []; const params = []; for (const k of allowed) if (payload[k] !== undefined) { sets.push(`${k} = ?`); params.push(payload[k]); } if (!sets.length) return res.status(400).json({ success: false, error: 'No fields' }); params.push(contactId); await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params); return res.json({ success: true, message: 'Contact updated' }); } catch (e) { logger.error('Error updating contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });
 
router.delete('/:id/contacts/:contactId', requireRole(['Admin','Manager']), async (req, res) => { try { const contactId = req.params.contactId; await q('DELETE FROM client_contacts WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Contact deleted' }); } catch (e) { logger.error('Error deleting contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });
 
router.post('/:id/contacts/:contactId/set-primary', ruleEngine(RULES.CLIENT_CONTACT_UPDATE), requireRole(['Admin','Manager']), async (req, res) => { try { const id = req.params.id; const contactId = req.params.contactId; await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]); await q('UPDATE client_contacts SET is_primary = 1 WHERE id = ?', [contactId]); return res.json({ success: true, message: 'Primary contact set' }); } catch (e) { logger.error('Error setting primary contact: '+e.message); return res.status(500).json({ success: false, error: e.message }); } });
 
router.post('/:id/documents', ruleEngine(RULES.CLIENT_UPDATE), requireRole(['Admin','Manager']), async (req, res) => {
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
      // Normalize to uploads-relative path; never persist blob: or full URLs
      const candidate = d.file_url || d.fileUrl || null;
      let storedPath = '/uploads/' + encodeURIComponent(fileName);
      if (candidate && typeof candidate === 'string' && candidate.startsWith('/uploads/')) storedPath = candidate;
      try {
        const fileType = d.file_type || d.fileType || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, storedPath, fileName, fileType, d.uploaded_by || d.uploadedBy || (req.user && req.user._id ? req.user._id : null)]);
        const docRec = { id: r.insertId, file_url: storedPath, file_name: fileName, file_type: fileType };
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
router.post('/:id/upload', ruleEngine(RULES.UPLOAD_CREATE), requireRole(['Admin','Manager']), upload.array('files', 20), async (req, res) => {
  try {
    const id = req.params.id;
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded' });
    const inserted = [];
    for (const f of req.files) {
      try {
        const fileName = f.originalname || f.filename;
        const storedPath = '/uploads/' + encodeURIComponent(f.filename);
        const fileType = f.mimetype || guessMimeType(fileName) || null;
        const r = await q('INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at, is_active) VALUES (?, ?, ?, ?, ?, NOW(), 1)', [id, storedPath, fileName, fileType, req.user && req.user._id ? req.user._id : null]);
        const docRec = { id: r.insertId, file_url: storedPath, file_name: fileName, file_type: fileType };
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
 
 
 