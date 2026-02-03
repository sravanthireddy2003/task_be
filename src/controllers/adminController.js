const db = require(__root + 'db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NotificationService = require('../services/notificationService');

let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../../logger'); } catch (e2) { logger = console; } }
let env;
try { env = require(global.__root + 'config/env'); } catch (e) { env = require('../config/env'); }

const MODULES_FILE = path.join(__root, 'data', 'modules.json');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function readModules() {
  try {
    if (!fs.existsSync(MODULES_FILE)) return [];
    const raw = fs.readFileSync(MODULES_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) { logger.error('readModules error', e && e.message); return []; }
}

function writeModules(arr) {
  try {
    fs.mkdirSync(path.dirname(MODULES_FILE), { recursive: true });
    fs.writeFileSync(MODULES_FILE, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (e) { logger.error('writeModules error', e && e.message); return false; }
}

function buildSelect(table, baseCols, optionalCols=[]) {
  return new Promise((resolve) => {
    db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table], (err, cols) => {
      try {
        if (err || !Array.isArray(cols) || cols.length === 0) return resolve(baseCols.join(', '));
        const present = new Set(cols.map(c => c.COLUMN_NAME));
        const colsToSelect = baseCols.concat(optionalCols.filter(c => present.has(c)));
        return resolve(colsToSelect.join(', '));
      } catch (e) {
        return resolve(baseCols.join(', '));
      }
    });
  });
}

function tableHasColumn(table, column) {
  return new Promise((resolve) => {
    db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column], (err, rows) => {
      if (err || !Array.isArray(rows)) return resolve(false);
      return resolve(rows.length > 0);
    });
  });
}

async function fetchClientDocuments(clientIds = []) {
  if (!clientIds.length) return {};
  const hasClientDoc = await tableHasColumn('client_documents', 'client_id');
  if (!hasClientDoc) return {};
  const rows = await q(
    'SELECT id, client_id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id IN (?) AND is_active = 1 ORDER BY uploaded_at DESC',
    [clientIds]
  );
  // convert stored uploads-relative paths to public URLs using configured base
  const base = env.BASE_URL || env.FRONTEND_URL;
  return (rows || []).reduce((memo, row) => {
    if (!row || row.client_id === undefined || row.client_id === null) return memo;
    if (!memo[row.client_id]) memo[row.client_id] = [];
    try {
      if (row && row.file_url && String(row.file_url).startsWith('/uploads/')) {
        const rel = String(row.file_url).replace(/^\/uploads\//, '');
        const parts = rel.split('/').map(p => encodeURIComponent(p));
        row.file_url = base + '/uploads/' + parts.join('/');
      }
    } catch (e) {}
    memo[row.client_id].push(row);
    return memo;
  }, {});
}

// helper to get column data type (e.g. 'int','varchar') at file scope
function getColumnType(table, column) {
  return new Promise((resolve) => {
    db.query("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column], (err, rows) => {
      if (err || !Array.isArray(rows) || rows.length === 0) return resolve(null);
      return resolve(rows[0].DATA_TYPE);
    });
  });
}

// retries with only columns that actually exist in the table. Calls callback(err, rows).
function safeSelect(table, baseCols, optionalCols=[], whereClause='', params=[], cb) {
  (async () => {
    try {
      const selectCols = await buildSelect(table, baseCols, optionalCols).catch(() => baseCols.join(', '));
      const sql = `SELECT ${selectCols} FROM ${table} ${whereClause || ''}`;
      return db.query(sql, params, (err, rows) => {
        if (!err) return cb(null, rows);
        if (err && err.code === 'ER_BAD_FIELD_ERROR') {
          db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table], (colErr, cols) => {
            if (colErr || !Array.isArray(cols) || cols.length === 0) return cb(err);
            const present = new Set(cols.map(c => c.COLUMN_NAME));
            const colsToSelect = baseCols.concat(optionalCols.filter(c => present.has(c))).filter(c => present.has(c));
            if (colsToSelect.length === 0) return cb(err);
            const sql2 = `SELECT ${colsToSelect.join(', ')} FROM ${table} ${whereClause || ''}`;
            return db.query(sql2, params, (err2, rows2) => cb(err2, rows2));
          });
        } else return cb(err);
      });
    } catch (e) { return cb(e); }
  })();
}

