const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const logger = require("../logger");
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const otpService = require(__root + 'utils/otpService');
const emailService = require(__root + 'utils/emailService');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

router.use(requireAuth);

// Get all users
router.get("/getusers", requireRole('Admin'), (req, res) => {
  const query = "SELECT _id, name, title, email, role, isActive, phone, createdAt FROM users";
  db.query(query, [], (err, results) => {
    if (err) {
      logger.error(`Error fetching users: ${err.message}`);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
    const query2 = 'SELECT _id, public_id FROM users';
    db.query(query2, [], (err2, ids) => {
      const map = {};
      if (!err2 && Array.isArray(ids)) ids.forEach(row => map[row._id] = row.public_id);
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

// Create user
// Create user - FIXED EMAIL SENDING
router.post('/create', requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, phone, role, departmentId, title, isActive, isGuest } = req.body;
    
    if (!name || !email || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email and role required' 
      });
    }

    // Check if user exists
    const exists = await new Promise((resolve, reject) => {
      db.query('SELECT _id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    if (exists && exists.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'User already exists with this email' 
      });
    }

    // Generate credentials
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const publicId = crypto.randomBytes(8).toString('hex');

    // Build dynamic INSERT
    const fields = ['public_id', 'name', 'email', 'password', 'phone', 'role'];
    const placeholders = ['?', '?', '?', '?', '?', '?'];
    const params = [publicId, name, email, hashed, phone || null, role];

    if (title) {
      fields.push('title'); 
      placeholders.push('?'); 
      params.push(title);
    }
    fields.push('isActive'); 
    placeholders.push('?'); 
    params.push(typeof isActive === 'undefined' ? true : Boolean(isActive));
    
    if (isGuest !== undefined) {
      fields.push('isGuest'); 
      placeholders.push('?'); 
      params.push(Boolean(isGuest));
    }

    const hasCreatedAt = await new Promise(resolve => {
      db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_at'",
        [], (err, rows) => resolve(!err && Array.isArray(rows) && rows.length > 0)
      );
    });
    
    const insertCols = hasCreatedAt ? `${fields.join(', ')}, created_at` : fields.join(', ');
    const insertVals = hasCreatedAt ? `${placeholders.join(', ')}, NOW()` : placeholders.join(', ');

    const sql = `INSERT INTO users (${insertCols}) VALUES (${insertVals})`;
    const result = await new Promise((resolve, reject) => {
      db.query(sql, params, (err, res) => err ? reject(err) : resolve(res));
    });
    
    const insertId = result.insertId;

    // 🔥 FIXED: Send email with proper error handling & logging
    const setupToken = jwt.sign(
      { id: publicId, step: 'setup' }, 
      process.env.JWT_SECRET || process.env.SECRET || 'change_this_secret', 
      { expiresIn: '7d' }
    );

    const setupUrlBase = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
    const setupLink = `${setupUrlBase.replace(/\/$/, '')}/setup-password?token=${encodeURIComponent(setupToken)}`;

    const tpl = emailService.welcomeTemplate(name, email, tempPassword, setupLink);
    // fire-and-forget send
    emailService.sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html })
      .then(r => {
        if (r.sent) logger.info(`✅ Welcome email sent to ${email}`);
        else logger.warn(`⚠️ Welcome email not sent to ${email} (logged): ${r.error || 'no transporter configured'}`);
      })
      .catch(err => logger.error(`❌ Failed to send welcome email to ${email}:`, err && err.message));

    // Return created user
    const selSql = 'SELECT _id, public_id, name, email, role, title, isActive, phone, isGuest FROM users WHERE _id = ? LIMIT 1';
    db.query(selSql, [insertId], (err, saved) => {
      if (err || !saved || !saved[0]) {
        return res.status(201).json({ 
          success: true, 
          data: { 
            id: publicId, 
            name, email, role, title: title || null, 
            isActive: Boolean(isActive), 
            phone: phone || null, 
            tempPassword,
            setupToken 
          } 
        });
      }
      
      const user = saved[0];
      res.status(201).json({ 
        success: true, 
        data: { 
          id: user.public_id || user._id,
          name: user.name, 
          email: user.email, 
          role: user.role, 
          title: user.title, 
          isActive: user.isActive,
          phone: user.phone,
          isGuest: user.isGuest || false,
          tempPassword,
          setupToken 
        } 
      });
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user',
      error: error.message 
    });
  }
});

// Update user
router.put("/update/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive, phone } = req.body;

  if (!name || !email || !role) return res.status(400).json({ success: false, message: "Name, email and role required" });

  const isNumeric = /^\d+$/.test(String(id));
  const sql = isNumeric ?
    `UPDATE users SET name=?, title=?, email=?, role=?, isActive=?, phone=? WHERE _id=?` :
    `UPDATE users SET name=?, title=?, email=?, role=?, isActive=?, phone=? WHERE public_id=?`;

  const values = [name, title, email, role, Boolean(isActive), phone || null, id];

  db.query(sql, values, (err, result) => {
    if (err) {
      logger.error(`Database error updating user ${id}: ${err.message}`);
      return res.status(500).json({ success: false, message: "Database error", error: err.message });
    }
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });

    const selectSql = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    db.query(selectSql, [id], (err, user) => {
      if (err || !user || user.length === 0) return res.status(200).json({ success: true, message: "User updated but could not fetch updated data" });
      const u = user[0]; u.id = u.public_id || u._id; delete u.public_id;
      res.status(200).json({ 
        success: true, 
        message: "User updated successfully", 
        user: u 
      });
    });
  });
});

// Get user by ID
router.get("/getuserbyid/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const isNumeric = /^\d+$/.test(String(id));
  const query = isNumeric ?
    `SELECT name, title, email, role, isActive, phone, _id, public_id FROM users WHERE _id = ? LIMIT 1` :
    `SELECT name, title, email, role, isActive, phone, _id, public_id FROM users WHERE public_id = ? LIMIT 1`;
  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch user" });
    if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
    const out = results[0];
    out.id = out.public_id || out._id;
    delete out.public_id;
    res.status(200).json(out);
  });
});

// Delete user
router.delete("/delete/:user_id", requireRole('Admin'), (req, res) => {
  const { user_id } = req.params;
  const isNumeric = /^\d+$/.test(String(user_id));
  const sqlDelete = isNumeric ? `DELETE FROM users WHERE _id = ?` : `DELETE FROM users WHERE public_id = ?`;
  db.query(sqlDelete, [user_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error", error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ 
      success: true, 
      message: "User deleted successfully" 
    });
  });
});

module.exports = router;
