const db = require('../db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));

let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../logger'); } catch (e2) { logger = console; } }

function parsePagination(req) {
  const perPage = parseInt(req.query.limit || '25', 10) || 25;
  const page = parseInt(req.query.page || '1', 10) || 1;
  const offset = (page - 1) * perPage;
  return { perPage, page, offset };
}

async function buildBaseQuery(filters = {}) {
  const where = [];
  const params = [];
  if (filters.from) { where.push('a.createdAt >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('a.createdAt <= ?'); params.push(filters.to); }
  if (filters.actor) { where.push('(u.name LIKE ? OR a.actor_id = ?)'); params.push('%' + filters.actor + '%'); params.push(filters.actor); }
  if (filters.action) { where.push('a.action = ?'); params.push(filters.action); }
  return { whereClause: where.length ? ('WHERE ' + where.join(' AND ')) : '', params };
}

function inferActor(details, row) {
  if (!details || typeof details !== 'object') return null;
  const keys = ['performedBy','userName','actor_name','uploadedBy','approvedBy','userRole','clientName','sentTo','assignedBy','assignedTo'];
  for (const k of keys) {
    if (details[k]) {
      const name = String(details[k]);
      const id = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-_]/g,'');
      return { id, name };
    }
  }
  return null;
}

function normalizeLogRow(r) {
  let details = r.details;
  try { if (typeof details === 'string' && details.length) details = JSON.parse(details); } catch (e) { /* keep as-is */ }

  // Friendly system error message (frontend-safe)
  if (details && details.status === 'error' && details.message) {
    details.message = 'Something went wrong. Please try again later.';
  }

  // Infer actor
  let actorId = (r.actor_id !== null && r.actor_id !== undefined) ? r.actor_id : null;
  let actorName = r.actor_name || null;
  if (!actorName || actorName === null) {
    const inferred = inferActor(details, r);
    if (inferred) { actorId = actorId || inferred.id; actorName = inferred.name; }
  }

  // Defaults
  if (!actorId) {
    if ((r.entity && r.entity.toLowerCase() === 'system') || (r.action && /system/i.test(r.action))) actorId = 'system';
    else actorId = 'unknown';
  }
  if (!actorName) {
    if (actorId === 'system') actorName = 'System';
    else actorName = 'Unknown';
  }

  const entityId = (r.entity_id === null || r.entity_id === undefined) ? '' : r.entity_id;

  // Format timestamp as 'YYYY-MM-DD HH:mm'
  function fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const merged = Object.assign({}, details || {});
  const topLevelFields = [
    'performedBy','userName','tenant','ipAddress','device','status',
    'assignedTo','assignedBy','project','from','to','clientName',
    'fileName','uploadedBy','userRole','location','reason','attemptsLeft',
    'type','channel','sentTo','approvedBy','previousStatus','newStatus'
  ];

  const out = {
    id: r.id,
    actor: { id: String(actorId), name: actorName },
    action: r.action,
    entity: r.entity,
    entityId: entityId,
    details: details || {},
    timestamp: fmt(r.createdAt)
  };

  for (const k of topLevelFields) {
    if (merged && Object.prototype.hasOwnProperty.call(merged, k)) {
      out[k] = merged[k];
    }
  }

  out.logId = `LOG${r.id}`;
  out.module = r.entity || (merged.module || merged.entity) || null;
  out.performedBy = out.performedBy || actorName || null;
  out.userId = out.userId || String(actorId) || null;
  out.tenantId = merged.tenant || merged.tenantId || null;
  out.ipAddress = merged.ipAddress || merged.ip || null;
  out.status = merged.status || null;

  return out;
}

module.exports = {
  // Generic programmatic audit logger used by other modules
  log: async (entry) => {
    try {
      const actorId = entry.user_id || entry.actor_id || null;
      const tenantId = entry.tenant_id || null;
      const action = entry.action || 'ACTION';
      const entity = entry.entity || null;
      const entityId = entry.entity_id || entry.entityId || null;
      const details = entry.metadata || entry.details || {};
      await q(`INSERT INTO audit_logs (actor_id, tenant_id, action, entity, entity_id, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`, [actorId, tenantId, action, entity, entityId, JSON.stringify(details)]);
    } catch (e) {
      logger.error('auditController.log failed:', e && e.message);
    }
  },
  // GET /api/admin/audit-logs
  admin: async (req, res, next) => {
    try {
      const { perPage, page, offset } = parsePagination(req);
      const filters = { from: req.query.from, to: req.query.to, actor: req.query.actor, action: req.query.action };
      const base = await buildBaseQuery(filters);

      const returnAll = String(req.query.all || '').toLowerCase() === 'true';
      let rows = [];
      let total = 0;
      if (returnAll) {
        const sqlAll = `
          SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
          FROM audit_logs a
          LEFT JOIN users u ON u._id = a.actor_id
          ${base.whereClause}
          ORDER BY a.createdAt DESC
        `;
        rows = await q(sqlAll, base.params);
        total = (rows && rows.length) || 0;
      } else {
        const countSql = `SELECT COUNT(*) AS total FROM audit_logs a LEFT JOIN users u ON u._id = a.actor_id ${base.whereClause}`;
        const totalRows = await q(countSql, base.params);
        total = (totalRows && totalRows[0] && totalRows[0].total) || 0;

        const sql = `
          SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
          FROM audit_logs a
          LEFT JOIN users u ON u._id = a.actor_id
          ${base.whereClause}
          ORDER BY a.createdAt DESC
          LIMIT ? OFFSET ?
        `;
        rows = await q(sql, [...base.params, perPage, offset]);
      }

      const logs = (rows || []).map(normalizeLogRow);

      return res.json({ success: true, data: { total, page, perPage, logs } });
    } catch (err) {
      return next(err);
    }
  },

  // GET /api/manager/audit-logs
  manager: async (req, res, next) => {
    try {
      const { perPage, page, offset } = parsePagination(req);
      const filters = { from: req.query.from, to: req.query.to, actor: req.query.actor, action: req.query.action };
      // allow manager to scope by projectId
      const projectId = req.query.projectId || req.query.project_id;
      const base = await buildBaseQuery(filters);

      // Build manager-scoped accesses: projects, clients, team members
      const managerInternalId = req.user && (req.user._id || null);
      const managerPublicId = req.user && (req.user.public_id || req.user.id || null);

      let assignedClientIds = [];
      try {
        const RoleBasedLoginResponse = require('../controller/utils/RoleBasedLoginResponse');
        const resources = await RoleBasedLoginResponse.getAccessibleResources(managerInternalId, req.user.role, req.user.tenant_id, managerPublicId);
        if (resources && Array.isArray(resources.assignedClientIds)) assignedClientIds = resources.assignedClientIds;
      } catch (e) {
        assignedClientIds = [];
      }

      // gather projects managed by this manager (internal id or public id)
      const projRows = await q(`SELECT id, public_id FROM projects WHERE project_manager_id = ? OR project_manager_id = ? OR manager_id = ? OR manager_id = ?`, [managerInternalId, managerPublicId || -1, managerInternalId, managerPublicId || -1]).catch(() => []);
      const projectIds = (projRows || []).map(r => r && r.id).filter(Boolean);
      const projectPublicIds = (projRows || []).map(r => r && r.public_id).filter(Boolean);

      // gather direct team member ids (users who report to this manager via manager_id)
      const teamRows = await q('SELECT _id, public_id FROM users WHERE manager_id = ? OR manager_id = ? LIMIT 1000', [managerInternalId, managerPublicId || -1]).catch(() => []);
      const teamInternalIds = (teamRows || []).map(r => r && r._id).filter(Boolean);
      const teamPublicIds = (teamRows || []).map(r => r && r.public_id).filter(Boolean);

      let whereClause = base.whereClause;
      const params = [...base.params];
      if (projectId) { // narrow to project-related entries
        whereClause = whereClause ? (whereClause + ' AND a.entity = ? AND a.entity_id = ?') : 'WHERE a.entity = ? AND a.entity_id = ?';
        params.push('project'); params.push(projectId);
      }

      // Manager-scoping: restrict to clients/projects/tasks/team-members the manager can access
      const mgrParts = [];
      const mgrParams = [];
      if (assignedClientIds && assignedClientIds.length) {
        mgrParts.push("(a.entity = 'Client' AND a.entity_id IN (?))");
        mgrParams.push(assignedClientIds);
      }
      if (projectPublicIds && projectPublicIds.length) {
        mgrParts.push("(a.entity = 'Project' AND a.entity_id IN (?))");
        mgrParams.push(projectPublicIds);
      }
      if (projectIds && projectIds.length) {
        // include tasks that belong to these projects
        mgrParts.push("(a.entity = 'Task' AND EXISTS (SELECT 1 FROM tasks t WHERE (t.public_id = a.entity_id OR t.id = a.entity_id) AND (t.project_id IN (?) OR t.project_public_id IN (?))))");
        mgrParams.push(projectIds);
        mgrParams.push(projectPublicIds.length ? projectPublicIds : projectIds);
      } else if (projectPublicIds && projectPublicIds.length) {
        mgrParts.push("(a.entity = 'Task' AND EXISTS (SELECT 1 FROM tasks t WHERE (t.public_id = a.entity_id OR t.id = a.entity_id) AND (t.project_public_id IN (?))))");
        mgrParams.push(projectPublicIds);
      }
      const actorFilterIds = [];
      if (teamInternalIds && teamInternalIds.length) actorFilterIds.push(...teamInternalIds);
      if (teamPublicIds && teamPublicIds.length) actorFilterIds.push(...teamPublicIds);
      if (actorFilterIds.length) {
        mgrParts.push('(a.actor_id IN (?))');
        mgrParams.push(actorFilterIds);
      }

      if (mgrParts.length) {
        whereClause = whereClause ? (whereClause + ' AND (' + mgrParts.join(' OR ') + ')') : ('WHERE (' + mgrParts.join(' OR ') + ')');
        params.push(...mgrParams);
      }

      const returnAll = String(req.query.all || '').toLowerCase() === 'true';
      let rows = [];
      let total = 0;
      if (returnAll) {
        const sqlAll = `
          SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
          FROM audit_logs a
          LEFT JOIN users u ON u._id = a.actor_id
          ${whereClause}
          ORDER BY a.createdAt DESC
        `;
        rows = await q(sqlAll, params);
        total = (rows && rows.length) || 0;
      } else {
          const sql = `
            SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
            FROM audit_logs a
            LEFT JOIN users u ON u._id = a.actor_id
            ${whereClause}
            ORDER BY a.createdAt DESC
            LIMIT ? OFFSET ?
          `;
          rows = await q(sql, [...params, perPage, offset]);
      }

      const logs = (rows || []).map(normalizeLogRow);

      return res.json({ success: true, data: { total, page, perPage, logs } });
    } catch (err) {
      return next(err);
    }
  },

  // GET /api/employee/audit-logs
  employee: async (req, res, next) => {
    try {
      const { perPage, page, offset } = parsePagination(req);
      const filters = { from: req.query.from, to: req.query.to, action: req.query.action };
      const base = await buildBaseQuery(filters);

      // Restrict to logs where actor_id matches the requesting user.
      // Support both internal (`_id`) and public (`public_id` or `id`) identifiers because
      // audit entries may store either form depending on how they were created.
      const actorInternal = req.user && (req.user._id || null);
      const actorPublic = req.user && (req.user.public_id || req.user.id || null);
      const actorIds = [];
      if (actorInternal !== null && actorInternal !== undefined) actorIds.push(actorInternal);
      if (actorPublic !== null && actorPublic !== undefined && actorPublic !== actorInternal) actorIds.push(actorPublic);

      if (actorIds.length === 0) {
        return res.json({ success: true, data: { total: 0, page, perPage, logs: [] } });
      }

      const whereClause = base.whereClause ? (base.whereClause + ' AND (a.actor_id IN (?))') : 'WHERE (a.actor_id IN (?))';
      const params = [...base.params, actorIds];

      const returnAll = String(req.query.all || '').toLowerCase() === 'true';
      let rows = [];
      let total = 0;
      const actorId = req.user && (req.user._id || req.user.id);
      if (returnAll) {
        const sqlAll = `
          SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
          FROM audit_logs a
          LEFT JOIN users u ON u._id = a.actor_id
          ${whereClause}
          ORDER BY a.createdAt DESC
        `;
        rows = await q(sqlAll, params);
        total = (rows && rows.length) || 0;
      } else {
        const countSql = `SELECT COUNT(*) AS total FROM audit_logs a LEFT JOIN users u ON u._id = a.actor_id ${whereClause}`;
        const totalRows = await q(countSql, params);
        total = (totalRows && totalRows[0] && totalRows[0].total) || 0;

        const sql = `
          SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt
          FROM audit_logs a
          LEFT JOIN users u ON u._id = a.actor_id
          ${whereClause}
          ORDER BY a.createdAt DESC
          LIMIT ? OFFSET ?
        `;
        rows = await q(sql, [...params, perPage, offset]);
      }

      const logs = (rows || []).map(normalizeLogRow);

      return res.json({ success: true, data: { total, page, perPage, logs } });
    } catch (err) {
      return next(err);
    }
  }
};
