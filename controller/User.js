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
  const query = `
    SELECT 
      u._id, u.public_id, u.name, u.title, u.email, u.role, u.isActive, u.phone, u.isGuest,
      u.department_public_id, d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON d.public_id = u.department_public_id
  `;

  db.query(query, [], (err, results) => {
    if (err) {
      logger.error(`Error fetching users: ${err.message}`);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    const out = (results || []).map(r => ({
      id: r.public_id || r._id,
      name: r.name,
      title: r.title,
      email: r.email,
      role: r.role,
      isActive: Boolean(r.isActive),
      isGuest: Boolean(r.isGuest),
      phone: r.phone,
      departmentPublicId: r.department_public_id,
      departmentName: r.department_name
    }));

    res.status(200).json(out);
  });
});

// ✅ FIXED: Create user - Supports BOTH departmentId AND departmentName
router.post('/create', requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, phone, role, departmentId, departmentName, title, isActive, isGuest } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: 'Name, email and role required' });
    }

    // Check if user exists
    const exists = await new Promise((resolve, reject) => {
      db.query('SELECT _id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (exists && exists.length > 0) {
      return res.status(409).json({ success: false, message: 'User already exists with this email' });
    }

    // ✅ FIXED: Resolve department public_id - PRIORITIZE departmentId first
    let departmentPublicId = null;
    let resolvedDepartmentName = null;
    
    if (departmentId) {
      // Direct departmentId from frontend
      const dept = await new Promise((resolve, reject) => {
        db.query('SELECT public_id, name FROM departments WHERE public_id = ? LIMIT 1', [departmentId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      if (dept && dept.length > 0) {
        departmentPublicId = dept[0].public_id;
        resolvedDepartmentName = dept[0].name;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid department ID' });
      }
    } else if (departmentName) {
      // Fallback: departmentName lookup
      const dept = await new Promise((resolve, reject) => {
        db.query('SELECT public_id, name FROM departments WHERE name = ? LIMIT 1', [departmentName], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      if (dept && dept.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid department name' });
      }
      departmentPublicId = dept[0].public_id;
      resolvedDepartmentName = dept[0].name;
    }

    // Generate credentials
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const publicId = crypto.randomBytes(8).toString('hex');

    // Build dynamic INSERT
    const fields = ['public_id', 'name', 'email', 'password', 'phone', 'role'];
    const placeholders = ['?', '?', '?', '?', '?', '?'];
    const params = [publicId, name, email, hashed, phone || null, role];

    if (title) { fields.push('title'); placeholders.push('?'); params.push(title); }
    if (departmentPublicId) { fields.push('department_public_id'); placeholders.push('?'); params.push(departmentPublicId); }
    fields.push('isActive'); placeholders.push('?'); params.push(typeof isActive === 'undefined' ? true : Boolean(isActive));
    if (isGuest !== undefined) { fields.push('isGuest'); placeholders.push('?'); params.push(Boolean(isGuest)); }

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

    // Send welcome/setup email
    const setupToken = jwt.sign({ id: publicId, step: 'setup' }, process.env.JWT_SECRET || process.env.SECRET || 'change_this_secret', { expiresIn: '7d' });
    const setupUrlBase = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
    const setupLink = `${setupUrlBase.replace(/\/$/, '')}/setup-password?token=${encodeURIComponent(setupToken)}`;

    const tpl = emailService.welcomeTemplate({
      name,
      email,
      role,
      title: title || "Employee",
      tempPassword,
      createdBy: req.user?.name || "System Admin",
      createdAt: new Date(),
      setupLink,
      department: resolvedDepartmentName || "General"
    });

    emailService.sendEmail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html })
      .then(r => { 
        if (r.sent) logger.info(`✅ Welcome email sent to ${email}`); 
        else logger.warn(`⚠️ Welcome email not sent to ${email}`); 
      })
      .catch(err => logger.error(`❌ Failed to send welcome email to ${email}:`, err?.message));

    // Fetch created user with department info
    const selSql = `
      SELECT u._id, u.public_id, u.name, u.email, u.role, u.title, u.isActive, u.phone, u.isGuest,
             u.department_public_id, d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.public_id = u.department_public_id
      WHERE u._id = ? LIMIT 1
    `;
    db.query(selSql, [insertId], (err, saved) => {
      if (err || !saved || !saved[0]) {
        return res.status(201).json({
          success: true,
          data: {
            id: publicId, name, email, role, title: title || null,
            isActive: Boolean(isActive), phone: phone || null, tempPassword, setupToken,
            departmentPublicId, departmentName: resolvedDepartmentName
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
          departmentPublicId: user.department_public_id,
          departmentName: user.department_name || resolvedDepartmentName,
          tempPassword,
          setupToken
        }
      });
    });

  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
});

// ✅ FIXED: Update user - Supports departmentId AND departmentName
router.put("/update/:id", requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive, phone, departmentId, departmentName } = req.body;

  if (!name || !email || !role) return res.status(400).json({ success: false, message: "Name, email and role required" });

  try {
    // Resolve department public_id
    let departmentPublicId = null;
    let resolvedDepartmentName = null;
    
    if (departmentId) {
      const dept = await new Promise((resolve, reject) => {
        db.query('SELECT public_id, name FROM departments WHERE public_id = ? LIMIT 1', [departmentId], (err, rows) => err ? reject(err) : resolve(rows));
      });
      if (dept && dept.length > 0) {
        departmentPublicId = dept[0].public_id;
        resolvedDepartmentName = dept[0].name;
      }
    } else if (departmentName) {
      const dept = await new Promise((resolve, reject) => {
        db.query('SELECT public_id, name FROM departments WHERE name = ? LIMIT 1', [departmentName], (err, rows) => err ? reject(err) : resolve(rows));
      });
      if (dept && dept.length > 0) {
        departmentPublicId = dept[0].public_id;
        resolvedDepartmentName = dept[0].name;
      }
    }

    const isNumeric = /^\d+$/.test(String(id));
    const sql = isNumeric ?
      `UPDATE users SET name=?, title=?, email=?, role=?, isActive=?, phone=?, department_public_id=? WHERE _id=?` :
      `UPDATE users SET name=?, title=?, email=?, role=?, isActive=?, phone=?, department_public_id=? WHERE public_id=?`;

    const values = [name, title || null, email, role, Boolean(isActive), phone || null, departmentPublicId, id];

    db.query(sql, values, (err, result) => {
      if (err) {
        logger.error(`Database error updating user ${id}: ${err.message}`);
        return res.status(500).json({ success: false, message: "Database error", error: err.message });
      }
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });

      // Fetch updated user
      const selectSql = `
        SELECT u._id, u.public_id, u.name, u.title, u.email, u.role, u.isActive, u.phone, u.isGuest,
               u.department_public_id, d.name AS department_name
        FROM users u
        LEFT JOIN departments d ON d.public_id = u.department_public_id
        WHERE ${isNumeric ? 'u._id' : 'u.public_id'} = ? LIMIT 1
      `;
      db.query(selectSql, [id], (err, user) => {
        if (err || !user || user.length === 0) {
          return res.status(200).json({ 
            success: true, 
            message: "User updated but could not fetch updated data",
            user: { id, name, email, role, title, isActive: Boolean(isActive), phone: phone || null, departmentPublicId, departmentName: resolvedDepartmentName }
          });
        }

        const u = user[0];
        res.status(200).json({
          success: true,
          message: "User updated successfully",
          user: {
            id: u.public_id || u._id,
            name: u.name,
            email: u.email,
            role: u.role,
            title: u.title,
            isActive: u.isActive,
            phone: u.phone,
            isGuest: u.isGuest || false,
            departmentPublicId: u.department_public_id,
            departmentName: u.department_name || resolvedDepartmentName
          }
        });
      });
    });

  } catch (error) {
    logger.error('Update user error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user', error: error.message });
  }
});

// Get user by ID
router.get("/getuserbyid/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const isNumeric = /^\d+$/.test(String(id));
  const query = `
    SELECT u.name, u.title, u.email, u.role, u.isActive, u.phone, u.public_id, u.isGuest,
           u.department_public_id, d.name AS department_name
    FROM users u
    LEFT JOIN departments d ON d.public_id = u.department_public_id
    WHERE ${isNumeric ? 'u._id' : 'u.public_id'} = ?
    LIMIT 1
  `;
  db.query(query, [id], (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch user" });
    if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });

    const out = results[0];
    res.status(200).json({
      id: out.public_id,
      name: out.name,
      title: out.title,
      email: out.email,
      role: out.role,
      isActive: out.isActive,
      isGuest: out.isGuest || false,
      phone: out.phone,
      departmentPublicId: out.department_public_id,
      departmentName: out.department_name
    });
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
    return res.status(200).json({ success: true, message: "User deleted successfully" });
  });
});

module.exports = router;

