const db = require(__root + 'db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  } catch (e) { console.error('readModules error', e && e.message); return []; }
}

function writeModules(arr) {
  try {
    fs.mkdirSync(path.dirname(MODULES_FILE), { recursive: true });
    fs.writeFileSync(MODULES_FILE, JSON.stringify(arr, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('writeModules error', e && e.message); return false; }
}

// Helper to build SELECT column list including optional columns only if present in table
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
  return (rows || []).reduce((memo, row) => {
    if (!row || row.client_id === undefined || row.client_id === null) return memo;
    if (!memo[row.client_id]) memo[row.client_id] = [];
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

// Safe select: attempts to SELECT columns (including optionalCols) and if MySQL returns ER_BAD_FIELD_ERROR
// retries with only columns that actually exist in the table. Calls callback(err, rows).
function safeSelect(table, baseCols, optionalCols=[], whereClause='', params=[], cb) {
  (async () => {
    try {
      const selectCols = await buildSelect(table, baseCols, optionalCols).catch(() => baseCols.join(', '));
      const sql = `SELECT ${selectCols} FROM ${table} ${whereClause || ''}`;
      return db.query(sql, params, (err, rows) => {
        if (!err) return cb(null, rows);
        // if column missing, try to compute present columns and retry
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
      const users = (await q('SELECT COUNT(*) as c FROM users'))[0].c || 0;
      const projects = (await q('SELECT COUNT(*) as c FROM projects')).length ? (await q('SELECT COUNT(*) as c FROM projects'))[0].c : 0;
      const tasks = (await q('SELECT COUNT(*) as c FROM tasks')).length ? (await q('SELECT COUNT(*) as c FROM tasks'))[0].c : 0;
      return res.json({ success: true, data: { users, projects, tasks } });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
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
    // prefer selecting public_id when available; include created_at in responses
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
        // detect user-related columns on departments and filter if present
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
      // optional name columns for manager/head (store snapshot)
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
      console.log('createDepartment insert:', sql, params);
      db.query(sql, params, (err, result) => {
        if (err) {
          console.error('createDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        const insertId = result && result.insertId ? result.insertId : null;
        if (!insertId) return res.status(201).json({ success: true, data: { id: insertId, name, manager_id, head_id } });
        (async () => {
          const selOptional = [].concat(hasPublic ? ['public_id'] : [])
            .concat(['manager_id','head_id'])
            .concat(hasManagerNameCol ? ['manager_name'] : [])
            .concat(hasHeadNameCol ? ['head_name'] : []);
          safeSelect('departments', ['id','name'], selOptional, 'WHERE id = ? LIMIT 1', [insertId], (sErr, rows) => {
            if (sErr) return res.status(201).json({ success: true, data: { id: hasPublic ? publicId : insertId, name, manager_id, head_id } });
          const row = (rows && rows[0]) || { id: insertId, name, manager_id, head_id, public_id: publicId, manager_name: manager_name_val, head_name: head_name_val };
          // prefer stored manager_name/head_name if present
          if ((row.manager_name || row.head_name) && (row.manager_name || row.head_name).length >= 0) {
            const outRow = {
              id: row.public_id || row.id,
              name: row.name,
              manager_id: row.manager_id ? String(row.manager_id) : null,
              manager_name: row.manager_name || null,
              head_id: row.head_id ? String(row.head_id) : null,
              head_name: row.head_name || null
            };
            // if names are present, attempt to map ids to external ids as before
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
      console.error('createDepartment catch', e && e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  // Update an existing department
  updateDepartment: async (req, res) => {
    try {
      let { id } = req.params;
      if (!id) return res.status(400).json({ success: false, message: 'Department id required' });
      // if id is a public_id (non-numeric), resolve to internal id
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

      // Only include updates for columns that exist
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
          console.error('updateDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
        (async () => {
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
      console.error('updateDepartment catch', e && e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  // Delete a department
  deleteDepartment: (req, res) => {
    let { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: 'Department id required' });
    // if non-numeric, assume public_id and delete by public_id
    if (!/^\d+$/.test(String(id))) {
      db.query('DELETE FROM departments WHERE public_id = ?', [id], (err, result) => {
        if (err) {
          console.error('deleteDepartment error', err && err.message);
          return res.status(500).json({ success: false, error: err.message });
        }
        if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
        return res.json({ success: true, message: 'Department deleted' });
      });
      return;
    }
    db.query('DELETE FROM departments WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('deleteDepartment error', err && err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      if (!result || result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Department not found' });
      return res.json({ success: true, message: 'Department deleted' });
    });
  },

  manageProjects: async (req, res) => {
    const filterUserParam = req.query.userId;

    const runQuery = async (resolvedUserId) => {
      safeSelect('projects', ['id','name','description','manager_id'], ['tenant_id'], '', [], (err, rows) => {
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
          res.json({ success: true, data: out });
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
    return res.json({ success: true, data: modules[idx] });
  },

  deleteModule: (req, res) => {
    const { id } = req.params;
    let modules = readModules();
    const idx = modules.findIndex(x => x.moduleId === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Module not found' });
    const removed = modules.splice(idx, 1)[0];
    if (!writeModules(modules)) return res.status(500).json({ success: false, message: 'Failed to write module' });
    return res.json({ success: true, data: removed });
  }
};
