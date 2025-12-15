const express = require('express');
const router = express.Router();
const db = require(__root + 'db');
const logger = require('../logger');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpService = require(__root + 'utils/otpService');
const emailService = require(__root + 'utils/emailService');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

router.use(requireAuth);

// Get all users (Admin only)
router.get('/getusers', requireRole('Admin'), async (req, res) => {
  try {
    // determine if users table has department_id column and include it
    const colsRows = await new Promise(resolve => {
      db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id'", [], (e, r) => resolve(!e && Array.isArray(r) && r.length > 0));
    });
    const baseCols = ['_id','name','title','email','role','isActive','phone','createdAt'];
    const selectCols = colsRows ? baseCols.concat(['department_id']).join(', ') : baseCols.join(', ');
    const query = `SELECT ${selectCols} FROM users`;
    db.query(query, [], (err, results) => {
      if (err) {
        logger.error(`Error fetching users: ${err.message}`);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
      const query2 = 'SELECT _id, public_id FROM users';
      db.query(query2, [], (err2, ids) => {
        const map = {};
        if (!err2 && Array.isArray(ids)) ids.forEach(row => map[row._id] = row.public_id);
        
        // collect department ids to fetch their names
        const deptIds = Array.from(new Set((results || []).map(r => r.department_id).filter(Boolean)));
        if (deptIds.length === 0) {
          const out = (results || []).map(r => {
            const pub = map[r._id];
            const outObj = Object.assign({}, r);
            outObj.id = pub || r._id;
            delete outObj._id;
            return outObj;
          });
          return res.status(200).json(out);
        }

        // fetch department names
        db.query('SELECT id, public_id, name FROM departments WHERE id IN (?) OR public_id IN (?)', [deptIds, deptIds], (dErr, dRows) => {
          const deptMap = {};
          if (!dErr && Array.isArray(dRows)) {
            dRows.forEach(d => {
              deptMap[String(d.id)] = d.name;
              deptMap[String(d.public_id)] = d.name;
            });
          }

          const out = (results || []).map(r => {
            const pub = map[r._id];
            const outObj = Object.assign({}, r);
            outObj.id = pub || r._id;
            if (r.department_id) {
              outObj.department_id = r.department_id;
              outObj.department_name = deptMap[String(r.department_id)] || null;
            }
            delete outObj._id;
            return outObj;
          });
          res.status(200).json(out);
        });
      });
    });
  } catch (e) {
    logger.error('getusers error', e && e.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/create', requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, phone, role, departmentId, title, isActive, isGuest } = req.body;
    if (!name || !email || !role) return res.status(400).json({ success: false, message: 'Name, email and role required' });

    const exists = await new Promise((resolve, reject) => {
      db.query('SELECT _id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err) reject(err); else resolve(results);
      });
    });

    if (exists && exists.length > 0) return res.status(409).json({ success: false, message: 'User already exists with this email' });

    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const publicId = crypto.randomBytes(8).toString('hex');

    const fields = ['public_id', 'name', 'email', 'password', 'phone', 'role'];
    const placeholders = ['?', '?', '?', '?', '?', '?'];
    const params = [publicId, name, email, hashed, phone || null, role];

    // If a departmentId was provided, store it and attempt to resolve department name
    let deptId = departmentId || null;
    let deptName = null;
    if (departmentId) {
      try {
        if (/^\d+$/.test(String(departmentId))) {
          const d = await new Promise(resolve => db.query('SELECT id, name FROM departments WHERE id = ? LIMIT 1', [departmentId], (e, r) => resolve(!e && Array.isArray(r) && r[0] ? r[0] : null)));
          if (d) { deptName = d.name; }
        } else {
          const d = await new Promise(resolve => db.query('SELECT id, name FROM departments WHERE public_id = ? LIMIT 1', [departmentId], (e, r) => resolve(!e && Array.isArray(r) && r[0] ? r[0] : null)));
          if (d) { deptName = d.name; }
        }
      } catch (e) {
        // ignore department lookup failures, we'll still create user
      }

        // ensure users table has department_id column; create if missing
        if (deptId) {
          const hasDeptId = await new Promise(resolve => db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id'", [], (e, r) => resolve(!e && Array.isArray(r) && r.length > 0)));
          // create column if missing (best-effort)
          try {
            if (!hasDeptId) await new Promise((resolve, reject) => db.query("ALTER TABLE users ADD COLUMN department_id VARCHAR(255) NULL", [], (e) => e ? reject(e) : resolve()));
          } catch (e) { logger.warn('Could not add department_id column:', e && e.message); }

          // include department_id if it now exists
          const nowHasDeptId = await new Promise(resolve => db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id'", [], (e, r) => resolve(!e && Array.isArray(r) && r.length > 0)));
          if (nowHasDeptId && deptId) { fields.push('department_id'); placeholders.push('?'); params.push(deptId); }
        }
    }

    if (title) { fields.push('title'); placeholders.push('?'); params.push(title); }
    fields.push('isActive'); placeholders.push('?'); params.push(typeof isActive === 'undefined' ? true : Boolean(isActive));
    if (isGuest !== undefined) { fields.push('isGuest'); placeholders.push('?'); params.push(Boolean(isGuest)); }

    const hasCreatedAt = await new Promise(resolve => {
      db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_at'", [], (err, rows) => resolve(!err && Array.isArray(rows) && rows.length > 0));
    });

    const insertCols = hasCreatedAt ? `${fields.join(', ')}, created_at` : fields.join(', ');
    const insertVals = hasCreatedAt ? `${placeholders.join(', ')}, NOW()` : placeholders.join(', ');

    const sql = `INSERT INTO users (${insertCols}) VALUES (${insertVals})`;
    const result = await new Promise((resolve, reject) => { db.query(sql, params, (err, resu) => err ? reject(err) : resolve(resu)); });
    const insertId = result.insertId;

    const setupToken = jwt.sign({ id: publicId, step: 'setup' }, process.env.JWT_SECRET || process.env.SECRET || 'change_this_secret', { expiresIn: '7d' });
    const setupUrlBase = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
    const setupLink = `${setupUrlBase.replace(/\/$/, '')}/setup-password?token=${encodeURIComponent(setupToken)}`;

    const tpl = emailService.welcomeTemplate(name, email, tempPassword, setupLink);
    emailService.sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html })
      .then(r => { if (r.sent) logger.info(`✅ Welcome email sent to ${email}`); else logger.warn(`⚠️ Welcome email not sent to ${email} (logged): ${r.error || 'no transporter configured'}`); })
      .catch(err => logger.error(`❌ Failed to send welcome email to ${email}:`, err && err.message));

    // include department_id in the selection if it exists
    const selColsBase = ['_id','public_id','name','email','role','title','isActive','phone','isGuest'];
    const hasDeptIdCol = await new Promise(resolve => db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department_id'", [], (e, r) => resolve(!e && Array.isArray(r) && r.length > 0)));
    const selCols = hasDeptIdCol ? selColsBase.concat(['department_id']).join(', ') : selColsBase.join(', ');
    const selSql = `SELECT ${selCols} FROM users WHERE _id = ? LIMIT 1`;
    db.query(selSql, [insertId], (err, saved) => {
      if (err || !saved || !saved[0]) {
        // fallback: include department values we resolved earlier if present
        const fallbackData = { id: publicId, name, email, role, title: title || null, isActive: Boolean(isActive), phone: phone || null, tempPassword, setupToken };
        if (deptId) { fallbackData.department_id = deptId; fallbackData.department_name = deptName || null; }
        return res.status(201).json({ success: true, data: fallbackData });
      }
      const user = saved[0];
      const resp = { id: user.public_id || user._id, name: user.name, email: user.email, role: user.role, title: user.title, isActive: user.isActive, phone: user.phone, isGuest: user.isGuest || false, tempPassword, setupToken };
      
      // if user has department_id, fetch and include department name
      if (user.department_id) {
        db.query('SELECT name FROM departments WHERE id = ? OR public_id = ? LIMIT 1', [user.department_id, user.department_id], (dErr, dRows) => {
          resp.department_id = user.department_id;
          resp.department_name = (!dErr && Array.isArray(dRows) && dRows[0]) ? dRows[0].name : null;
          res.status(201).json({ success: true, data: resp });
        });
      } else {
        res.status(201).json({ success: true, data: resp });
      }
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
});

module.exports = router;
