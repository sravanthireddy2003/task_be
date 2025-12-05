const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const logger = require("../logger");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpService = require(__root + 'utils/otpService');
// tenantMiddleware intentionally not applied here (only Tasks/Projects are tenant-scoped)
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

// all user endpoints require auth (tenant scoping removed — only Tasks/Projects enforce tenant)
router.use(requireAuth);

// Route to get all users
router.get("/getusers", requireRole('Admin'), (req, res) => {
  const query = "SELECT _id, name, title, email, role, isActive, createdAt FROM users";
  db.query(query, [], (err, results) => {
    if (err) {
      logger.error(`Error Fetching users: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    // normalize to expose external id (public_id) where available
    const query2 = 'SELECT _id, public_id FROM users';
    db.query(query2, [], (err2, ids) => {
      if (err2 || !ids) {
        // fallback: map by using _id only
        const out = (results || []).map(r => { r.id = r._id; delete r._id; return r; });
        return res.status(200).json(out);
      }
      // build map
      const map = {};
      ids.forEach(row => { map[row._id] = row.public_id; });
      const out = (results || []).map(r => {
        const pub = map[r._id];
        r.id = pub || r._id;
        delete r._id;
        return r;
      });
      res.status(200).json(out);
    });
  });
});

// Create user (Admin / HR)
router.post('/create', requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, phone, role, departmentId, title, isActive } = req.body;
    if (!name || !email || !role) return res.status(400).json({ success: false, message: 'name, email and role required' });

    // check if user exists
    const exists = await new Promise((resolve) => db.query('SELECT _id FROM users WHERE email = ? LIMIT 1', [email], (e, r) => e ? resolve(null) : resolve(r)));
    if (exists && exists.length > 0) return res.status(409).json({ success: false, message: 'User already exists with this email' });

    // helper to check column existence
    const tableHasColumn = (table, column) => new Promise((resolve) => {
      db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column], (err, rows) => {
        if (err || !Array.isArray(rows)) return resolve(false);
        return resolve(rows.length > 0);
      });
    });

    const hasPublic = await tableHasColumn('users', 'public_id');
    const hasPhone = await tableHasColumn('users', 'phone');
    const hasDept = await tableHasColumn('users', 'department_id');

    // include role in insert if the column exists
    const hasRole = await tableHasColumn('users', 'role');

    // resolve department id if provided (accept public_id or numeric)
    let deptInternal = null;
    if (departmentId && hasDept) {
      if (/^\d+$/.test(String(departmentId))) deptInternal = departmentId;
      else {
        const drows = await new Promise((resolve) => db.query('SELECT id FROM departments WHERE public_id = ? LIMIT 1', [departmentId], (e, r) => e ? resolve([]) : resolve(r)));
        if (drows && drows[0]) deptInternal = drows[0].id;
      }
    }

    // generate temp password and hash
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const publicId = hasPublic ? crypto.randomBytes(8).toString('hex') : null;

    const fields = ['name','email','password'];
    const placeholders = ['?','?','?'];
    const params = [name, email, hashed];
    if (hasPhone && phone) { fields.push('phone'); placeholders.push('?'); params.push(phone); }
    if (hasDept && deptInternal) { fields.push('department_id'); placeholders.push('?'); params.push(deptInternal); }
    if (hasRole) { fields.push('role'); placeholders.push('?'); params.push(role); }
    // optional title and isActive columns
    const hasTitle = await tableHasColumn('users', 'title');
    const hasIsActive = await tableHasColumn('users', 'isActive');
    if (hasTitle && title) { fields.push('title'); placeholders.push('?'); params.push(title); }
    if (hasIsActive) { fields.push('isActive'); placeholders.push('?'); params.push(typeof isActive === 'undefined' ? true : Boolean(isActive)); }
    if (hasPublic) { fields.unshift('public_id'); placeholders.unshift('?'); params.unshift(publicId); }

    const hasCreatedAt = await tableHasColumn('users', 'created_at');
    const insertCols = hasCreatedAt ? `${fields.join(', ')}, created_at` : `${fields.join(', ')}`;
    const insertVals = hasCreatedAt ? `${placeholders.join(', ')}, NOW()` : `${placeholders.join(', ')}`;
    const sql = `INSERT INTO users (${insertCols}) VALUES (${insertVals})`;
    const result = await new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));
    const insertId = result && result.insertId ? result.insertId : null;
    if (!insertId) return res.status(500).json({ success: false, message: 'Failed to create user' });

    // create setup token using public_id if present
    const tokenIdForJwt = publicId || String(insertId);
    const setupToken = jwt.sign({ id: tokenIdForJwt, step: 'setup' }, process.env.SECRET || 'change_this_secret', { expiresIn: '7d' });

    // insert a first-login activity entry (created-by-admin)
    try {
      const ih = 'INSERT INTO login_history (user_id, tenant_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
      const tenant = req.user && req.user.tenant_id ? req.user.tenant_id : null;
      db.query(ih, [insertId, tenant, null, 'created-by-admin', 0], () => {});
    } catch (e) {}

    // send temporary password and setup link via email (best-effort)
    try {
      const setupUrlBase = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:4000';
      const setupLink = `${setupUrlBase.replace(/\/$/, '')}/setup-password?token=${encodeURIComponent(setupToken)}`;
      const subject = 'Your account has been created';
      const text = `Hello ${name},\n\nAn account has been created for you.\n\nLogin email: ${email}\nTemporary password: ${tempPassword}\nSetup link: ${setupLink}\n\nPlease change your password after first login.`;
      const html = `<p>Hello ${name},</p><p>An account has been created for you.</p><p><strong>Login email:</strong> ${email}<br/><strong>Temporary password:</strong> ${tempPassword}</p><p><a href="${setupLink}">Click here to set your password and complete setup</a></p><p>Please change your password after first login.</p>`;
      otpService.sendNotification({ to: email, subject, text, html }).catch(()=>{});
    } catch (e) {
      console.warn('Failed to send setup email (non-fatal):', e && e.message);
    }

    // fetch inserted row to ensure persisted values (especially role) and return DB-backed record
    try {
      const selSql = 'SELECT _id, public_id, name, email, role, title, isActive FROM users WHERE _id = ? LIMIT 1';
      const saved = await new Promise((resolve) => db.query(selSql, [insertId], (e, r) => e ? resolve(null) : resolve(r && r[0] ? r[0] : null)));
      if (saved) {
        // map external id
        const outId = saved.public_id || saved._id;
        // if role did not persist but request provided a value, log for investigation
        if ((typeof saved.role === 'undefined' || saved.role === null || String(saved.role).trim() === '') && role) {
          logger.warn(`Role was not persisted for user _id=${insertId} (requested role='${role}')`);
        }
        return res.status(201).json({ success: true, data: { id: outId, name: saved.name, email: saved.email, role: saved.role || '', title: saved.title || null, isActive: typeof saved.isActive === 'undefined' ? true : Boolean(saved.isActive), tempPassword, setupToken } });
      }
    } catch (e) {
      logger.warn('Could not fetch saved user after insert: ' + (e && e.message));
    }

    // fallback: return the requested values if select failed
    return res.status(201).json({ success: true, data: { id: publicId || insertId, name, email, role, title: title || null, isActive: typeof isActive === 'undefined' ? true : Boolean(isActive), tempPassword, setupToken } });
  } catch (e) {
    logger.error('Create user error', e && e.message);
    return res.status(500).json({ success: false, message: 'Failed to create user', error: e.message });
  }
});

// Route to get user by ID
router.get("/getuserbyid/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  // accept either numeric internal id or external public_id
  const isNumeric = /^\d+$/.test(String(id));
  const query = isNumeric ? `SELECT name, title, email, role, isActive, _id, public_id FROM users WHERE _id = ? LIMIT 1` : `SELECT name, title, email, role, isActive, _id, public_id FROM users WHERE public_id = ? LIMIT 1`;
  db.query(query, [id], (err, results) => {
    if (err) {
      logger.error(`Error Fetching user by ID ${id}: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
    const out = results[0];
    // return external id as `id` field for clients
    out.id = out.public_id || out._id;
    delete out.public_id;
    res.status(200).json(out);
  });
});

// Add this route to your existing users.js router
router.put("/update/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ success: false, message: "Name, email and role are required" });
  }

  // accept numeric _id or public_id in the path
  const isNumeric = /^\d+$/.test(String(id));
  const sql = isNumeric ?
    `UPDATE users SET name = ?, title = ?, email = ?, role = ?, isActive = ? WHERE _id = ?` :
    `UPDATE users SET name = ?, title = ?, email = ?, role = ?, isActive = ? WHERE public_id = ?`;

  const activeStatus = isActive === 'true' ? true : Boolean(isActive);
  const values = [name, title, email, role, activeStatus, id];

  db.query(sql, values, (err, result) => {
    if (err) {
      logger.error(`Database error updating user ${id}: ${err.message}`);
      return res.status(500).json({ success: false, message: "Database error", error: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const selectSql = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    db.query(selectSql, [id], (err, user) => {
      if (err || !user || user.length === 0) {
        return res.status(200).json({ success: true, message: "User updated but could not fetch updated data" });
      }
      const u = user[0]; u.id = u.public_id || u._id; delete u.public_id; res.status(200).json({ success: true, message: "User updated successfully", user: u });
    });
  });
});

// Route to delete a user
router.delete("/delete/:user_id", requireRole('Admin'), (req, res) => {
  const { user_id } = req.params;
  logger.info(`DELETE /api/users/delete/${user_id} - Deleting user`);
  const isNumeric = /^\d+$/.test(String(user_id));

  const sqlDelete = isNumeric ? `DELETE FROM users WHERE _id = ?` : `DELETE FROM users WHERE public_id = ?`;
  db.query(sqlDelete, [user_id], (err, result) => {
    if (err) {
      logger.error(`Error Deleting user with ID ${user_id}: ${err.message}`);
      return res.status(500).send({ success: false, message: "Database error", error: err.message });
    }
    if (result.affectedRows === 0) {
      logger.warn(`User with ID ${user_id} not found for deletion`);
      return res.status(404).send({ success: false, message: "User not found" });
    }
    logger.info(`Successfully deleted user with ID: ${user_id}`);
    return res.status(200).send({ success: true, message: "User deleted successfully" });
  });
});

module.exports = router;