module.exports = {
  getDashboard: async (req, res) => {
    try {
      const q = (sql, params=[]) => new Promise((r, rej) => db.query(sql, params, (e, rows) => e ? rej(e) : r(rows)));

      // Log dashboard viewed
      const logData = {
        logId: `LOG-${Date.now()}`,
        action: "Dashboard Viewed",
        module: "Dashboard",
        performedBy: "Admin",
        userId: req.user ? req.user._id : null,
        tenantId: req.user ? req.user.tenant_id : null,
        ipAddress: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
      logger.info(JSON.stringify(logData));
      try {
        await q("INSERT INTO audit_logs (action, module, performed_by, user_id, tenant_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)", 
          [logData.action, logData.module, logData.performedBy, logData.userId, logData.tenantId, logData.ipAddress, logData.timestamp]);
      } catch (e) {
      }

      // Dashboard Metrics
      const totalClients = (await q("SELECT COUNT(*) as c FROM clientss WHERE isDeleted IS NULL OR isDeleted != 1"))[0].c || 0;
      const totalTasks = (await q("SELECT COUNT(*) as c FROM tasks WHERE LOWER(status) NOT IN ('closed')"))[0].c || 0;
      const pendingTasks = (await q("SELECT COUNT(*) as c FROM tasks WHERE LOWER(status) IN ('pending', 'not started') AND LOWER(status) != 'closed'"))[0].c || 0;
      // use `taskDate` as the due date field (some schemas use taskDate instead of due_date)
      const overdueTasks = (await q("SELECT COUNT(*) as c FROM tasks WHERE taskDate < CURDATE() AND LOWER(status) NOT IN ('completed', 'closed')"))[0].c || 0;
      const completedToday = (await q("SELECT COUNT(*) as c FROM tasks WHERE DATE(completed_at) = CURDATE() AND LOWER(status) = 'completed'"))[0].c || 0;
      const activeProjects = (await q("SELECT COUNT(DISTINCT p.id) as c FROM projects p INNER JOIN tasks t ON p.id = t.project_id WHERE p.is_active = 1 AND DATE(t.taskDate) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND LOWER(t.status) != 'closed'"))[0].c || 0;

      // Task Distribution
      const taskStatusRows = await q("SELECT LOWER(status) as s, COUNT(*) as c FROM tasks WHERE LOWER(status) != 'closed' GROUP BY status");
      const total = taskStatusRows.reduce((sum, r) => sum + r.c, 0);
      const taskDistribution = [
        { name: "Completed", value: total > 0 ? Math.round((taskStatusRows.find(r => r.s === 'completed')?.c || 0) / total * 100) : 0, color: "#10B981" },
        { name: "In Progress", value: total > 0 ? Math.round((taskStatusRows.find(r => r.s === 'in progress')?.c || 0) / total * 100) : 0, color: "#3B82F6" },
        { name: "Not Started", value: total > 0 ? Math.round((taskStatusRows.find(r => r.s === 'not started')?.c || 0) / total * 100) : 0, color: "#F59E0B" },
        { name: "Overdue", value: total > 0 ? Math.round(overdueTasks / total * 100) : 0, color: "#EF4444" }
      ];

      // Weekly Trends (last 7 days) - with actual task details
      const weeklyRows = await q("SELECT DATE(createdAt) as day, COUNT(*) as tasks FROM tasks WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND LOWER(status) != 'closed' GROUP BY DATE(createdAt) ORDER BY day");

      // Get actual task details for each day
      const taskDetailsRows = await q(`
        SELECT
          DATE(createdAt) as day,
          id,
          title,
          status,
          DATE(taskDate) as dueDate
        FROM tasks
        WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
          AND LOWER(status) != 'closed'
        ORDER BY createdAt DESC
      `);

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weeklyTrends = days.map((day, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dayStr = date.toISOString().split('T')[0];
        const row = weeklyRows.find(r => r.day === dayStr);
        const tasks = row ? row.tasks : 0;

        // Get tasks for this specific day
        const dayTasks = taskDetailsRows.filter(t => t.day === dayStr).map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null
        }));

        let color = "#F59E0B"; // Low Activity
        let status = "Low Activity";
        if (tasks >= 8) {
          color = "#10B981"; // High Activity
          status = "High Activity";
        } else if (tasks >= 5) {
          color = "#3B82F6"; // Medium Activity
          status = "Medium Activity";
        }

        return {
          day,
          tasks,
          color,
          status,
          tasksList: dayTasks
        };
      });

      // Top Employees
      const employeeRows = await q(`
        SELECT u.name, COUNT(CASE WHEN LOWER(t.status) = 'completed' THEN 1 END) as completed, COUNT(CASE WHEN LOWER(t.status) = 'in progress' THEN 1 END) as inProgress
        FROM users u
        LEFT JOIN taskassignments ta ON u._id = ta.user_Id
        LEFT JOIN tasks t ON ta.task_id = t.id
        WHERE u.role = 'employee' AND (t.id IS NULL OR LOWER(t.status) != 'closed')
        GROUP BY u._id, u.name
        ORDER BY completed DESC, inProgress DESC
        LIMIT 4
      `);
      const topEmployees = employeeRows.map(r => ({ name: r.name, completed: r.completed, inProgress: r.inProgress }));

      // Client Workload
      const clientRows = await q(`
        SELECT c.name as client, COUNT(t.id) as tasks
        FROM clientss c
        LEFT JOIN projects p ON c.id = p.client_id AND p.is_active = 1
        LEFT JOIN tasks t ON p.id = t.project_id AND LOWER(t.status) != 'closed'
        WHERE c.isDeleted IS NULL OR c.isDeleted != 1
        GROUP BY c.id, c.name
        ORDER BY tasks DESC
        LIMIT 4
      `);
      const maxTasks = clientRows.length ? Math.max(...clientRows.map(r => r.tasks)) : 1;
      const clientWorkload = clientRows.map(r => ({ client: r.client, workload: maxTasks ? r.tasks / maxTasks : 0 }));

      // Recent Activities
      const recentTasks = await q("SELECT id, title, status, priority, taskDate FROM tasks WHERE LOWER(status) != 'closed' ORDER BY createdAt DESC LIMIT 2");
      const recentActivities = recentTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority || 'Medium',
        dueDate: t.taskDate
      }));

      // Active Projects
      const projectRows = await q(`
        SELECT p.id, p.name, COUNT(t.id) as tasks, c.name as client
        FROM projects p
        LEFT JOIN tasks t ON p.id = t.project_id AND LOWER(t.status) != 'closed'
        LEFT JOIN clientss c ON p.client_id = c.id
        WHERE p.is_active = 1 AND (c.isDeleted IS NULL OR c.isDeleted != 1)
        GROUP BY p.id, p.name, c.name
        HAVING tasks > 0
        ORDER BY tasks DESC
        LIMIT 4
      `);
      const activeProjectsData = projectRows.map(p => ({
        id: p.id,
        name: p.name,
        progress: 65, // Placeholder
        budget: "$87,500 / $150,000", // Placeholder
        client: p.client || 'Unknown',
        members: 3 // Placeholder
      }));

      const requestId = `REQ-${Math.floor(Math.random() * 100000)}`;
      const timestamp = new Date().toISOString();

      return res.json({
        status: 'success',
        data: {
          dashboardMetrics: {
            totalClients: totalClients,
            totalTasks: totalTasks,
            pendingTasks: pendingTasks,
            overdueTasks: overdueTasks,
            completedToday: completedToday,
            activeProjects: activeProjects
          },
          taskDistribution: taskDistribution,
          weeklyTrends: weeklyTrends,
          topEmployees: topEmployees,
          clientWorkload: clientWorkload,
          recentActivities: recentActivities,
          activeProjects: activeProjectsData
        },
        requestId,
        timestamp
      });
    } catch (e) {
      logger.error('Dashboard error:', e && e.message ? e.message : e);
      logger.error('Error stack:', e && e.stack ? e.stack : e);
      return res.status(500).json({
        status: "error",
        message: "Unable to load dashboard data",
        errorCode: "DASHBOARD_FETCH_FAILED",
        requestId: `REQ-${Math.floor(Math.random() * 100000)}`
      });
    }
  },

  manageUsers: async (req, res) => {
    const cols = await buildSelect('users', ['_id','public_id','name','email','role','isActive'], ['tenant_id']).catch(() => '_id, public_id, name, email, role, isActive');
    db.query(`SELECT ${cols} FROM users`, [], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      const out = rows.map(r => { r.id = r.public_id || r._id; delete r.public_id; return r; });
      res.json({ success: true, data: out });
    });
  },

  manageClients: async (req, res) => {

    const filterUserParam = req.query.userId;
    const baseCols = ['id', 'ref', 'name', 'company'];
    const optionalCols = ['public_id', 'email', 'phone', 'status', 'created_at', 'manager_id', 'tenant_id'];
    const selectCols = await buildSelect('clientss', baseCols, optionalCols).catch(() => baseCols.join(', '));

    const queryClients = async (whereClause = '', params = []) => {
      const clause = whereClause ? ` ${whereClause}` : '';
      return await q(`SELECT ${selectCols} FROM clientss${clause}`, params);
    };

    const enrich = async (rows = []) => {
      if (!Array.isArray(rows)) return [];
      const clientIds = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));
      const documentsByClient = await fetchClientDocuments(clientIds);
      const managerIds = Array.from(
        new Set(
          rows
            .map((r) => (r.manager_id ? String(r.manager_id) : null))
            .filter(Boolean)
        )
      );
      let managerMap = {};
      if (managerIds.length) {
        const mgrRows = await q(
          'SELECT _id, public_id, name FROM users WHERE _id IN (?) OR public_id IN (?)',
          [managerIds, managerIds]
        );
        mgrRows.forEach((mgr) => {
          if (!mgr) return;
          const keyId = mgr._id ? String(mgr._id) : null;
          const keyPublic = mgr.public_id ? String(mgr.public_id) : null;
          const entry = { public_id: mgr.public_id || null, name: mgr.name || null };
          if (keyId) managerMap[keyId] = entry;
          if (keyPublic) managerMap[keyPublic] = entry;
        });
      }
      const hasPublicIdCol = await tableHasColumn('clientss', 'public_id');
      return rows.map((row) => {
        const normalizedClientId = hasPublicIdCol ? row.public_id || row.id : row.id;
        const clientKey = row.manager_id ? String(row.manager_id) : null;
        const managerInfo = clientKey ? managerMap[clientKey] : null;
        return {
          id: normalizedClientId || row.id,
          ref: row.ref || null,
          name: row.name || null,
          company: row.company || null,
          email: row.email || null,
          phone: row.phone || null,
          status: row.status || null,
          created_at: row.created_at || null,
          manager_id: row.manager_id || null,
          manager_public_id: managerInfo ? managerInfo.public_id : null,
          manager_name: managerInfo ? managerInfo.name : null,
          documents: documentsByClient[row.id] || []
        };
      });
    };

    const runQuery = async (resolvedUserId) => {
      let whereClause = '';
      const params = [];
      if (resolvedUserId) {
        const filterColumns = [];
        for (const col of ['created_by', 'user_id']) {
          if (await tableHasColumn('clientss', col)) filterColumns.push(col);
        }
        if (filterColumns.length) {
          whereClause = `WHERE ${filterColumns.map((n) => `${n} = ?`).join(' OR ')}`;
          params.push(...filterColumns.map(() => resolvedUserId));
        }
      }
      const rows = await queryClients(whereClause, params);
      const payload = await enrich(rows);
      return res.json({ success: true, data: payload });
    };

    if (filterUserParam) {
      if (/^\d+$/.test(String(filterUserParam))) {
        return runQuery(filterUserParam);
      }
      const users = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam]);
      if (!Array.isArray(users) || users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found for provided userId' });
      }
      return runQuery(users[0]._id);
    }

    return runQuery(null);
  },

  manageDepartments: async (req, res) => {
    const filterUserParam = req.query.userId;

    const runQuery = async (resolvedUserId) => {
    const hasPublic = await tableHasColumn('departments', 'public_id');
    const optional = [].concat(hasPublic ? ['public_id'] : []).concat(['manager_id','head_id']);
    safeSelect('departments', ['id','name','created_at'], optional, '', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const finishWith = (outRows) => {
          try {
            const userIds = Array.from(new Set((outRows || []).map(r => r.manager_id).concat((outRows || []).map(r => r.head_id)).filter(Boolean)));
            if (userIds.length === 0) return res.json({ success: true, data: outRows });
            db.query('SELECT _id, public_id, name FROM users WHERE _id IN (?) OR public_id IN (?)', [userIds, userIds], (uErr, uRows) => {
              if (uErr || !Array.isArray(uRows)) return res.json({ success: true, data: outRows });
              const mapId = {};
              const mapName = {};
              uRows.forEach(u => {
                // map by internal id and public_id so we can match whichever is stored on departments
                if (u._id) mapId[String(u._id)] = u.public_id || String(u._id);
                if (u.public_id) mapId[String(u.public_id)] = u.public_id || String(u._id);
                if (u._id) mapName[String(u._id)] = u.name || null;
                if (u.public_id) mapName[String(u.public_id)] = u.name || null;
              });
              const out = outRows.map(r => ({
                ...r,
                id: r.public_id || r.id,
                manager_id: r.manager_id ? (mapId[String(r.manager_id)] || r.manager_id) : null,
                manager_name: r.manager_name ? r.manager_name : (r.manager_id ? (mapName[String(r.manager_id)] || null) : null),
                head_id: r.head_id ? (mapId[String(r.head_id)] || r.head_id) : null,
                head_name: r.head_name ? r.head_name : (r.head_id ? (mapName[String(r.head_id)] || null) : null)
              }));
              return res.json({ success: true, data: out });
            });
          } catch (e) {
            return res.json({ success: true, data: outRows });
          }
        };

        if (!resolvedUserId) return finishWith(rows);
        db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'departments' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('head_id','manager_id','created_by','user_id')", [], (colErr, cols) => {
          if (colErr || !Array.isArray(cols) || cols.length === 0) return finishWith(rows);
          const colNames = cols.map(c => c.COLUMN_NAME);
          const whereParts = colNames.map(n => `${n} = ?`).join(' OR ');
          const params = colNames.map(() => resolvedUserId);
          const hasPublic2 = colNames.includes('public_id');
          const optional2 = [].concat(hasPublic2 ? ['public_id'] : []).concat(['manager_id','head_id']);
          // include created_at when selecting filtered rows as well
          safeSelect('departments', ['id','name','created_at'], optional2, `WHERE ${whereParts}`, params, (fErr, fRows) => {
            if (fErr) return finishWith(rows);
            return finishWith(fRows);
          });
        });
      });
    };

    if (filterUserParam) {
      const isNumeric = /^\d+$/.test(String(filterUserParam));
      if (isNumeric) { runQuery(filterUserParam); return; }
      db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'User not found for provided userId' });
        runQuery(rows[0]._id);
      });
      return;
    }

    runQuery(null);
  },

  // Create a new department (Admin)
  createDepartment: async (req, res) => {
    try {
      const { name, managerId, headId } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Department name required' });
      // managerId is required
      if (!managerId) return res.status(400).json({ success: false, message: 'managerId is required' });

      const resolveUser = (rawId) => new Promise((resolve, reject) => {
        if (!rawId) return resolve(null);
        if (/^\d+$/.test(String(rawId))) return resolve(rawId);
        db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [rawId], (e, rows) => {
          if (e) return reject(e);
          if (!rows || rows.length === 0) return resolve(null);
          return resolve(rows[0]._id);
        });
      });

      // helper to get column data type (e.g. 'int','varchar')
      const getColumnType = (table, column) => new Promise((resolve) => {
        db.query("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column], (err, rows) => {
          if (err || !Array.isArray(rows) || rows.length === 0) return resolve(null);
          return resolve(rows[0].DATA_TYPE);
        });
      });

      // detect which optional columns exist before building INSERT
      const hasManager = await tableHasColumn('departments', 'manager_id');
      const hasHead = await tableHasColumn('departments', 'head_id');
      const hasCreatedBy = await tableHasColumn('departments', 'created_by');
      const hasPublic = await tableHasColumn('departments', 'public_id');
      const hasManagerNameCol = await tableHasColumn('departments', 'manager_name');
      const hasHeadNameCol = await tableHasColumn('departments', 'head_name');

      let manager_id = null;
      let head_id = null;
      let manager_name_val = null;
      let head_name_val = null;
      if (hasManager) {
        manager_id = await resolveUser(managerId).catch(() => null);
        if (req.body) {
          if (req.body.managerName) manager_name_val = String(req.body.managerName).trim();
          else if (req.body.manager_name) manager_name_val = String(req.body.manager_name).trim();
        }
        if ((manager_id === null || manager_id === undefined) && managerId) {
          const colType = await getColumnType('departments', 'manager_id').catch(() => null);
          if (colType && ['varchar','char','text'].includes(String(colType).toLowerCase())) {
            manager_id = managerId;
          } else {
            return res.status(400).json({ success: false, message: 'managerId could not be resolved to a user' });
          }
        }
      }
      if (hasHead) {
        head_id = await resolveUser(headId).catch(() => null);
        if (req.body) {
          if (req.body.headName) head_name_val = String(req.body.headName).trim();
          else if (req.body.head_name) head_name_val = String(req.body.head_name).trim();
        }
        if ((head_id === null || head_id === undefined) && headId) {
          const colType = await getColumnType('departments', 'head_id').catch(() => null);
          if (colType && ['varchar','char','text'].includes(String(colType).toLowerCase())) head_id = headId;
        }
      }
      const created_by = hasCreatedBy ? (req.user && req.user._id ? req.user._id : null) : null;

      const publicId = hasPublic ? crypto.randomBytes(8).toString('hex') : null;
      const fields = ['name'];
      const placeholders = ['?'];
      const params = [name];
      if (hasManager) { fields.push('manager_id'); placeholders.push('?'); params.push(manager_id); }
      if (hasManagerNameCol) { fields.push('manager_name'); placeholders.push('?'); params.push(manager_name_val); }
      if (hasHead) { fields.push('head_id'); placeholders.push('?'); params.push(head_id); }
      if (hasHeadNameCol) { fields.push('head_name'); placeholders.push('?'); params.push(head_name_val); }
      if (hasCreatedBy) { fields.push('created_by'); placeholders.push('?'); params.push(created_by); }
      if (hasPublic) { fields.unshift('public_id'); placeholders.unshift('?'); params.unshift(publicId); }
      const sql = `INSERT INTO departments (${fields.join(', ')}, created_at) VALUES (${placeholders.join(', ')}, NOW())`;
      logger.info('createDepartment insert:', sql, params);
      db.query(sql, params, (err, result) => {
        if (err) {
          logger.error('createDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        const insertId = result && result.insertId ? result.insertId : null;
        if (!insertId) return res.status(201).json({ success: true, data: { id: insertId, name, manager_id, head_id } });
        (async () => {
          try {
            await NotificationService.createAndSendToRoles(['Admin'], 'Department Created', `New department "${name}" has been created`, 'DEPARTMENT_CREATED', 'department', insertId, req.user ? req.user.tenant_id : null);
          } catch (notifErr) {
            logger.error('Department creation notification error:', notifErr);
          }
          const selOptional = [].concat(hasPublic ? ['public_id'] : [])
            .concat(['manager_id','head_id'])
            .concat(hasManagerNameCol ? ['manager_name'] : [])
            .concat(hasHeadNameCol ? ['head_name'] : []);
          safeSelect('departments', ['id','name'], selOptional, 'WHERE id = ? LIMIT 1', [insertId], (sErr, rows) => {
            if (sErr) return res.status(201).json({ success: true, data: { id: hasPublic ? publicId : insertId, name, manager_id, head_id } });
          const row = (rows && rows[0]) || { id: insertId, name, manager_id, head_id, public_id: publicId, manager_name: manager_name_val, head_name: head_name_val };
          if ((row.manager_name || row.head_name) && (row.manager_name || row.head_name).length >= 0) {
            const outRow = {
              id: row.public_id || row.id,
              name: row.name,
              manager_id: row.manager_id ? String(row.manager_id) : null,
              manager_name: row.manager_name || null,
              head_id: row.head_id ? String(row.head_id) : null,
              head_name: row.head_name || null
            };
            const uids = [];
            if (row.manager_id) uids.push(row.manager_id);
            if (row.head_id) uids.push(row.head_id);
            if (uids.length === 0) return res.status(201).json({ success: true, data: outRow });
            db.query('SELECT _id, public_id, name FROM users WHERE _id IN (?) OR public_id IN (?)', [uids, uids], (uErr, uRows) => {
              if (uErr || !Array.isArray(uRows)) return res.status(201).json({ success: true, data: outRow });
              const mapId = {};
              uRows.forEach(u => {
                if (u._id) mapId[String(u._id)] = u.public_id || String(u._id);
                if (u.public_id) mapId[String(u.public_id)] = u.public_id || String(u._id);
              });
              outRow.manager_id = row.manager_id ? (mapId[String(row.manager_id)] || String(row.manager_id)) : null;
              outRow.head_id = row.head_id ? (mapId[String(row.head_id)] || String(row.head_id)) : null;
              return res.status(201).json({ success: true, data: outRow });
            });
          } else {
            // fallback to resolving names from users
            const uids = [];
            if (row.manager_id) uids.push(row.manager_id);
            if (row.head_id) uids.push(row.head_id);
            if (uids.length === 0) return res.status(201).json({ success: true, data: { id: row.public_id || row.id, name: row.name, manager_id: row.manager_id, manager_name: null, head_id: row.head_id, head_name: null } });
            db.query('SELECT _id, public_id, name FROM users WHERE _id IN (?) OR public_id IN (?)', [uids, uids], (uErr, uRows) => {
              if (uErr || !Array.isArray(uRows)) return res.status(201).json({ success: true, data: { id: row.public_id || row.id, name: row.name, manager_id: row.manager_id, manager_name: null, head_id: row.head_id, head_name: null } });
              const mapId = {};
              const mapName = {};
              uRows.forEach(u => {
                if (u._id) mapId[String(u._id)] = u.public_id || String(u._id);
                if (u.public_id) mapId[String(u.public_id)] = u.public_id || String(u._id);
                if (u._id) mapName[String(u._id)] = u.name || null;
                if (u.public_id) mapName[String(u.public_id)] = u.name || null;
              });
              const outRow = {
                id: row.public_id || row.id,
                name: row.name,
                manager_id: row.manager_id ? (mapId[String(row.manager_id)] || row.manager_id) : null,
                manager_name: row.manager_name ? row.manager_name : (row.manager_id ? (mapName[String(row.manager_id)] || null) : null),
                head_id: row.head_id ? (mapId[String(row.head_id)] || row.head_id) : null,
                head_name: row.head_name ? row.head_name : (row.head_id ? (mapName[String(row.head_id)] || null) : null)
              };
              return res.status(201).json({ success: true, data: outRow });
            });
          }
        });
          })();
      });
    } catch (e) {
      logger.error('createDepartment catch', e && e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  // Update an existing department
  updateDepartment: async (req, res) => {
    try {
      let { id } = req.params;
      if (!id) return res.status(400).json({ success: false, message: 'Department id required' });
      if (!/^\d+$/.test(String(id))) {
        const rows = await new Promise((resolve) => db.query('SELECT id FROM departments WHERE public_id = ? LIMIT 1', [id], (e, r) => e ? resolve([]) : resolve(r)));
        if (!rows || !rows[0]) return res.status(404).json({ success: false, message: 'Department not found' });
        id = rows[0].id;
      }
      const { name, managerId, headId } = req.body;

      const resolveUser = (rawId) => new Promise((resolve, reject) => {
        if (!rawId) return resolve(null);
        if (/^\d+$/.test(String(rawId))) return resolve(rawId);
        db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [rawId], (e, rows) => {
          if (e) return reject(e);
          if (!rows || rows.length === 0) return resolve(null);
          return resolve(rows[0]._id);
        });
      });

      const updates = [];
      const params = [];
      const hasManagerCol = await tableHasColumn('departments', 'manager_id');
      const hasHeadCol = await tableHasColumn('departments', 'head_id');
      if (name) { updates.push('name = ?'); params.push(name); }
      if (managerId !== undefined && hasManagerCol) {
        const m = await resolveUser(managerId).catch(() => null);
        let finalM = m;
        if ((finalM === null || finalM === undefined) && managerId) {
          const colType = await getColumnType('departments', 'manager_id').catch(() => null);
          if (colType && ['varchar','char','text'].includes(String(colType).toLowerCase())) finalM = managerId;
        }
        updates.push('manager_id = ?'); params.push(finalM);
      }
      if (headId !== undefined && hasHeadCol) {
        const h = await resolveUser(headId).catch(() => null);
        let finalH = h;
        if ((finalH === null || finalH === undefined) && headId) {
          const colType = await getColumnType('departments', 'head_id').catch(() => null);
          if (colType && ['varchar','char','text'].includes(String(colType).toLowerCase())) finalH = headId;
        }
        updates.push('head_id = ?'); params.push(finalH);
      }

      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });
      const sql = `UPDATE departments SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`;
      params.push(id);
      db.query(sql, params, (err, result) => {
        if (err) {
          logger.error('updateDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
        (async () => {
          try {
            await NotificationService.createAndSendToRoles(['Admin'], 'Department Updated', `Department "${name || 'Unknown'}" has been updated`, 'DEPARTMENT_UPDATED', 'department', id, req.user ? req.user.tenant_id : null);
          } catch (notifErr) {
            logger.error('Department update notification error:', notifErr);
          }
          const hasPublic = await tableHasColumn('departments', 'public_id');
          const selOptional = [].concat(hasPublic ? ['public_id'] : []).concat(['manager_id','head_id']);
          safeSelect('departments', ['id','name'], selOptional, 'WHERE id = ? LIMIT 1', [id], (sErr, rows) => {
            if (sErr) return res.status(200).json({ success: true, message: 'Department updated' });
            const row = (rows && rows[0]) || {};
          const uids = [];
          if (row.manager_id) uids.push(row.manager_id);
          if (row.head_id) uids.push(row.head_id);
          if (uids.length === 0) return res.status(200).json({ success: true, data: { id: row.public_id || row.id, name: row.name, manager_id: row.manager_id, manager_name: null, head_id: row.head_id, head_name: null } });
          db.query('SELECT _id, public_id, name FROM users WHERE _id IN (?) OR public_id IN (?)', [uids, uids], (uErr, uRows) => {
            if (uErr || !Array.isArray(uRows)) return res.status(200).json({ success: true, data: { id: row.public_id || row.id, name: row.name, manager_id: row.manager_id, manager_name: null, head_id: row.head_id, head_name: null } });
            const mapId = {};
            const mapName = {};
            uRows.forEach(u => {
              if (u._id) mapId[String(u._id)] = u.public_id || String(u._id);
              if (u.public_id) mapId[String(u.public_id)] = u.public_id || String(u._id);
              if (u._id) mapName[String(u._id)] = u.name || null;
              if (u.public_id) mapName[String(u.public_id)] = u.name || null;
            });
            const outRow = {
              id: row.public_id || row.id,
              name: row.name,
              manager_id: row.manager_id ? (mapId[String(row.manager_id)] || row.manager_id) : null,
              manager_name: row.manager_id ? (mapName[String(row.manager_id)] || null) : null,
              head_id: row.head_id ? (mapId[String(row.head_id)] || row.head_id) : null,
              head_name: row.head_id ? (mapName[String(row.head_id)] || null) : null
            };
            return res.status(200).json({ success: true, data: outRow });
          });
          });
        })();
      });
    } catch (e) {
      logger.error('updateDepartment catch', e && e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  // Delete a department
  deleteDepartment: (req, res) => {
    let { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'Department id required' });
    if (!/^\d+$/.test(String(id))) {
      db.query('DELETE FROM departments WHERE public_id = ?', [id], (err, result) => {
        if (err) {
          logger.error('deleteDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
        (async () => {
          try {
            await NotificationService.createAndSendToRoles(['Admin'], 'Department Deleted', `Department with ID "${id}" has been deleted`, 'DEPARTMENT_DELETED', 'department', id, req.user ? req.user.tenant_id : null);
          } catch (notifErr) {
            logger.error('Department delete notification error:', notifErr);
          }
        })();
        (async () => {
          try {
            await NotificationService.createAndSendToRoles(['Admin'], 'Department Deleted', `Department with ID "${id}" has been deleted`, 'DEPARTMENT_DELETED', 'department', id, req.user ? req.user.tenant_id : null);
          } catch (notifErr) {
            logger.error('Department delete notification error:', notifErr);
          }
        })();
        return res.json({ success: true, message: 'Department deleted' });
      });
      return;
    }
    db.query('DELETE FROM departments WHERE id = ?', [id], (err, result) => {
      if (err) {
        logger.error('deleteDepartment error', err && err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
      return res.json({ success: true, message: 'Department deleted' });
    });
  },

  manageProjects: async (req, res) => {
    const filterUserParam = req.query.userId;

    const runQuery = async (resolvedUserId) => {
      safeSelect('projects', ['id','name','description','status','manager_id'], ['tenant_id'], '', [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        // map manager_id to public_id when possible
        try {
          const managerIds = new Set();
          rows.forEach(r => { if (r.manager_id) managerIds.add(r.manager_id); });
            if (managerIds.size === 0) {
              // optionally filter by resolvedUserId
              if (resolvedUserId) {
                const filtered = rows.filter(r => String(r.manager_id) === String(resolvedUserId));
                return res.json({ success: true, data: filtered });
              }
              return res.json({ success: true, data: rows });
            }
          db.query('SELECT _id, public_id FROM users WHERE _id IN (?)', [Array.from(managerIds)], (uErr, uRows) => {
            if (uErr) return res.json({ success: true, data: rows });
            const map = {};
            uRows.forEach(u => { if (u && u._id) map[u._id] = u.public_id || u._id; });
            let out = rows.map(r => ({ ...r, manager_id: map[r.manager_id] || r.manager_id }));
            if (resolvedUserId) out = out.filter(r => String(r.manager_id) === String(map[resolvedUserId] || resolvedUserId));
            return res.json({ success: true, data: out });
          });
        } catch (e) {
          return res.json({ success: true, data: rows });
        }
      });
    };

    if (filterUserParam) {
      const isNumeric = /^\d+$/.test(String(filterUserParam));
      if (isNumeric) { runQuery(filterUserParam); return; }
      db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'User not found for provided userId' });
        runQuery(rows[0]._id);
      });
      return;
    }

    runQuery(null);
  },

  manageTasks: async (req, res) => {
    safeSelect(
      'tasks',
      ['id','title','description','status','assigned_to'],
      ['tenant_id','taskDate','started_at','live_timer','total_duration','completed_at','time_alloted','priority','stage'],
      '',
      [],
      (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      try {
        const userIdSet = new Set();
        rows.forEach(r => {
          if (!r.assigned_to) return;
          try {
            const arr = typeof r.assigned_to === 'string' ? JSON.parse(r.assigned_to) : r.assigned_to;
            if (Array.isArray(arr)) arr.forEach(id => userIdSet.add(id));
          } catch (e) {
            const parts = String(r.assigned_to).split(',').map(s=>s.trim()).filter(Boolean);
            parts.forEach(id => userIdSet.add(id));
          }
        });

        if (userIdSet.size === 0) return res.json({ success: true, data: rows });
        const idsArr = Array.from(userIdSet);
        db.query('SELECT _id, public_id FROM users WHERE _id IN (?)', [idsArr], (uErr, uRows) => {
          if (uErr || !Array.isArray(uRows)) return res.json({ success: true, data: rows });
          const map = {};
          uRows.forEach(u => { if (u && u._id) map[u._id] = u.public_id || u._id; });
          const out = rows.map(r => {
            if (!r.assigned_to) return r;
            try {
              const arr = typeof r.assigned_to === 'string' ? JSON.parse(r.assigned_to) : r.assigned_to;
              if (Array.isArray(arr)) { r.assigned_to = arr.map(id => map[id] || id); return r; }
            } catch (e) {
              const parts = String(r.assigned_to).split(',').map(s=>s.trim()).filter(Boolean);
              r.assigned_to = parts.map(id => map[id] || id);
              // enrich time/summary fields
              try {
                const now = new Date();
                const taskDate = r.taskDate ? new Date(r.taskDate) : null;
                const totalSecs = Number(r.total_duration || 0);
                const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
                const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
                const ss = String(totalSecs % 60).padStart(2, '0');
                r.started_at = r.started_at ? new Date(r.started_at).toISOString() : null;
                r.live_timer = r.live_timer ? new Date(r.live_timer).toISOString() : null;
                r.total_time_seconds = totalSecs;
                r.total_time_hours = Number((totalSecs / 3600).toFixed(2));
                r.total_time_hhmmss = `${hh}:${mm}:${ss}`;
                r.summary = taskDate ? { dueStatus: taskDate < now ? 'Overdue' : 'On Time', dueDate: taskDate.toISOString() } : {};
              } catch (er) { /* silent */ }
              return r;
            }
            // normal path: enrich as well
            try {
              const now = new Date();
              const taskDate = r.taskDate ? new Date(r.taskDate) : null;
              const totalSecs = Number(r.total_duration || 0);
              const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
              const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
              const ss = String(totalSecs % 60).padStart(2, '0');
              r.started_at = r.started_at ? new Date(r.started_at).toISOString() : null;
              r.live_timer = r.live_timer ? new Date(r.live_timer).toISOString() : null;
              r.total_time_seconds = totalSecs;
              r.total_time_hours = Number((totalSecs / 3600).toFixed(2));
              r.total_time_hhmmss = `${hh}:${mm}:${ss}`;
              r.summary = taskDate ? { dueStatus: taskDate < now ? 'Overdue' : 'On Time', dueDate: taskDate.toISOString() } : {};
            } catch (er) { /* silent */ }
            return r;
          });
          // Attach checklist and activityTimeline similar to manager/employee responses
          try {
            const taskIds = out.map(r => r.id).filter(Boolean);
            if (!taskIds.length) return res.json({ success: true, data: out });

            db.query(
              'SELECT id, task_id, title, description, due_date, tag, created_at, updated_at, status, estimated_hours, completed_at FROM subtasks WHERE task_id IN (?)',
              [taskIds],
              (scErr, scRows) => {
                if (scErr) return res.json({ success: true, data: out });
                const checklistMap = {};
                (scRows || []).forEach(subtask => {
                  if (!subtask || subtask.task_id === undefined || subtask.task_id === null) return;
                  const key = String(subtask.task_id);
                  if (!checklistMap[key]) checklistMap[key] = [];
                  checklistMap[key].push({
                    id: subtask.id != null ? String(subtask.id) : null,
                    title: subtask.title || null,
                    description: subtask.description || null,
                    status: subtask.status || null,
                    dueDate: subtask.due_date ? new Date(subtask.due_date).toISOString() : null,
                    completedAt: subtask.completed_at ? new Date(subtask.completed_at).toISOString() : null,
                    createdAt: subtask.created_at ? new Date(subtask.created_at).toISOString() : null,
                    updatedAt: subtask.updated_at ? new Date(subtask.updated_at).toISOString() : null,
                    tag: subtask.tag || null,
                    estimatedHours: subtask.estimated_hours != null ? Number(subtask.estimated_hours) : null
                  });
                });

                db.query(
                  `SELECT ta.task_id, ta.type, ta.activity, ta.createdAt, u._id AS user_id, u.name AS user_name
                   FROM task_activities ta
                   LEFT JOIN users u ON ta.user_id = u._id
                   WHERE ta.task_id IN (?)
                   ORDER BY ta.createdAt DESC`,
                  [taskIds],
                  (taErr, taRows) => {
                    const activityMap = {};
                    if (!taErr && Array.isArray(taRows)) {
                      (taRows || []).forEach(activity => {
                        if (!activity || activity.task_id === undefined || activity.task_id === null) return;
                        const key = String(activity.task_id);
                        if (!activityMap[key]) activityMap[key] = [];
                        activityMap[key].push({
                          type: activity.type || null,
                          activity: activity.activity || null,
                          createdAt: activity.createdAt ? new Date(activity.createdAt).toISOString() : null,
                          user: activity.user_id ? { id: String(activity.user_id), name: activity.user_name || null } : null
                        });
                      });
                    }

                    const final = out.map(r => {
                      const key = String(r.id);
                      r.checklist = checklistMap[key] || [];
                      r.activityTimeline = activityMap[key] || [];
                      return r;
                    });
                    return res.json({ success: true, data: final });
                  }
                );
              }
            );
          } catch (e) {
            return res.json({ success: true, data: out });
          }
        });
      } catch (e) {
        return res.json({ success: true, data: rows });
      }
    });
  },

  // Modules CRUD (file-backed simple store)
  getModules: (req, res) => {
    const modules = readModules();
    return res.json({ success: true, data: modules });
  },

  getModuleById: (req, res) => {
    const { id } = req.params;
    const modules = readModules();
    const m = modules.find(x => x.moduleId === id);
    if (!m) return res.status(404).json({ success: false, message: 'Module not found' });
    return res.json({ success: true, data: m });
  },

  createModule: (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    const modules = readModules();
    const moduleId = crypto.randomBytes(8).toString('hex');
    const m = { moduleId, name, description: description || '' };
    modules.push(m);
    if (!writeModules(modules)) return res.status(500).json({ success: false, message: 'Failed to save module' });
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Module Created', `New module "${name}" has been created`, 'MODULE_CREATED', 'module', moduleId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Module creation notification error:', notifErr);
      }
    })();
    return res.status(201).json({ success: true, data: m });
  },

  updateModule: (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    const modules = readModules();
    const idx = modules.findIndex(x => x.moduleId === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Module not found' });
    if (name) modules[idx].name = name;
    if (description !== undefined) modules[idx].description = description;
    if (!writeModules(modules)) return res.status(500).json({ success: false, message: 'Failed to write module' });
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Module Updated', `Module "${name || modules[idx].name}" has been updated`, 'MODULE_UPDATED', 'module', id, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Module update notification error:', notifErr);
      }
    })();
    return res.json({ success: true, data: modules[idx] });
  },

  deleteModule: (req, res) => {
    const { id } = req.params;
    let modules = readModules();
    const idx = modules.findIndex(x => x.moduleId === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Module not found' });
    const removed = modules.splice(idx, 1)[0];
    if (!writeModules(modules)) return res.status(500).json({ success: false, message: 'Failed to write module' });
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin'], 'Module Deleted', `Module "${removed.name}" has been deleted`, 'MODULE_DELETED', 'module', id, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Module delete notification error:', notifErr);
      }
    })();
    return res.json({ success: true, data: removed });
  },

  getSettings: (req, res) => {
    // Return current settings
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
  },

  putSettings: (req, res) => {
    const updates = req.body;
    // In a real app, validate and save to DB or config
    // For now, just return success with updated data
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
    // Merge updates
    Object.keys(updates).forEach(key => {
      if (current[key]) {
        Object.assign(current[key], updates[key]);
      }
    });
    return res.json({ success: true, data: current });
  }
};
