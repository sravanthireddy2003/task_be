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
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');

const NotificationService = require('../services/notificationService');
const errorResponse = require(__root + 'utils/errorResponse');
require('dotenv').config();
let env;
try { env = require(__root + 'config/env'); } catch (e) { env = require('../config/env'); }

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

router.use(requireAuth);

router.get("/getusers", ruleEngine(RULES.USER_LIST), requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    // Discover which columns actually exist in each table
    const colsOf = async (tbl) => {
      try {
        const r = await queryAsync("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tbl]);
        return new Set((r || []).map(c => c.COLUMN_NAME));
      } catch (e) { return new Set(); }
    };
    const tblExists = async (tbl) => {
      try {
        const r = await queryAsync("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tbl]);
        return r && r.length > 0;
      } catch (e) { return false; }
    };

    // ── Build users query dynamically ──
    const uCols = await colsOf('users');
    const hasDeptTable = await tblExists('departments');

    const uSelect = ['u._id', 'u.name', 'u.email', 'u.role', 'u.isActive'];
    if (uCols.has('public_id')) uSelect.push('u.public_id');
    if (uCols.has('title')) uSelect.push('u.title');
    if (uCols.has('phone')) uSelect.push('u.phone');
    if (uCols.has('isGuest')) uSelect.push('u.isGuest');
    if (uCols.has('department_public_id')) uSelect.push('u.department_public_id');

    let uJoin = '';
    if (hasDeptTable && uCols.has('department_public_id')) {
      const dCols = await colsOf('departments');
      if (dCols.has('public_id') && dCols.has('name')) {
        uSelect.push('d.name AS department_name');
        uJoin = 'LEFT JOIN departments d ON d.public_id = u.department_public_id';
      }
    }

    const userQuery = 'SELECT ' + uSelect.join(', ') + ' FROM users u ' + uJoin;
    const results = await queryAsync(userQuery);

    const employeeIds = (results || [])
      .filter(r => r.role === 'Employee' && r._id)
      .map(r => r._id);

    // ── Build tasks query dynamically ──
    let taskRows = [];
    if (employeeIds.length) {
      const tCols = await colsOf('tasks');
      const taCols = await colsOf('taskassignments');
      const hasProjects = await tblExists('projects');

      // Figure out the correct column names in taskassignments (case-sensitive)
      const taUserCol = taCols.has('user_id') ? 'user_id' : (taCols.has('user_Id') ? 'user_Id' : null);
      const taTaskCol = taCols.has('task_id') ? 'task_id' : (taCols.has('task_Id') ? 'task_Id' : null);

      if (taUserCol && taTaskCol) {
        const tSelect = ['ta.' + taUserCol + ' AS user_id', 't.id AS task_internal_id'];
        if (tCols.has('public_id')) tSelect.push('t.public_id AS task_public_id');
        if (tCols.has('title')) tSelect.push('t.title');
        if (tCols.has('status')) tSelect.push('t.status');
        if (tCols.has('stage')) tSelect.push('t.stage');
        if (tCols.has('priority')) tSelect.push('t.priority');
        if (tCols.has('taskDate')) tSelect.push('t.taskDate');
        if (tCols.has('project_id')) tSelect.push('t.project_id AS task_project_internal_id');
        if (tCols.has('project_public_id')) tSelect.push('t.project_public_id AS task_project_public_id');

        let tJoin = '';
        if (hasProjects && tCols.has('project_id')) {
          const pCols = await colsOf('projects');
          if (pCols.has('id')) {
            tSelect.push('p.id AS project_internal_id');
            if (pCols.has('public_id')) tSelect.push('p.public_id AS project_public_id');
            if (pCols.has('name')) tSelect.push('p.name AS project_name');
            tJoin = 'LEFT JOIN projects p ON p.id = t.project_id';
          }
        }

        const orderBy = tCols.has('updatedAt') ? 't.updatedAt' : (tCols.has('updated_at') ? 't.updated_at' : 't.id');
        const ph = employeeIds.map(() => '?').join(',');
        const taskQuery = 'SELECT ' + tSelect.join(', ') +
          ' FROM taskassignments ta' +
          ' JOIN tasks t ON t.id = ta.' + taTaskCol +
          (tJoin ? ' ' + tJoin : '') +
          ' WHERE ta.' + taUserCol + ' IN (' + ph + ')' +
          ' ORDER BY ' + orderBy + ' DESC';

        taskRows = await queryAsync(taskQuery, employeeIds);
      }
    }

    // ── Build response (same logic as before) ──
    const tasksByUser = {};
    const projectTrackers = {};
    taskRows.forEach(row => {
      if (!row || row.user_id === undefined || row.user_id === null) return;
      const userKey = String(row.user_id);
      if (!tasksByUser[userKey]) tasksByUser[userKey] = [];
      const taskPayload = {
        id: row.task_public_id ? String(row.task_public_id) : (row.task_internal_id != null ? String(row.task_internal_id) : null),
        internalId: row.task_internal_id != null ? String(row.task_internal_id) : null,
        title: row.title || null,
        status: row.status || null,
        stage: row.stage || null,
        priority: row.priority || null,
        taskDate: row.taskDate ? new Date(row.taskDate).toISOString() : null,
        project: null
      };
      const projectId = row.project_internal_id != null
        ? String(row.project_internal_id)
        : (row.task_project_internal_id != null ? String(row.task_project_internal_id) : null);
      const projectPublicId = row.project_public_id || row.task_project_public_id || null;
      if (projectId || projectPublicId) {
        taskPayload.project = {
          internalId: projectId,
          publicId: projectPublicId || null,
          name: row.project_name || null
        };
      }
      tasksByUser[userKey].push(taskPayload);

      if (!projectId && !projectPublicId) return;
      if (!projectTrackers[userKey]) {
        projectTrackers[userKey] = { set: new Set(), list: [] };
      }
      const key = projectPublicId || projectId;
      if (key && !projectTrackers[userKey].set.has(key)) {
        projectTrackers[userKey].set.add(key);
        projectTrackers[userKey].list.push({
          internalId: projectId,
          publicId: projectPublicId || null,
          name: row.project_name || null
        });
      }
    });

    const out = (results || []).map(r => {
      const isEmployee = r.role === 'Employee';
      const key = r._id ? String(r._id) : null;
      const userTasks = isEmployee && key ? (tasksByUser[key] || []) : [];
      const userProjects = isEmployee && key && projectTrackers[key]
        ? projectTrackers[key].list
        : [];
      return {
        id: r.public_id || r._id,
        name: r.name,
        title: r.title || null,
        email: r.email,
        role: r.role,
        isActive: Boolean(r.isActive),
        isGuest: r.isGuest !== undefined ? Boolean(r.isGuest) : false,
        phone: r.phone || null,
        departmentPublicId: r.department_public_id || null,
        departmentName: r.department_name || null,
        projects: userProjects,
        tasks: userTasks
      };
    });

    res.status(200).json(out);
  } catch (err) {
    logger.error('Error fetching users: ' + (err.message || err));
    logger.error('SQL details - code: ' + (err.code || 'N/A') + ', sqlMessage: ' + (err.sqlMessage || 'N/A'));
    res.status(500).json({
      error: "Failed to fetch users",
      details: err.sqlMessage || err.message || 'Unknown error',
      code: err.code || null,
      stack: err.stack
    });
  }
});

