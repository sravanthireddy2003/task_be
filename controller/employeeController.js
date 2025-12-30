const db = require(__root + 'db');
const RoleBasedLoginResponse = require(__root + 'controller/utils/RoleBasedLoginResponse');

const MAX_CHECKLIST_ITEMS = 10;
const columnExistenceCache = {};
let subtaskColumnPresenceCache = null;

const queryAsync = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

async function hasColumn(table, column) {
  const cacheKey = `${table}::${column}`;
  if (columnExistenceCache[cacheKey] !== undefined) return columnExistenceCache[cacheKey];
  const rows = await queryAsync(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  columnExistenceCache[cacheKey] = Array.isArray(rows) && rows.length > 0;
  return columnExistenceCache[cacheKey];
}

async function getSubtaskColumnPresence() {
  if (subtaskColumnPresenceCache) return subtaskColumnPresenceCache;
  const columnsToCheck = ['description', 'completed_at', 'created_at', 'updated_at', 'created_by', 'deleted_at', 'isDeleted'];
  const presence = {};
  for (const col of columnsToCheck) {
    presence[col] = await hasColumn('subtasks', col);
  }
  subtaskColumnPresenceCache = presence;
  return presence;
}

async function buildTenantClause(alias = 't', tenantId) {
  const columnExists = await hasColumn('tasks', 'tenant_id');
  if (!columnExists) return { clause: '', params: [] };
  if (tenantId !== undefined && tenantId !== null) {
    return { clause: `AND ${alias}.tenant_id = ?`, params: [tenantId] };
  }
  return { clause: `AND ${alias}.tenant_id IS NULL`, params: [] };
}

async function buildTaskDeletionClause(alias = 't') {
  const columnExists = await hasColumn('tasks', 'isDeleted');
  if (!columnExists) return { clause: '', params: [] };
  return { clause: `AND (${alias}.isDeleted IS NULL OR ${alias}.isDeleted != 1)`, params: [] };
}

async function buildSubtaskDeletedClause(alias = 's') {
  const columnExists = await hasColumn('subtasks', 'isDeleted');
  if (!columnExists) return { clause: '', params: [] };
  return { clause: `AND (${alias}.isDeleted IS NULL OR ${alias}.isDeleted != 1)`, params: [] };
}

async function buildProjectJoinClause() {
  const projectIdExists = await hasColumn('tasks', 'project_id');
  const projectPublicIdExists = await hasColumn('tasks', 'project_public_id');
  const startedAtExists = await hasColumn('tasks', 'started_at');
  const liveTimerExists = await hasColumn('tasks', 'live_timer');
  const joinClauses = [];
  const selects = [];
  const joinConditions = [];
  if (projectIdExists) {
    joinConditions.push('p.id = t.project_id');
  }
  if (projectPublicIdExists) {
    joinConditions.push('p.public_id = t.project_public_id');
  }
  if (joinConditions.length) {
    joinClauses.push(`LEFT JOIN projects p ON (${joinConditions.join(' OR ')})`);
    selects.push('p.id AS project_internal_id', 'p.name AS project_name', 'p.status AS project_status', 'p.priority AS project_priority');
  }
  if (projectPublicIdExists) {
    selects.push('t.project_public_id AS project_public_id');
  }
  if (startedAtExists) {
    selects.push('t.started_at');
  }
  if (liveTimerExists) {
    selects.push('t.live_timer');
  }
  return { join: joinClauses.join(' '), selects };
}

function formatChecklistItem(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    title: row.title || null,
    description: row.description || null,
    status: row.status || null,
    dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function fetchChecklistMap(taskIds = []) {
  if (!taskIds.length) return {};
  const uniqueIds = Array.from(new Set(taskIds));
  const { clause } = await buildSubtaskDeletedClause('s');
  const { description, completed_at, created_at, updated_at } = await getSubtaskColumnPresence();
  const checklistColumns = ['id', 'task_id', 'title'];
  if (description) checklistColumns.push('description');
  checklistColumns.push('status', 'due_date');
  if (completed_at) checklistColumns.push('completed_at');
  if (created_at) checklistColumns.push('created_at');
  if (updated_at) checklistColumns.push('updated_at');
  const rows = await queryAsync(
    `SELECT ${checklistColumns.join(', ')}
     FROM subtasks s
     WHERE s.task_id IN (?) ${clause}
     ORDER BY s.created_at ASC`,
    [uniqueIds]
  );
  const map = {};
  (rows || []).forEach(row => {
    const formatted = formatChecklistItem(row);
    if (!map[row.task_id]) map[row.task_id] = [];
    map[row.task_id].push(formatted);
  });
  return map;
}

async function ensureAssignedTask(taskId, userId, tenantId) {
  // Resolve taskId to internal id if it's public_id
  let internalTaskId = taskId;
  if (typeof taskId === 'string' && !/^\d+$/.test(taskId)) { // if not numeric, assume public_id
    const taskRows = await queryAsync('SELECT id FROM tasks WHERE public_id = ?', [taskId]);
    if (taskRows.length === 0) {
      throw new Error('Task not found');
    }
    internalTaskId = taskRows[0].id;
  }
  const { clause, params } = await buildTenantClause('t', tenantId);
  const rows = await queryAsync(
    `SELECT t.id
     FROM taskassignments ta
     INNER JOIN tasks t ON t.id = ta.task_id
     WHERE ta.task_id = ? AND ta.user_id = ? ${clause}
     LIMIT 1`,
    [internalTaskId, userId, ...params]
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw accessDenied('Access denied: task not assigned to you');
  }
  return rows[0];
}

async function ensureSubtaskPermission(subtaskId, userId, tenantId) {
  const { clause, params } = await buildTenantClause('t', tenantId);
  const rows = await queryAsync(
    `SELECT s.id
     FROM subtasks s
     INNER JOIN tasks t ON t.id = s.task_id
     INNER JOIN taskassignments ta ON ta.task_id = t.id
     WHERE s.id = ? AND ta.user_id = ? ${clause}
     LIMIT 1`,
    [subtaskId, userId, ...params]
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw accessDenied('Access denied: cannot modify this subtask');
  }
  return rows[0];
}

function accessDenied(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

async function requireFeatureAccess(req, feature) {
  const resources = await RoleBasedLoginResponse.getAccessibleResources(req.user._id, req.user.role, req.user.tenant_id, req.user.id);
  if (!resources || !Array.isArray(resources.features) || !resources.features.includes(feature)) {
    throw accessDenied(`Access denied: ${feature} feature`);
  }
  return resources;
}

async function insertChecklistItem({ taskId, title, description, dueDate, userId, tenantId }) {
  if (!title) {
    const error = new Error('Checklist title is required');
    error.status = 400;
    throw error;
  }
  const taskInfo = await ensureAssignedTask(taskId, userId, tenantId);
  const internalTaskId = taskInfo.id;
  const { clause } = await buildSubtaskDeletedClause('s');
  const countRows = await queryAsync(`SELECT COUNT(*) AS total FROM subtasks s WHERE s.task_id = ? ${clause}`, [internalTaskId]);
  const existingCount = countRows && countRows[0] ? Number(countRows[0].total || 0) : 0;
  if (existingCount >= MAX_CHECKLIST_ITEMS) {
    const error = new Error(`Checklist cannot have more than ${MAX_CHECKLIST_ITEMS} items`);
    error.status = 400;
    throw error;
  }
  const columnsPresence = await getSubtaskColumnPresence();
  const insertColumns = [];
  const placeholders = [];
  const insertParams = [];

  const pushParam = (column, value) => {
    insertColumns.push(column);
    placeholders.push('?');
    insertParams.push(value);
  };

  pushParam('task_id', internalTaskId);
  pushParam('title', title);
  if (columnsPresence.description) {
    pushParam('description', description || null);
  }
  pushParam('status', 'Pending');
  pushParam('due_date', dueDate || null);
  if (columnsPresence.created_by) {
    pushParam('created_by', userId);
  }
  if (columnsPresence.created_at) {
    insertColumns.push('created_at');
    placeholders.push('NOW()');
  }
  const result = await queryAsync(
    `INSERT INTO subtasks (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    insertParams
  );
  const insertedRows = await queryAsync('SELECT * FROM subtasks WHERE id = ? LIMIT 1', [result.insertId]);
  return insertedRows[0];
}

function buildClientPayload(row) {
  if (!row.client_id && !row.client_name) return null;
  return {
    id: row.client_id != null ? String(row.client_id) : null,
    name: row.client_name || null
  };
}

function buildProjectPayload(row) {
  const hasInternal = row.project_internal_id != null;
  const hasPublic = row.project_public_id != null;
  if (!hasInternal && !hasPublic) return null;
  return {
    id: hasInternal ? String(row.project_internal_id) : null,
    publicId: hasPublic ? row.project_public_id : null,
    name: row.project_name || null,
    status: row.project_status || null,
    priority: row.project_priority || null
  };
}

module.exports = {
  getMyTasks: async (req, res) => {
    try {
      await requireFeatureAccess(req, 'Assigned Tasks');
      const { clause: tenantClause, params: tenantParams } = await buildTenantClause('t', req.user.tenant_id);
      const { clause: taskDeletionClause } = await buildTaskDeletionClause('t');
      const projectData = await buildProjectJoinClause();
      const taskDescriptionExists = await hasColumn('tasks', 'description');
      const selectParts = [
        't.id',
        't.public_id',
        't.title',
        ...(taskDescriptionExists ? ['t.description'] : []),
        't.status',
        't.stage',
        't.priority',
        't.taskDate',
        't.client_id',
        'c.name AS client_name'
      ].concat(projectData.selects);
      const rows = await queryAsync(
        `SELECT
           ${selectParts.join(', ')},
           GROUP_CONCAT(DISTINCT ua._id) AS assigned_user_ids,
           GROUP_CONCAT(DISTINCT ua.public_id) AS assigned_user_public_ids,
           GROUP_CONCAT(DISTINCT ua.name) AS assigned_user_names
         FROM tasks t
        INNER JOIN taskassignments ta_user ON ta_user.task_id = t.id AND ta_user.user_id = ?
         LEFT JOIN taskassignments ta_all ON ta_all.task_id = t.id
         LEFT JOIN users ua ON ua._id = ta_all.user_id
         ${projectData.join}
         LEFT JOIN clientss c ON c.id = t.client_id
        WHERE 1=1
          ${taskDeletionClause}
          ${tenantClause}
         GROUP BY t.id
         ORDER BY t.updatedAt DESC`,
        [req.user._id, ...tenantParams]
      );
      const taskIds = (rows || []).map(r => r.id).filter(Boolean);
      const checklistMap = await fetchChecklistMap(taskIds);
      const tasks = (rows || []).map(r => {
        const assignedIds = r.assigned_user_ids ? String(r.assigned_user_ids).split(',') : [];
        const assignedPublic = r.assigned_user_public_ids ? String(r.assigned_user_public_ids).split(',') : [];
        const assignedNames = r.assigned_user_names ? String(r.assigned_user_names).split(',') : [];
        const assignedUsers = assignedIds.map((internalId, index) => ({
          id: assignedPublic[index] || String(internalId),
          internalId: String(internalId),
          name: assignedNames[index] || null
        }));
        // Overdue/on-time summary
        let summary = {};
        try {
          const now = new Date();
          let estDate = r.taskDate ? new Date(r.taskDate) : null;
          if (estDate) {
            summary.dueStatus = estDate < now ? 'Overdue' : 'On Time';
            summary.dueDate = estDate.toISOString();
          }
        } catch (e) {
          summary.error = 'Could not calculate summary';
        }
        return {
          id: r.public_id ? String(r.public_id) : String(r.id),
          title: r.title || null,
          description: r.description || null,
          stage: r.stage || null,
          priority: r.priority || null,
          status: r.status || null,
          taskDate: r.taskDate ? new Date(r.taskDate).toISOString() : null,
          client: buildClientPayload(r),
          project: buildProjectPayload(r),
          assignedUsers,
          checklist: checklistMap[r.id] || [],
          started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
          live_timer: r.live_timer ? new Date(r.live_timer).toISOString() : null,
          summary
        };
      });
      // Group tasks by status for kanban
      const statusMap = {};
      tasks.forEach(task => {
        const status = (task.status || task.stage || 'PENDING').toUpperCase();
        if (!statusMap[status]) statusMap[status] = [];
        statusMap[status].push(task);
      });
      const possibleStatuses = ['PENDING', 'TO DO', 'IN PROGRESS', 'ON HOLD', 'REVIEW', 'COMPLETED'];
      const kanban = possibleStatuses.map(status => ({
        status,
        count: (statusMap[status] || []).length,
        tasks: statusMap[status] || [],
        ...((statusMap[status] || []).length === 0 ? { message: `No tasks in ${status.replace('_', ' ').toLowerCase()}` } : {})
      }));
      return res.json({ success: true, data: tasks, kanban });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  createChecklistItem: async (req, res) => {
    try {
      const { taskId } = req.params;
      const { title, description, dueDate } = req.body;
      const inserted = await insertChecklistItem({
        taskId,
        title,
        description,
        dueDate,
        userId: req.user._id,
        tenantId: req.user.tenant_id
      });
      return res.status(201).json({ success: true, data: formatChecklistItem(inserted) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  updateChecklistItem: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, dueDate, status } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Checklist item id required' });
      }
      await ensureSubtaskPermission(id, req.user._id, req.user.tenant_id);
      const updates = [];
      const params = [];
      if (title) {
        updates.push('title = ?');
        params.push(title);
      }
      if (description) {
        updates.push('description = ?');
        params.push(description);
      }
      if (dueDate) {
        updates.push('due_date = ?');
        params.push(dueDate);
      }
      if (status) {
        updates.push('status = ?');
        params.push(status);
      }
      if (!updates.length) {
        return res.status(400).json({ success: false, error: 'Nothing to update' });
      }
      const columnsPresence = await getSubtaskColumnPresence();
      if (columnsPresence.updated_at) {
        updates.push('updated_at = NOW()');
      }
      const sql = `UPDATE subtasks SET ${updates.join(', ')} WHERE id = ?`;
      await queryAsync(sql, [...params, id]);
      const rows = await queryAsync('SELECT * FROM subtasks WHERE id = ? LIMIT 1', [id]);
      return res.json({ success: true, data: formatChecklistItem(rows[0]) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  completeChecklistItem: async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Checklist item id required' });
      }
      await ensureSubtaskPermission(id, req.user._id, req.user.tenant_id);
      const columnsPresence = await getSubtaskColumnPresence();
      const updates = ['status = ?'];
      const params = ['Completed'];
      if (columnsPresence.completed_at) {
        updates.push('completed_at = NOW()');
      }
      if (columnsPresence.updated_at) {
        updates.push('updated_at = NOW()');
      }
      await queryAsync(`UPDATE subtasks SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
      const rows = await queryAsync('SELECT * FROM subtasks WHERE id = ? LIMIT 1', [id]);
      return res.json({ success: true, data: formatChecklistItem(rows[0]) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  softDeleteChecklistItem: async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Checklist item id required' });
      }
      await ensureSubtaskPermission(id, req.user._id, req.user.tenant_id);
      const columnsPresence = await getSubtaskColumnPresence();
      const updates = ['status = ?'];
      const params = ['Completed'];
      if (columnsPresence.isDeleted) {
        updates.push('isDeleted = 1');
      }
      if (columnsPresence.completed_at) {
        updates.push('completed_at = NOW()');
      }
      if (columnsPresence.updated_at) {
        updates.push('updated_at = NOW()');
      }
      if (columnsPresence.deleted_at) {
        updates.push('deleted_at = NOW()');
      }
      await queryAsync(`UPDATE subtasks SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
      const rows = await queryAsync('SELECT * FROM subtasks WHERE id = ? LIMIT 1', [id]);
      return res.json({ success: true, data: formatChecklistItem(rows[0]) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  deleteChecklistItem: async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: 'Checklist item id required' });
      }
      await ensureSubtaskPermission(id, req.user._id, req.user.tenant_id);
      const hasDeleted = await hasColumn('subtasks', 'isDeleted');
      if (hasDeleted) {
        await queryAsync('UPDATE subtasks SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
      } else {
        await queryAsync('DELETE FROM subtasks WHERE id = ?', [id]);
      }
      return res.json({ success: true, message: 'Checklist item deleted' });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  addSubtask: async (req, res) => {
    try {
      const { taskId, title, description, dueDate } = req.body;
      const inserted = await insertChecklistItem({
        taskId,
        title,
        description,
        dueDate,
        userId: req.user._id,
        tenantId: req.user.tenant_id
      });
      return res.json({ success: true, data: formatChecklistItem(inserted) });
    } catch (error) {
      return res.status(error.status || 500).json({ success: false, error: error.message });
    }
  },

  updateSubtask: async (req, res) => {
    return module.exports.updateChecklistItem(req, res);
  }
};
