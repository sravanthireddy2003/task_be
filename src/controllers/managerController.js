const db = require(__root + 'db');
const RoleBasedLoginResponse = require(__root + 'controller/utils/RoleBasedLoginResponse');
const { normalizeProjectStatus } = require(__root + 'utils/projectStatus');

let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../../logger'); } catch (e2) { logger = console; } }

const NUMERIC_COLUMN_TYPES = new Set(['int', 'bigint', 'tinyint', 'smallint', 'mediumint', 'decimal', 'float', 'double', 'numeric']);

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

function accessDenied(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

async function fetchColumnTypes(table, columns = []) {
  if (!columns.length) return {};
  const placeholder = columns.map(() => '?').join(',');
  const rows = await queryAsync(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (${placeholder})`,
    [table, ...columns]
  );
  const map = {};
  (rows || []).forEach((row) => {
    if (row && row.COLUMN_NAME) map[row.COLUMN_NAME] = row.DATA_TYPE || '';
  });
  return map;
}

function valueForColumn(type, user) {
  if (!type) return null;
  const lower = String(type).toLowerCase();
  if (NUMERIC_COLUMN_TYPES.has(lower)) return user._id || null;
  return user.id || (user._id ? String(user._id) : null);
}

function buildAccessClause(columnMeta, user) {
  const clauses = [];
  const params = [];
  Object.entries(columnMeta).forEach(([column, type]) => {
    const value = valueForColumn(type, user);
    if (value === null || value === undefined) return;
    clauses.push(`${column} = ?`);
    params.push(value);
  });
  if (!clauses.length) return null;
  return { expression: clauses.join(' OR '), params };
}

async function requireFeatureAccess(req, feature) {
  const resources = await RoleBasedLoginResponse.getAccessibleResources(req.user._id, req.user.role, req.user.tenant_id, req.user.id);
  if (!resources || !Array.isArray(resources.features) || !resources.features.includes(feature)) {
    throw accessDenied(`Access denied: ${feature} feature`);
  }
  return resources;
}

async function hasColumn(table, column) {
  const rows = await queryAsync(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

const tableColumnCache = {};

async function cachedHasColumn(table, column) {
  tableColumnCache[table] = tableColumnCache[table] || {};
  if (tableColumnCache[table][column] === undefined) {
    tableColumnCache[table][column] = await hasColumn(table, column);
  }
  return tableColumnCache[table][column];
}

const clientColumnCache = {};

async function clientHasPublicId() {
  if (clientColumnCache.public_id === undefined) {
    clientColumnCache.public_id = await cachedHasColumn('clientss', 'public_id');
  }
  return clientColumnCache.public_id;
}

async function clientFieldSelects(alias = 'c') {
  const selects = [`MIN(${alias}.name) AS client_name`];
  if (await clientHasPublicId()) selects.push(`MIN(${alias}.public_id) AS client_public_id`);
  return selects;
}

const tableExistsCache = {};

async function tableExists(table) {
  if (tableExistsCache[table] !== undefined) {
    return tableExistsCache[table];
  }
  const rows = await queryAsync(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  );
  tableExistsCache[table] = Array.isArray(rows) && rows.length > 0;
  return tableExistsCache[table];
}

async function fetchClientDocuments(clientIds = []) {
  if (!clientIds.length) return {};
  if (!(await tableExists('client_documents'))) return {};
  const rows = await queryAsync(
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

async function gatherManagerProjects(req) {
  const columnMeta = await fetchColumnTypes('projects', ['manager_id', 'project_manager_id']);
  const clause = buildAccessClause(columnMeta, req.user);
  if (!clause) return [];

  const clientFields = await clientFieldSelects('c');

  const sql = `
    SELECT
      p.id,
      p.public_id,
      p.name,
      p.status,
      p.priority,
      p.start_date,
      p.end_date,
      p.client_id,

      -- ✅ THIS WAS MISSING
      p.project_manager_id,
      u.public_id AS project_manager_public_id,
      u.name AS project_manager_name,

      ${clientFields.join(', ')}

    FROM projects p
    LEFT JOIN clientss c ON c.id = p.client_id
    -- ✅ JOIN USERS TABLE
    LEFT JOIN users u ON u._id = p.project_manager_id

    WHERE (${clause.expression})
    ORDER BY p.updated_at DESC, p.created_at DESC
  `;

  return await queryAsync(sql, clause.params);
}

function dedupe(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function countRelatedTasks(projectIds = [], projectPublicIds = []) {
  if (!projectIds.length && !projectPublicIds.length) return 0;
  const filters = [];
  const params = [];
  if (projectIds.length && (await cachedHasColumn('tasks', 'project_id'))) {
    filters.push('t.project_id IN (?)');
    params.push(projectIds);
  }
  if (projectPublicIds.length && (await cachedHasColumn('tasks', 'project_public_id'))) {
    filters.push('t.project_public_id IN (?)');
    params.push(projectPublicIds);
  }
  if (!filters.length) return 0;
  const hasIsDeletedFlag = await cachedHasColumn('tasks', 'isDeleted');
  const deletedClauseLine = hasIsDeletedFlag
    ? `
    AND (t.isDeleted IS NULL OR t.isDeleted != 1)`
    : '';
  const sql = `
    SELECT COUNT(DISTINCT t.id) AS total
    FROM tasks t
    WHERE (${filters.join(' OR ')})${deletedClauseLine}
  `;
  return (await queryAsync(sql, params))[0]?.total || 0;
}

async function buildTaskFilter(projectIds = [], projectPublicIds = []) {
  const expressions = [];
  const params = [];

  if (projectIds.length) {
    expressions.push(`t.project_id IN (?)`);
    params.push(projectIds);
  }

  if (projectPublicIds.length) {
    expressions.push(`t.project_public_id IN (?)`);
    params.push(projectPublicIds);
  }

  if (!expressions.length) return null;

  return {
    expression: expressions.join(' OR '),
    params
  };
}


async function fetchTaskTimeline(projectIds = [], projectPublicIds = []) {
  const filter = await buildTaskFilter(projectIds, projectPublicIds);
  if (!filter) return [];

  const clientFields = await clientFieldSelects('c');
  const hasIsDeletedFlag = await cachedHasColumn('tasks', 'isDeleted');
  const hasProjectIsLocked = await cachedHasColumn('projects', 'is_locked');

  const sql = `
    SELECT
      t.id AS task_internal_id,
      t.public_id AS task_id,
      t.title,
      t.stage,
      t.taskDate,
      t.priority,
      t.status,
      t.started_at,
      t.live_timer,
      t.total_duration,
      t.completed_at,
      t.time_alloted,

      ${clientFields.join(', ')},

      MIN(p.id) AS project_internal_id,
      MIN(p.public_id) AS project_public_id,
      MIN(p.name) AS project_name,
      MIN(p.priority) AS project_priority,
      MIN(p.status) AS project_status,
      ${hasProjectIsLocked ? 'MIN(p.is_locked) AS project_is_locked,' : ''}
      MIN(p.start_date) AS project_start_date,
      MIN(p.end_date) AS project_end_date,
      MIN(p.client_id) AS project_client_id,

      GROUP_CONCAT(DISTINCT u._id ORDER BY u._id) AS assigned_user_internal_ids,
      GROUP_CONCAT(DISTINCT u.public_id ORDER BY u._id) AS assigned_user_public_ids,
      GROUP_CONCAT(DISTINCT u.name ORDER BY u._id) AS assigned_user_names

    FROM tasks t
    LEFT JOIN clientss c 
      ON c.id = t.client_id

    LEFT JOIN projects p 
      ON p.id = t.project_id
      OR (t.project_public_id IS NOT NULL AND p.public_id = t.project_public_id)

    LEFT JOIN taskassignments ta 
      ON ta.task_id = t.id

    LEFT JOIN users u 
      ON u._id = ta.user_id

    WHERE (${filter.expression})
    ${hasIsDeletedFlag ? `AND (t.isDeleted IS NULL OR t.isDeleted != 1)` : ''}

    GROUP BY t.id
    ORDER BY t.taskDate ASC, t.updatedAt DESC
  `;

  return await queryAsync(sql, filter.params);
}

function parseProjectFilter(req) {
  const candidates = [
    req.query?.project_id,
    req.query?.projectId,
    req.query?.project_public_id,
    req.query?.projectPublicId,
    req.body?.project_id,
    req.body?.projectId,
    req.body?.project_public_id,
    req.body?.projectPublicId
  ];
  const raw = candidates.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return { type: 'id', value: Number(trimmed) };
  }
  return { type: 'public', value: trimmed };
}

function toIsoDate(value) {
  if (value === undefined || value === null) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

async function fetchManagerDepartment(userId) {
  if (!userId) return null;
  const rows = await queryAsync(
    'SELECT department_public_id FROM users WHERE _id = ? LIMIT 1',
    [userId]
  );
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0].department_public_id || null;
}

module.exports = {
  getManagerDashboard: async (req, res) => {
    try {
      const resources = await requireFeatureAccess(req, 'Dashboard');
      const projects = await gatherManagerProjects(req);
      const projectIds = dedupe(projects.map((project) => project.id)).filter(Boolean);
      const projectPublicIds = dedupe(projects.map((project) => project.public_id)).filter(Boolean);
      const projectCount = projects.length;
      const taskCount = await countRelatedTasks(projectIds, projectPublicIds);
      const assignedClientIds = Array.isArray(resources.assignedClientIds)
        ? resources.assignedClientIds.filter(Boolean)
        : [];
      const clientCount = assignedClientIds.length
        ? (await queryAsync(
          'SELECT COUNT(*) AS total FROM clientss WHERE id IN (?) AND (isDeleted IS NULL OR isDeleted != 1)',
          [assignedClientIds]
        ))[0]?.total || 0
        : 0;
      return res.json({
        success: true,
        data: { projectCount, taskCount, clientCount }
      });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },


  getAssignedClients: async (req, res) => {
    try {
      const resources = await requireFeatureAccess(req, 'Assigned Clients');
      let assignedClientIds = Array.isArray(resources.assignedClientIds)
        ? resources.assignedClientIds.filter(Boolean)
        : [];

      // 1) clients where clientss.manager_id matches user's internal id or public id
      // 2) clients linked to projects where the user is manager/project_manager
      if (!assignedClientIds.length) {
        try {
          const uid = req.user && req.user._id;
          const pub = req.user && req.user.id;

          // Direct client manager mapping
          const direct = await queryAsync(
            'SELECT id FROM clientss WHERE manager_id = ? OR manager_id = ? LIMIT 1000',
            [uid, pub || -1]
          );
          assignedClientIds = (direct || []).map(r => r.id).filter(Boolean);

          // Fallback via projects managed by this user
          if (!assignedClientIds.length) {
            const viaProjects = await queryAsync(
              `SELECT DISTINCT c.id AS id
               FROM projects p
               INNER JOIN clientss c ON c.id = p.client_id
               WHERE (p.project_manager_id = ? OR p.project_manager_id = ? OR p.manager_id = ? OR p.manager_id = ?)`,
              [uid, pub || -1, uid, pub || -1]
            );
            assignedClientIds = (viaProjects || []).map(r => r.id).filter(Boolean);
          }
        } catch (e) {
          logger.warn('Fallback assignedClientIds lookup failed: ' + (e && e.message));
          assignedClientIds = [];
        }
      }
      if (!assignedClientIds.length) return res.json({ success: true, data: [] });

      const hasStatus = await cachedHasColumn('clientss', 'status');
      const hasCreatedAt = await cachedHasColumn('clientss', 'created_at');
      const hasManager = await cachedHasColumn('clientss', 'manager_id');
      const hasEmail = await cachedHasColumn('clientss', 'email');
      const hasPhone = await cachedHasColumn('clientss', 'phone');
      const hasPublicId = await cachedHasColumn('clientss', 'public_id');
      const hasIsDeleted = await cachedHasColumn('clientss', 'isDeleted');
      const hasClientContacts = await tableExists('client_contacts');

      const selectCols = ['c.id', 'c.ref', 'c.name', 'c.company'];
      if (hasPublicId) selectCols.push('c.public_id');
      if (hasStatus) selectCols.push('c.status');
      if (hasManager) {
        selectCols.push('c.manager_id');
        selectCols.push('(SELECT public_id FROM users WHERE _id = c.manager_id OR public_id = c.manager_id LIMIT 1) AS manager_public_id');
        selectCols.push('(SELECT name FROM users WHERE _id = c.manager_id OR public_id = c.manager_id LIMIT 1) AS manager_name');
      }
      if (hasCreatedAt) selectCols.push('c.created_at');
      if (hasClientContacts) {
        if (!hasEmail) selectCols.push('pc.email AS email');
        else selectCols.push('c.email');
        if (!hasPhone) selectCols.push('pc.phone AS phone');
        else selectCols.push('c.phone');
      } else {
        if (hasEmail) selectCols.push('c.email');
        if (hasPhone) selectCols.push('c.phone');
      }

      const joinClause = hasClientContacts
        ? ' LEFT JOIN (SELECT client_id, email, phone FROM client_contacts WHERE is_primary = 1) pc ON pc.client_id = c.id '
        : '';

      const filters = ['c.id IN (?)'];
      const params = [assignedClientIds];
      if (hasIsDeleted) filters.push('(c.isDeleted IS NULL OR c.isDeleted != 1)');
      const whereSql = `WHERE ${filters.join(' AND ')}`;
      const orderBy = hasCreatedAt ? 'c.created_at DESC' : 'c.id DESC';

      const clients = await queryAsync(
        `SELECT ${selectCols.join(', ')} FROM clientss c${joinClause} ${whereSql} ORDER BY ${orderBy}`,
        params
      );

      const documentsByClient = await fetchClientDocuments(assignedClientIds);

      const payload = await Promise.all(
        (clients || []).map(async (client) => {
          const normalizedManagerId = hasManager && client.manager_id && Number(client.manager_id) !== 0 ? client.manager_id : null;
          const row = {
            id: client.id,
            public_id: client.public_id || null,
            ref: client.ref,
            name: client.name,
            company: client.company,
            status: client.status || null,
            manager_id: normalizedManagerId,
            manager_public_id: client.manager_public_id || null,
            manager_name: client.manager_name || null,
            created_at: client.created_at || null,
            email: client.email || null,
            phone: client.phone || null,
            documents: documentsByClient[client.id] || []
          };

          if (hasManager && normalizedManagerId && !row.manager_name) {
            const mgr = await queryAsync(
              'SELECT public_id, name FROM users WHERE _id = ? OR public_id = ? LIMIT 1',
              [normalizedManagerId, String(normalizedManagerId)]
            );
            if (Array.isArray(mgr) && mgr.length > 0) {
              row.manager_public_id = mgr[0].public_id || row.manager_public_id;
              row.manager_name = mgr[0].name || row.manager_name;
            }
          }

          return row;
        })
      );

      return res.json({ success: true, data: payload });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  getAssignedProjects: async (req, res) => {
    try {
      await requireFeatureAccess(req, 'Projects');

      const projects = await gatherManagerProjects(req);

      const payload = projects.map((project) => ({
        id: project.public_id || String(project.id),
        name: project.name,
        status: project.status,
        priority: project.priority,
        startDate: project.start_date,
        endDate: project.end_date,

        client: project.client_id
          ? {
            id: project.client_public_id || String(project.client_id),
            name: project.client_name,
          }
          : null,

        // ✅ Added project manager info
        manager: project.project_manager_id
          ? {
            id:
              project.project_manager_public_id ||
              String(project.project_manager_id),
            name: project.project_manager_name,
          }
          : null,
      }));
      logger.debug('Assigned Projects Payload:', payload); // Debug log
      return res.json({ success: true, data: payload });
    } catch (error) {
      return res
        .status(error.status || 500)
        .json({ success: false, error: error.message });
    }
  },

getTaskTimeline: async (req, res) => {
  try {
    await requireFeatureAccess(req, 'Tasks');
    const projects = await gatherManagerProjects(req);
    const projectIds = dedupe(projects.map((project) => project.id)).filter(Boolean);
    const projectPublicIds = dedupe(projects.map((project) => project.public_id)).filter(Boolean);
    const projectFilter = parseProjectFilter(req);
    
    const lookupById = new Map();
    const lookupByPublicId = new Map();
    projects.forEach((project) => {
      if (project && project.id) lookupById.set(String(project.id), project);
      if (project && project.public_id) lookupByPublicId.set(String(project.public_id), project);
    });
    
    let selectedProject = null;
    let filteredProjectIds = [...projectIds];
    let filteredProjectPublicIds = [...projectPublicIds];
    
    if (projectFilter) {
      selectedProject =
        projectFilter.type === 'id'
          ? lookupById.get(String(projectFilter.value))
          : lookupByPublicId.get(String(projectFilter.value));
          
      if (!selectedProject) {
        return res
          .status(404)
          .json({ success: false, error: 'Project not found or not assigned to this manager' });
      }
      
      filteredProjectIds = selectedProject.id ? [selectedProject.id] : [];
      filteredProjectPublicIds = selectedProject.public_id ? [selectedProject.public_id] : [];
    }

    const tasks = await fetchTaskTimeline(filteredProjectIds, filteredProjectPublicIds);
    const taskInternalIds = dedupe(tasks.map((task) => task.task_internal_id || task.id)).filter(Boolean);

    // 🔒 COMPLETE LOCK QUERY with requester (MANAGER VIEW)
    const lockStatuses = {};
    if (taskInternalIds.length > 0) {
      // FIXED: Use actual taskInternalIds instead of hardcoded values
      const lockResult = await queryAsync(`
        SELECT 
          r.task_id,
          r.status AS request_status,
          r.id AS request_id,
          r.requested_at,
          r.responded_at,
          r.requested_by,
          u.name AS requester_name,
          u.public_id AS requester_id,
          t.status AS task_current_status,
          t.public_id AS task_public_id
        FROM task_resign_requests r
        INNER JOIN tasks t ON t.id = r.task_id
        LEFT JOIN users u ON r.requested_by = u._id
        WHERE r.task_id IN (?)
        ORDER BY r.requested_at DESC
      `, [taskInternalIds]);

      const lockRows = Array.isArray(lockResult) ? lockResult : [];
      if (Array.isArray(lockRows)) {
        lockRows.forEach(row => {
          if (!row || !row.task_id || lockStatuses[row.task_id]) return;

          lockStatuses[row.task_id] = {
            is_locked: String(row.request_status).toUpperCase() === 'PENDING',
            request_status: row.request_status,
            request_id: row.request_id,
            requested_at: row.requested_at ? new Date(row.requested_at).toISOString() : null,
            responded_at: row.responded_at ? new Date(row.responded_at).toISOString() : null,
            requested_by: String(row.requested_by),
            requester_name: row.requester_name || 'Unknown',
            requester_id: row.requester_id || null,
            task_status: row.task_current_status,
            task_public_id: row.task_public_id
          };
        });
      }
    }

    let taskChecklists = [];
    let taskActivities = [];
    
    if (taskInternalIds.length) {
      // FIXED: Use actual taskInternalIds instead of placeholder
      taskChecklists = await queryAsync(
        `SELECT s.id, s.task_Id AS task_id, s.title, s.description, s.due_date, s.tag, s.created_at, s.updated_at, s.status, s.estimated_hours, s.completed_at, s.created_by,
                u.public_id AS creator_public_id, u.name AS creator_name
         FROM subtasks s
         LEFT JOIN users u ON u._id = s.created_by
         WHERE s.task_Id IN (?)`,
        [taskInternalIds]
      );
      
      // FIXED: Use actual taskInternalIds instead of placeholder
      taskActivities = await queryAsync(
        `SELECT ta.task_id, ta.type, ta.activity, ta.createdAt, u._id AS user_id, u.name AS user_name
         FROM task_activities ta
         LEFT JOIN users u ON ta.user_id = u._id
         WHERE ta.task_id IN (?)
         ORDER BY ta.createdAt DESC`,
        [taskInternalIds]
      );
    }

    const checklistMap = {};
    (taskChecklists || []).forEach((subtask) => {
      if (!subtask || subtask.task_id === undefined || subtask.task_id === null) return;
      const key = String(subtask.task_id);
      if (!checklistMap[key]) checklistMap[key] = [];
      checklistMap[key].push({
        id: subtask.id,
        title: subtask.title || null,
        status: subtask.status || null,
        description: subtask.description || null,
        dueDate: toIsoDate(subtask.due_date),
        tag: subtask.tag || null,
        estimatedHours: subtask.estimated_hours != null ? Number(subtask.estimated_hours) : null,
        completedAt: toIsoDate(subtask.completed_at),
        createdAt: toIsoDate(subtask.created_at),
        updatedAt: toIsoDate(subtask.updated_at),
        createdBy: subtask.created_by ? { 
          id: subtask.creator_public_id || String(subtask.created_by), 
          internalId: String(subtask.created_by), 
          name: subtask.creator_name || null 
        } : null
      });
    });

    const activityMap = {};
    (taskActivities || []).forEach((activity) => {
      if (!activity || activity.task_id === undefined || activity.task_id === null) return;
      const key = String(activity.task_id);
      if (!activityMap[key]) activityMap[key] = [];
      activityMap[key].push({
        type: activity.type || null,
        activity: activity.activity || null,
        createdAt: toIsoDate(activity.createdAt),
        user: activity.user_id ? { 
          id: activity.user_public_id || String(activity.user_id), 
          internalId: String(activity.user_id), 
          name: activity.user_name || null 
        } : null
      });
    });

    const formatted = (tasks || []).map((task) => {
      const assignedInternal = task.assigned_user_internal_ids
        ? String(task.assigned_user_internal_ids).split(',')
        : [];
      const assignedPublic = task.assigned_user_public_ids
        ? String(task.assigned_user_public_ids).split(',')
        : [];
      const assignedNames = task.assigned_user_names ? String(task.assigned_user_names).split(',') : [];
      
      const assignedUsers = assignedPublic.map((publicId, idx) => ({
        id: publicId || (assignedInternal[idx] ? String(assignedInternal[idx]) : null),
        internalId: assignedInternal[idx] ? String(assignedInternal[idx]) : null,
        name: assignedNames[idx] || null
      }));

      // 🔒 FULL LOCK INFO with requester
      const taskId = task.task_internal_id || task.id;
      const lockInfo = lockStatuses[taskId] || {};
      const isLocked = Boolean(lockInfo.is_locked);

      const internalKey = task.task_internal_id ? String(task.task_internal_id) : null;
      const publicKey = task.task_id ? String(task.task_id) : null;
      
      logger.debug(`Task ID: ${task.task_id}, Internal ID: ${task.task_internal_id}`);
      logger.debug(`Checklist for internal key: ${checklistMap[internalKey]?.length || 0} items`);
      logger.debug(`Activities for internal key: ${activityMap[internalKey]?.length || 0} items`);

      return {
        id: task.task_id ? String(task.task_id) : String(task.task_internal_id),
        title: task.title,
        // ADD description field which is missing in your response
        description: task.description || null,
        stage: task.stage,
        taskDate: task.taskDate ? new Date(task.taskDate).toISOString() : null,
        priority: task.priority,
        status: task.status,
        timeAlloted: task.time_alloted != null ? Number(task.time_alloted) : null,
        // Add these additional fields from your response
        day: task.day || null,
        dayName: task.dayName || null,
        estimatedHours: task.estimated_hours != null ? Number(task.estimated_hours) : null,
        createdAt: task.created_at ? toIsoDate(task.created_at) : null,
        updatedAt: task.updated_at ? toIsoDate(task.updated_at) : null,
        completed_at: task.completed_at ? toIsoDate(task.completed_at) : null,
        
        client: {
          id: task.client_public_id || (task.client_id ? String(task.client_id) : null),
          name: task.client_name || null
        },
        
        project: {
          internalId: task.project_internal_id || null,
          id: task.project_public_id || (task.project_internal_id ? String(task.project_internal_id) : null),
          name: task.project_name || null,
          status: normalizeProjectStatus(task.project_status, task.project_is_locked).status || null,
          priority: task.project_priority || null,
          startDate: toIsoDate(task.project_start_date),
          endDate: toIsoDate(task.project_end_date),
          clientId: task.project_client_id ? String(task.project_client_id) : null
        },
        
        assignedUsers,
        // FIXED: Make sure checklist is included
        checklist: (internalKey && checklistMap[internalKey]) || (publicKey && checklistMap[publicKey]) || [],
        // FIXED: Make sure activityTimeline is included
        activityTimeline: (internalKey && activityMap[internalKey]) || (publicKey && activityMap[publicKey]) || [],
        
        started_at: task.started_at ? toIsoDate(task.started_at) : null,
        live_timer: task.live_timer ? toIsoDate(task.live_timer) : null,
        total_time_seconds: task.total_duration != null ? Number(task.total_duration) : 0,
        total_time_hours: task.total_duration != null ? Number((Number(task.total_duration) / 3600).toFixed(2)) : 0,
        total_time_hhmmss: (() => {
          const secs = Number(task.total_duration || 0);
          const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
          const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
          const ss = String(secs % 60).padStart(2, '0');
          return `${hh}:${mm}:${ss}`;
        })(),
        
        // 🔒 FULL MANAGER VIEW with requester
        is_locked: isLocked,
        lock_info: lockInfo,
        task_status: {
          current_status: task.status || 'Unknown',
          is_locked: isLocked,
          requester_name: lockInfo.requester_name
        },
        
        summary: (() => {
          try {
            const now = new Date();
            const est = task.taskDate ? new Date(task.taskDate) : null;
            if (!est) return {};
            return { 
              dueStatus: est < now ? 'Overdue' : 'On Time', 
              dueDate: toIsoDate(est) 
            };
          } catch (e) { 
            return {}; 
          }
        })()
      };
    });

    const meta = { count: formatted.length };
    let projectMeta = null;
    
    if (selectedProject) {
      projectMeta = {
        internalId: selectedProject.id || null,
        id: selectedProject.public_id || (selectedProject.id ? String(selectedProject.id) : null),
        publicId: selectedProject.public_id || null,
        name: selectedProject.name || null,
        status: normalizeProjectStatus(selectedProject.status, selectedProject.is_locked).status || null,
        priority: selectedProject.priority || null,
        startDate: toIsoDate(selectedProject.start_date),
        endDate: toIsoDate(selectedProject.end_date),
        client: {
          id: selectedProject.client_public_id || (selectedProject.client_id ? String(selectedProject.client_id) : null),
          name: selectedProject.client_name || null
        }
      };
      meta.project = projectMeta;
    }
    
    const payload = { 
      success: true, 
      data: formatted, 
      meta 
    };
    
    if (projectMeta) payload.project = projectMeta;
    return res.json(payload);
    
    } catch (error) {
    logger.error('Error in getTaskTimeline:', error && error.message ? error.message : error);
    return res.status(error.status || 500).json({ 
      success: false, 
      error: error.message 
    });
  }
},

  getDepartmentEmployees: async (req, res) => {
    try {
      await requireFeatureAccess(req, 'Tasks');
      const departmentPublicId = await fetchManagerDepartment(req.user._id);
      if (!departmentPublicId) {
        return res.json({ success: true, data: [] });
      }
      const rows = await queryAsync(
        `SELECT _id, public_id, name, email, phone, title, role, isActive, isGuest, department_public_id
         FROM users
         WHERE role = 'Employee' AND department_public_id = ?`,
        [departmentPublicId]
      );
      const employees = (rows || []).map((row) => ({
        id: row.public_id || String(row._id),
        internalId: row._id ? String(row._id) : null,
        name: row.name || null,
        email: row.email || null,
        phone: row.phone || null,
        title: row.title || null,
        role: row.role || null,
        isActive: row.isActive !== undefined ? Boolean(row.isActive) : null,
        isGuest: row.isGuest !== undefined ? Boolean(row.isGuest) : null,
        departmentPublicId: row.department_public_id || null
      }));
      return res.json({ success: true, data: employees, meta: { count: employees.length } });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  getManagerOverview: async (req, res) => {
    try {
      await requireFeatureAccess(req, 'Dashboard');

      // metrics
      const projects = await gatherManagerProjects(req);
      const projectIds = dedupe(projects.map(p => p.id)).filter(Boolean);
      const projectPublicIds = dedupe(projects.map(p => p.public_id)).filter(Boolean);
      const projectCount = projects.length;
      const taskCount = await countRelatedTasks(projectIds, projectPublicIds);

      // clients (assigned to manager via RoleBasedLoginResponse or fallback)
      const resources = await RoleBasedLoginResponse.getAccessibleResources(req.user._id, req.user.role, req.user.tenant_id, req.user.id);
      let assignedClientIds = Array.isArray(resources.assignedClientIds) ? resources.assignedClientIds.filter(Boolean) : [];
      if (!assignedClientIds.length) {
        try {
          const uid = req.user && req.user._id;
          const pub = req.user && req.user.id;
          const direct = await queryAsync('SELECT id FROM clientss WHERE manager_id = ? OR manager_id = ? LIMIT 1000', [uid, pub || -1]);
          assignedClientIds = (direct || []).map(r => r.id).filter(Boolean);
          if (!assignedClientIds.length) {
            const viaProjects = await queryAsync(
              `SELECT DISTINCT c.id AS id FROM projects p INNER JOIN clientss c ON c.id = p.client_id WHERE (p.project_manager_id = ? OR p.project_manager_id = ? OR p.manager_id = ? OR p.manager_id = ?)`,
              [uid, pub || -1, uid, pub || -1]
            );
            assignedClientIds = (viaProjects || []).map(r => r.id).filter(Boolean);
          }
        } catch (e) { assignedClientIds = []; }
      }

      const hasClientPublic = await cachedHasColumn('clientss', 'public_id');
      const clientSelect = hasClientPublic ? 'id, public_id, ref, name, company' : 'id, ref, name, company';
      const clients = assignedClientIds.length
        ? (await queryAsync(`SELECT ${clientSelect} FROM clientss WHERE id IN (?) AND (isDeleted IS NULL OR isDeleted != 1) ORDER BY id DESC`, [assignedClientIds]))
        : [];

      // employees in manager's department
      const deptPub = await fetchManagerDepartment(req.user._id);
      const hasUserPublic = await cachedHasColumn('users', 'public_id');
      const userSelect = hasUserPublic ? '_id, public_id, name, email, phone, title' : '_id, name, email, phone, title';
      const employees = deptPub
        ? (await queryAsync(`SELECT ${userSelect} FROM users WHERE role = 'Employee' AND department_public_id = ?`, [deptPub])).map(r => ({ id: (hasUserPublic ? (r.public_id || String(r._id)) : String(r._id)), internalId: r._id ? String(r._id) : null, name: r.name || null, email: r.email || null, phone: r.phone || null, title: r.title || null }))
        : [];

      const timeline = await fetchTaskTimeline(projectIds, projectPublicIds);
      const tasks = (timeline || []).slice(0, 50).map(t => {
        const assignedInternal = t.assigned_user_internal_ids ? String(t.assigned_user_internal_ids).split(',') : [];
        const assignedPublic = t.assigned_user_public_ids ? String(t.assigned_user_public_ids).split(',') : [];
        const assignedNames = t.assigned_user_names ? String(t.assigned_user_names).split(',') : [];
        const assignedUsers = assignedPublic.map((publicId, idx) => ({
          id: publicId || (assignedInternal[idx] ? String(assignedInternal[idx]) : null),
          internalId: assignedInternal[idx] ? String(assignedInternal[idx]) : null,
          name: assignedNames[idx] || null
        }));

        return {
          id: t.task_id ? String(t.task_id) : String(t.task_internal_id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          taskDate: t.taskDate ? new Date(t.taskDate).toISOString() : null,
          client: { id: t.client_public_id || (t.client_id ? String(t.client_id) : null), name: t.client_name || null },
          project: { id: t.project_public_id || (t.project_internal_id ? String(t.project_internal_id) : null), name: t.project_name || null },
          assignedUsers: assignedUsers.length ? assignedUsers : []
        };
      });

      return res.json({
        metrics: { projectCount, taskCount, clientCount: clients.length },
        projects: projects.map(p => ({ id: p.public_id || String(p.id), name: p.name, status: p.status, priority: p.priority, stage: p.stage || null, client: p.client_id ? { id: p.client_public_id || String(p.client_id), name: p.client_name } : null })),
        clients: (clients || []).map(c => ({ id: c.public_id || String(c.id), name: c.name, company: c.company || null })),
        employees,
        tasks,
      });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  listEmployees: async (req, res) => {
    try {
      await requireFeatureAccess(req, 'Tasks');
      const rows = await queryAsync(
        `SELECT _id, public_id, name, email, phone, title, isActive, isGuest, department_public_id
         FROM users
         WHERE role = 'Employee'`
      );
      const employees = (rows || []).map((row) => ({
        id: row.public_id || String(row._id),
        internalId: row._id ? String(row._id) : null,
        name: row.name || null,
        email: row.email || null,
        phone: row.phone || null,
        title: row.title || null,
        isActive: row.isActive !== undefined ? Boolean(row.isActive) : null,
        isGuest: row.isGuest !== undefined ? Boolean(row.isGuest) : null,
        departmentPublicId: row.department_public_id || null
      }));
      return res.json({ success: true, data: employees, meta: { count: employees.length } });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  }
};