router.post('/create', ruleEngine(RULES.USER_CREATE), requireRole('Admin'), async (req, res) => {
  try {
    const { name, email, phone, role, departmentId, departmentName, title, isActive, isGuest } = req.body;

    if (!name || !email || !role || !title) {
      return res.status(400).json({ success: false, message: 'Name, email, role and title required' });
    }

    const exists = await new Promise((resolve, reject) => {
      db.query('SELECT _id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    if (exists && exists.length > 0) {
      return res.status(409).json({ success: false, message: 'User already exists with this email' });
    }

    let departmentPublicId = null;
    let resolvedDepartmentName = null;

    if (departmentId) {

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

    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    const publicId = crypto.randomBytes(8).toString('hex');

    const fields = ['public_id', 'name', 'email', 'password', 'phone', 'role'];
    const placeholders = ['?', '?', '?', '?', '?', '?'];
    const params = [publicId, name, email, hashed, phone || null, role];

    fields.push('title'); placeholders.push('?'); params.push(title);
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

    try {
      const auditController = require('./auditController');
      auditController.log({
        user_id: req.user._id,
        tenant_id: req.user.tenant_id,
        action: 'CREATE_USER',
        entity: 'User',
        entity_id: publicId,
        details: { name, email, role, title }
      });
    } catch (auditErr) {
      logger.warn('Failed to log create_user audit:', auditErr.message);
    }

    const setupToken = jwt.sign({ id: publicId, step: 'setup' }, env.JWT_SECRET || env.SECRET || 'change_this_secret', { expiresIn: '7d' });
    const setupUrlBase = env.FRONTEND_URL || env.BASE_URL;
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

router.put("/update/:id", ruleEngine(RULES.USER_UPDATE), requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive, phone, departmentId, departmentName } = req.body;

  if (!name || !email || !role) return res.status(400).json(errorResponse.badRequest('Name, email and role are required', 'MISSING_REQUIRED_FIELD', null, 'email'));

  try {

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

    // Build dynamic update
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (title !== undefined) updates.title = title;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (phone !== undefined) updates.phone = phone;
    if (departmentPublicId !== undefined) updates.department_public_id = departmentPublicId;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json(errorResponse.badRequest('No fields to update', 'NO_FIELDS_PROVIDED'));
    }

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    const sql = `UPDATE users SET ${setClause} WHERE ${isNumeric ? '_id' : 'public_id'} = ?`;

    db.query(sql, values, (err, result) => {
      if (err) {
        logger.error(`Database error updating user ${id}: ${err.message}`);
        return res.status(500).json({ success: false, message: "Database error", error: err.message });
      }
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });

      const selectSql = `
        SELECT u._id, u.public_id, u.name, u.title, u.email, u.role, u.isActive, u.phone, u.isGuest,
               u.department_public_id, d.name AS department_name
        FROM users u
        LEFT JOIN departments d ON d.public_id = u.department_public_id
        WHERE ${isNumeric ? 'u._id' : 'u.public_id'} = ? LIMIT 1
      `;
      db.query(selectSql, [id], (err, user) => {
        if (err || !user || user.length === 0) {
          try {
            const auditController = require('./auditController');
            auditController.log({
              user_id: req.user._id,
              tenant_id: req.user.tenant_id,
              action: 'UPDATE_USER',
              entity: 'User',
              entity_id: String(id),
              details: { updates }
            });
          } catch (auditErr) {
            logger.warn('Failed to log update_user audit (fallback):', auditErr.message);
          }
          return res.status(200).json({
            success: true,
            message: "User updated but could not fetch updated data",
            user: { id, name, email, role, title, isActive: Boolean(isActive), phone: phone || null, departmentPublicId, departmentName: resolvedDepartmentName }
          });
        }

        const u = user[0];
        try {
          const auditController = require('./auditController');
          auditController.log({
            user_id: req.user._id,
            tenant_id: req.user.tenant_id,
            action: 'UPDATE_USER',
            entity: 'User',
            entity_id: u.public_id || String(u._id),
            details: { name: u.name, updates }
          });
        } catch (auditErr) {
          logger.warn('Failed to log update_user audit:', auditErr.message);
        }
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

router.get("/getuserbyid/:id", ruleEngine(RULES.USER_VIEW), requireRole('Admin', 'Manager'), (req, res) => {
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

router.delete("/delete/:user_id", ruleEngine(RULES.USER_DELETE), requireRole('Admin'), (req, res) => {
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

