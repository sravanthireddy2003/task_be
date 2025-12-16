const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const emailService = require(__root + 'utils/emailService');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function hasColumn(table, column) {
  try {
    const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

async function findExistingColumn(table, candidates) {
  for (const c of candidates) {
    if (await hasColumn(table, c)) return c;
  }
  // Fallback: scan table columns and match by patterns
  try {
    const cols = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]);
    if (Array.isArray(cols) && cols.length > 0) {
      const names = cols.map(r => String(r.COLUMN_NAME || r.column_name || r.COLUMN_NAME).toLowerCase());
      // project-like
      for (const n of names) {
        if (n.includes('project') || n.includes('proj')) return cols[names.indexOf(n)].COLUMN_NAME;
      }
      // department-like
      for (const n of names) {
        if (n.includes('department') || n.includes('dept')) return cols[names.indexOf(n)].COLUMN_NAME;
      }
      // created_by-like
      for (const n of names) {
        if (n.includes('created') || n.includes('created_by') || n.includes('createdby')) return cols[names.indexOf(n)].COLUMN_NAME;
      }
      // assigned-like
      for (const n of names) {
        if (n.includes('assign') || n.includes('assigned')) return cols[names.indexOf(n)].COLUMN_NAME;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// ==================== CREATE TASK ====================
// POST /api/tasks
router.post('/', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectPublicId, departmentPublicId, projectId, departmentId, title, description, priority = 'Medium', assignedTo, startDate, endDate, estimatedHours } = req.body;

    const projectParam = projectPublicId || projectId;
    const departmentParam = departmentPublicId || departmentId;

    if (!projectParam || !departmentParam || !title) {
      return res.status(400).json({ success: false, message: 'projectPublicId/projectId, departmentPublicId/departmentId, and title are required' });
    }

    // Verify project exists (accept public_id or numeric id)
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectParam, projectParam]);
    if (!project || project.length === 0) {
      // If project not found, allow Admins and Managers to receive their visible project list
      if (!req.user || ['Admin', 'Manager'].includes(req.user.role)) {
        // reuse the no-projectId flow to return projects visible to the user
        let projects;
        if (req.user && req.user.role === 'Admin') {
          projects = await q('SELECT * FROM projects WHERE is_active = 1 ORDER BY created_at DESC');
        } else if (req.user && req.user.role === 'Manager') {
          projects = await q(`
            SELECT DISTINCT p.* FROM projects p
            LEFT JOIN project_departments pd ON p.id = pd.project_id
            LEFT JOIN departments d ON pd.department_id = d.id
            WHERE p.is_active = 1 AND (
              p.project_manager_id = ? OR
              d.id IN (SELECT department_id FROM users u WHERE u._id = ?)
            )
            ORDER BY p.created_at DESC
          `, [req.user ? req.user._id : null, req.user ? req.user._id : null]);
        } else {
          projects = [];
        }

        const enriched = await Promise.all(projects.map(async (p) => {
          const depts = await q(`
            SELECT pd.department_id, d.name, d.public_id
            FROM project_departments pd
            JOIN departments d ON pd.department_id = d.id
            WHERE pd.project_id = ?
          `, [p.id]);
          const out = {
            ...p,
            id: p.public_id,
            departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
          };
          if (p.project_manager_id) {
            const pm = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [p.project_manager_id]);
            if (pm && pm.length > 0) out.project_manager = { id: pm[0].public_id, name: pm[0].name };
          }
          return out;
        }));

        return res.json({ success: true, data: enriched });
      }

      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Resolve department internal id (accept public_id or numeric)
    let department_internal = departmentParam;
    if (typeof departmentParam === 'string' && !/^\d+$/.test(departmentParam)) {
      const drows = await q('SELECT id FROM departments WHERE public_id = ? LIMIT 1', [departmentParam]);
      if (!drows || drows.length === 0) return res.status(400).json({ success: false, message: 'Department not found' });
      department_internal = drows[0].id;
    }

    // Verify department is linked to project
    const deptMapping = await q('SELECT * FROM project_departments WHERE project_id = ? AND department_id = ? LIMIT 1', [project[0].id, department_internal]);
    if (!deptMapping || deptMapping.length === 0) {
      return res.status(400).json({ success: false, message: 'Department is not linked to this project' });
    }

    const publicId = crypto.randomBytes(8).toString('hex');
    // Ensure `public_id` column exists on tasks table; attempt to add if missing
    let tasksHasPublic = await hasColumn('tasks', 'public_id');
    if (!tasksHasPublic) {
      try {
        await q('ALTER TABLE tasks ADD COLUMN public_id VARCHAR(64) NULL UNIQUE');
        tasksHasPublic = true;
      } catch (e) {
        logger.warn('Tasks: could not add public_id column to tasks table:', e && e.message ? e.message : e);
        tasksHasPublic = false;
      }
    }
    const createdBy = req.user._id;

    // Resolve assignedTo (accept public_id -> _id)
    let assigned_internal = null;
    if (assignedTo) {
      if (typeof assignedTo === 'string' && !/^\d+$/.test(assignedTo)) {
        const u = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [assignedTo]);
        if (u && u.length > 0) assigned_internal = u[0]._id;
        else assigned_internal = null;
      } else {
        assigned_internal = assignedTo;
      }
    }

    // Determine actual column names on `tasks` table to avoid ER_BAD_FIELD_ERROR
    const projectCol = await findExistingColumn('tasks', ['project_id', 'projectId', 'project']);
    const deptCol = await findExistingColumn('tasks', ['department_id', 'departmentId', 'department']);
    const assignedCol = await findExistingColumn('tasks', ['assigned_to', 'assignedTo', 'assigned']);
    const createdByCol = await findExistingColumn('tasks', ['created_by', 'createdBy', 'created']);
    const publicColName = tasksHasPublic ? (await findExistingColumn('tasks', ['public_id', 'publicId'])) || 'public_id' : null;

    if (!projectCol || !deptCol || !createdByCol) {
      return res.status(500).json({ success: false, error: 'Tasks table missing expected columns (project/department/created_by). Please check DB schema.' });
    }

    // Detect optional date and estimated columns
    const startDateCol = await findExistingColumn('tasks', ['start_date', 'startDate', 'start']);
    const dueDateCol = await findExistingColumn('tasks', ['due_date', 'dueDate', 'due']);
    let estimatedCol = await findExistingColumn('tasks', ['estimated_hours', 'estimatedHours', 'estimated']);
    const statusCol = await findExistingColumn('tasks', ['status']);

    // If estimated column missing, try to add it (best-effort)
    if (!estimatedCol) {
      try {
        await q('ALTER TABLE tasks ADD COLUMN estimated_hours DECIMAL(8,2) NULL');
        // refresh detection
        const ec = await findExistingColumn('tasks', ['estimated_hours', 'estimatedHours', 'estimated']);
        if (ec) {
          estimatedCol = ec;
        }
      } catch (e) {
        // ignore failures
      }
    }

    // Use a mutable var for estimated column name
    let estimatedColName = estimatedCol || (await findExistingColumn('tasks', ['estimated_hours', 'estimatedHours', 'estimated']));

    // Build columns and params dynamically
    const cols = [];
    const placeholders = [];
    const paramsArr = [];
    if (publicColName) {
      cols.push(publicColName);
      placeholders.push('?');
      paramsArr.push(publicId);
    }
    cols.push(projectCol); placeholders.push('?'); paramsArr.push(project[0].id);
    cols.push(deptCol); placeholders.push('?'); paramsArr.push(department_internal);
    cols.push('title'); placeholders.push('?'); paramsArr.push(title);
    cols.push('description'); placeholders.push('?'); paramsArr.push(description || null);
    cols.push('priority'); placeholders.push('?'); paramsArr.push(priority);
    if (assignedCol) { cols.push(assignedCol); placeholders.push('?'); paramsArr.push(assigned_internal || null); }
    if (startDateCol) { cols.push(startDateCol); placeholders.push('?'); paramsArr.push(startDate || null); }
    if (dueDateCol) { cols.push(dueDateCol); placeholders.push('?'); paramsArr.push(endDate || null); }
    if (estimatedColName) { cols.push(estimatedColName); placeholders.push('?'); paramsArr.push(estimatedHours || null); }
    if (statusCol) { cols.push(statusCol); placeholders.push('?'); paramsArr.push('New'); }
    cols.push(createdByCol); placeholders.push('?'); paramsArr.push(createdBy);

    // Deduplicate columns/params (prevent 'column specified twice' errors)
    const seenCols = new Set();
    const dedupCols = [];
    const dedupParams = [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!seenCols.has(c)) {
        seenCols.add(c);
        dedupCols.push(c);
        dedupParams.push(paramsArr[i]);
      }
    }
    const taskSql = `INSERT INTO tasks (${dedupCols.join(', ')}) VALUES (${dedupCols.map(() => '?').join(', ')})`;

    const result = await q(taskSql, dedupParams);
    const taskId = result.insertId;

    // If we couldn't store public_id earlier, attempt to update this row with generated publicId
    if (!tasksHasPublic) {
      try {
        await q('ALTER TABLE tasks ADD COLUMN public_id VARCHAR(64) NULL UNIQUE');
        await q('UPDATE tasks SET public_id = ? WHERE id = ?', [publicId, taskId]);
      } catch (e) {
        // ignore — response will include generated publicId even if not persisted
        logger.warn('Tasks: failed to persist public_id for task', taskId, e && e.message ? e.message : e);
      }
    }

    // Log activity
    await q('INSERT INTO task_activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)', [taskId, createdBy, 'created', `Task "${title}" created`]);

    const task = await q('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    // Build a sanitized response: no null values, enrich department and assigned user, include subtask count
    let out = {};
    if (task && task[0]) {
      const row = task[0];
      out = {
        id: row.public_id,
        public_id: row.public_id,
        title: row.title,
        description: row.description || undefined,
        priority: row.priority || undefined,
        status: row.status || undefined,
        projectPublicId: project[0] && project[0].public_id ? project[0].public_id : undefined,
        subtask_count: 0,
        created_at: row.created_at
      };

      // department
      try {
        const deptPub = await q('SELECT public_id, name FROM departments WHERE id = ? LIMIT 1', [row.department_id]);
        if (Array.isArray(deptPub) && deptPub.length > 0) {
          out.departmentPublicId = deptPub[0].public_id || undefined;
          out.departmentName = deptPub[0].name || undefined;
        }
      } catch (e) { /* ignore */ }

      // assigned user
      if (row.assigned_to) {
        try {
          const u = await q('SELECT _id, public_id, name, email FROM users WHERE _id = ? LIMIT 1', [row.assigned_to]);
          if (Array.isArray(u) && u.length > 0) {
            out.assigned_user = { id: u[0].public_id || u[0]._id, name: u[0].name || undefined, email: u[0].email || undefined };
          } else {
            out.assigned_user = { id: row.assigned_to };
          }
        } catch (e) {
          out.assigned_user = { id: row.assigned_to };
        }
      }

      // subtask count
      try {
        const sc = await q('SELECT COUNT(1) AS cnt FROM subtasks WHERE task_id = ?', [row.id]);
        if (Array.isArray(sc) && sc.length > 0) out.subtask_count = sc[0].cnt || 0;
      } catch (e) { out.subtask_count = 0; }

      // remove keys that are null/undefined
      Object.keys(out).forEach(k => { if (out[k] === null || out[k] === undefined) delete out[k]; });
    }

    res.status(201).json({ success: true, data: out });

    // send assignment email if applicable (best-effort)
    try {
      if (task && task[0] && task[0].assigned_to) {
        const user = (await q('SELECT name, email, public_id FROM users WHERE _id = ? LIMIT 1', [task[0].assigned_to]))[0];
        if (user && user.email) {
          const subject = `You have been assigned a new task: ${task[0].title || ''}`;
          const est = task[0].estimated_hours ? `Estimated hours: ${task[0].estimated_hours}` : '';
          const projectPid = project[0] && project[0].public_id ? project[0].public_id : '';
          const body = `Hello ${user.name || ''},\n\nYou have been assigned a new task (${task[0].public_id}) in project ${projectPid}.\nTitle: ${task[0].title || ''}\n${task[0].description ? 'Description: ' + task[0].description + '\n' : ''}${est}\n\nPlease complete the task within the assigned hours.\n\nRegards,\nTeam`;
          if (emailService && typeof emailService.sendEmail === 'function') {
            emailService.sendEmail(user.email, subject, body).catch(err => logger.warn('Email send failed: ' + (err && err.message)));
          } else {
            logger.info('Assignment email (no emailService):', { to: user.email, subject, body });
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to send assignment email: ' + (e && e.message));
    }
  } catch (e) {
    logger.error('Create task error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET TASKS (Department-Aware) ====================
// GET /api/tasks?projectId=X&departmentId=Y
router.get('/', async (req, res) => {
  try {
    const { projectPublicId, departmentPublicId, projectId, departmentId } = req.query;

    const projectParam = projectPublicId || projectId;
    const departmentParam = departmentPublicId || departmentId;

    // If requireAuth middleware didn't attach a user (token may be provided directly), try to verify token here
    if (!req.user) {
      const auth = req.headers.authorization || req.headers.Authorization || req.headers['authorization'];
      if (auth && auth.startsWith('Bearer ')) {
        const token = auth.split(' ')[1];
        try {
          const payload = jwt.verify(token, process.env.SECRET || 'secret');
          if (payload && payload.id) {
            const tokenId = payload.id;
            const isNumeric = /^\d+$/.test(String(tokenId));
            const sql = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
            const users = await q(sql, [tokenId]);
            if (users && users.length > 0) {
              const user = users[0];
              const externalId = user.public_id || user._id;
              req.user = {
                _id: user._id,
                id: externalId,
                public_id: user.public_id || null,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id
              };
            }
          }
        } catch (e) {
          logger.warn('Tasks GET: token verification failed in-handler:', e && e.message ? e.message : e);
        }
      }
    }

    // If no projectId provided, return projects visible to the user (based on role)
    if (!projectParam) {
      let projects;
      if (req.user.role === 'Admin') {
        projects = await q('SELECT * FROM projects ORDER BY created_at DESC');
      } else if (req.user.role === 'Manager') {
        projects = await q(`
          SELECT DISTINCT p.* FROM projects p
          LEFT JOIN project_departments pd ON p.id = pd.project_id
          LEFT JOIN departments d ON pd.department_id = d.id
          WHERE (
            p.project_manager_id = ? OR
            d.id IN (SELECT department_id FROM users u WHERE u._id = ?)
          )
          ORDER BY p.created_at DESC
        `, [req.user._id, req.user._id]);
      } else if (req.user.role === 'Employee') {
        projects = await q(`
          SELECT DISTINCT p.* FROM projects p
          JOIN project_departments pd ON p.id = pd.project_id
          JOIN departments d ON pd.department_id = d.id
          WHERE d.id = (SELECT department_id FROM users u WHERE u._id = ? LIMIT 1)
          ORDER BY p.created_at DESC
        `, [req.user._id]);
      } else {
        projects = [];
      }

      // Enrich with departments and project_manager public_id/name
      const enriched = await Promise.all(projects.map(async (p) => {
        const depts = await q(`
          SELECT pd.department_id, d.name, d.public_id
          FROM project_departments pd
          JOIN departments d ON pd.department_id = d.id
          WHERE pd.project_id = ?
        `, [p.id]);
        const out = {
            id: p.public_id,
            public_id: p.public_id,
            name: p.name,
            description: p.description,
            priority: p.priority,
            start_date: p.start_date,
            end_date: p.end_date,
            budget: p.budget,
            status: p.status,
            created_at: p.created_at,
            departments: depts.map(d => ({ public_id: d.public_id, name: d.name }))
          };
          if (p.project_manager_id) {
            const pm = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [p.project_manager_id]);
            if (pm && pm.length > 0) out.project_manager = { public_id: pm[0].public_id, name: pm[0].name };
          }
          return out;
        }));

      return res.json({ success: true, data: enriched });
    }

    logger.info(`Tasks GET: looking up projectParam=${projectParam}`);
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectParam, projectParam]);
    logger.info(`Tasks GET: project lookup returned ${project ? project.length : 0} rows for projectParam=${projectParam}`);
    if (!project || project.length === 0) {
      // Return an empty list when the requested project doesn't exist (frontend-friendly)
      return res.json({ success: true, data: [] });
    }

    const projectId_internal = project[0].id;

    // resolve department filter if provided (accept public_id or numeric)
    let department_filter_internal = null;
    const deptParam = departmentParam;
    if (deptParam) {
      if (typeof deptParam === 'string' && !/^\d+$/.test(deptParam)) {
        const dr = await q('SELECT id FROM departments WHERE public_id = ? LIMIT 1', [deptParam]);
        department_filter_internal = (dr && dr.length > 0) ? dr[0].id : null;
      } else {
        department_filter_internal = deptParam;
      }
    }

    let tasks;

    if (department_filter_internal) {
      // Fetch tasks for specific department
      tasks = await q(`
        SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u._id
        WHERE t.project_id = ? AND t.department_id = ?
        ORDER BY t.created_at DESC
      `, [projectId_internal, department_filter_internal]);
    } else {
      // Fetch all tasks for project in user's departments (based on role)
      if (req.user.role === 'Admin') {
        tasks = await q(`
          SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u._id
          WHERE t.project_id = ?
          ORDER BY t.created_at DESC
        `, [projectId_internal]);
      } else {
        // Employees/Managers see only their department tasks
        tasks = await q(`
          SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u._id
          WHERE t.project_id = ? AND t.department_id = (SELECT department_id FROM users WHERE _id = ? LIMIT 1)
          ORDER BY t.created_at DESC
        `, [projectId_internal, req.user._id]);
      }
    }

    // If no tasks exist for this project/department, create one demo task automatically
    try {
      if ((!tasks || tasks.length === 0)) {
        logger.info(`Tasks GET: no tasks found for project ${projectId_internal}, creating demo task`);

        // determine department to assign demo task
        let demoDept = department_filter_internal || departmentId;
        if (!demoDept) {
          const pd = await q('SELECT department_id FROM project_departments WHERE project_id = ? LIMIT 1', [projectId_internal]);
          demoDept = (pd && pd.length > 0) ? pd[0].department_id : null;
        }

        if (demoDept) {
          const demoPublic = crypto.randomBytes(8).toString('hex');
          const createdBy = req.user && req.user._id ? req.user._id : null;
          const demoTitle = `Demo Task - ${project[0].name || project[0].public_id}`;
          await q(`INSERT INTO tasks (public_id, project_id, department_id, title, description, priority, status, created_by) VALUES (?, ?, ?, ?, ?, 'Medium', 'New', ?)`, [demoPublic, projectId_internal, demoDept, demoTitle, 'Auto-generated demo task for UI', createdBy]);

          // re-fetch tasks using same filters
          if (department_filter_internal) {
            tasks = await q(`
              SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
              FROM tasks t
              LEFT JOIN users u ON t.assigned_to = u._id
              WHERE t.project_id = ? AND t.department_id = ?
              ORDER BY t.created_at DESC
            `, [projectId_internal, department_filter_internal]);
          } else {
            if (req.user.role === 'Admin') {
              tasks = await q(`
                SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
                FROM tasks t
                LEFT JOIN users u ON t.assigned_to = u._id
                WHERE t.project_id = ?
                ORDER BY t.created_at DESC
              `, [projectId_internal]);
            } else {
              tasks = await q(`
                SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
                FROM tasks t
                LEFT JOIN users u ON t.assigned_to = u._id
                WHERE t.project_id = ? AND t.department_id = (SELECT department_id FROM users WHERE _id = ? LIMIT 1)
                ORDER BY t.created_at DESC
              `, [projectId_internal, req.user._id]);
            }
          }
        } else {
          logger.warn(`Tasks GET: unable to determine department to create demo task for project ${projectId_internal}`);
        }
      }
    } catch (e) {
      logger.error('Tasks GET: error creating demo task:', e && e.message ? e.message : e);
    }

    // Enrich with subtask count and convert to public ids
    const enriched = await Promise.all(tasks.map(async (t) => {
      const subtaskCount = await q('SELECT COUNT(*) as count FROM subtasks WHERE task_id = ?', [t.id]);
      const deptPub = await q('SELECT public_id FROM departments WHERE id = ? LIMIT 1', [t.department_id]);
      return {
        id: t.public_id,
        public_id: t.public_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        projectPublicId: project[0].public_id,
        departmentPublicId: deptPub && deptPub.length > 0 ? deptPub[0].public_id : null,
        subtask_count: subtaskCount[0].count,
        assigned_user: t.assigned_user_name ? { id: t.assigned_user_id, name: t.assigned_user_name } : null,
        created_at: t.created_at
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (e) {
    logger.error('Get tasks error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET TASK BY ID ====================
// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await q('SELECT * FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);

    if (!task || task.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const t = task[0];
    const assignedUser = t.assigned_to ? await q('SELECT _id as id, public_id, name FROM users WHERE _id = ? LIMIT 1', [t.assigned_to]) : [];
    const subtasks = await q('SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at DESC', [t.id]);
    const deptPub = await q('SELECT public_id FROM departments WHERE id = ? LIMIT 1', [t.department_id]);
    const projPub = await q('SELECT public_id FROM projects WHERE id = ? LIMIT 1', [t.project_id]);

    res.json({
      success: true,
      data: {
        id: t.public_id,
        public_id: t.public_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        projectPublicId: projPub && projPub.length > 0 ? projPub[0].public_id : null,
        departmentPublicId: deptPub && deptPub.length > 0 ? deptPub[0].public_id : null,
        assigned_user: assignedUser.length > 0 ? { id: assignedUser[0].public_id, name: assignedUser[0].name } : null,
        subtasks: subtasks.map(st => ({ id: st.public_id, public_id: st.public_id, title: st.title, status: st.status })),
        subtask_count: subtasks.length,
        created_at: t.created_at
      }
    });
  } catch (e) {
    logger.error('Get task error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== UPDATE TASK ====================
// PUT /api/tasks/:id
router.put('/:id', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, status, priority, assignedTo, startDate, endDate, estimatedHours, actualHours, progressPercentage } = req.body;

    const task = await q('SELECT * FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!task || task.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const taskId = task[0].id;
    const updateFields = [];
    const params = [];

    if (title) { updateFields.push('title = ?'); params.push(title); }
    if (description) { updateFields.push('description = ?'); params.push(description); }
    if (status) { updateFields.push('status = ?'); params.push(status); }
    if (priority) { updateFields.push('priority = ?'); params.push(priority); }
    if (assignedTo) {
      // resolve assignedTo public_id -> _id when necessary
      if (typeof assignedTo === 'string' && !/^\d+$/.test(assignedTo)) {
        const ur = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [assignedTo]);
        if (ur && ur.length > 0) assignedTo = ur[0]._id;
        else assignedTo = null;
      }
      updateFields.push('assigned_to = ?'); params.push(assignedTo);
    }
    // detect actual column names for dates, estimated hours and status
    const startDateColUp = await findExistingColumn('tasks', ['start_date', 'startDate', 'start']);
    const dueDateColUp = await findExistingColumn('tasks', ['due_date', 'dueDate', 'due']);
    const estimatedColUp = await findExistingColumn('tasks', ['estimated_hours', 'estimatedHours', 'estimated']);
    const statusColUp = await findExistingColumn('tasks', ['status']);
    if (startDate && startDateColUp) { updateFields.push(startDateColUp + ' = ?'); params.push(startDate); }
    if (endDate && dueDateColUp) { updateFields.push(dueDateColUp + ' = ?'); params.push(endDate); }
    if (estimatedHours !== undefined && estimatedColUp) { updateFields.push(estimatedColUp + ' = ?'); params.push(estimatedHours); }
    if (status && statusColUp) { updateFields.push(statusColUp + ' = ?'); params.push(status); }
    if (estimatedHours) { updateFields.push('estimated_hours = ?'); params.push(estimatedHours); }
    if (actualHours) { updateFields.push('actual_hours = ?'); params.push(actualHours); }
    if (progressPercentage !== undefined) { updateFields.push('progress_percentage = ?'); params.push(progressPercentage); }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(taskId);
    const sql = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    await q(sql, params);

    // Log activity
    await q('INSERT INTO task_activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)', [taskId, req.user._id, 'updated', `Task updated: ${updateFields.join(', ')}`]);

    const updated = await q('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    const ut = updated[0];
    const deptPub = await q('SELECT public_id FROM departments WHERE id = ? LIMIT 1', [ut.department_id]);
    const projPub = await q('SELECT public_id FROM projects WHERE id = ? LIMIT 1', [ut.project_id]);
    res.json({
      success: true,
      data: {
        id: ut.public_id,
        public_id: ut.public_id,
        title: ut.title,
        description: ut.description,
        priority: ut.priority,
        status: ut.status,
        projectPublicId: projPub && projPub.length > 0 ? projPub[0].public_id : null,
        departmentPublicId: deptPub && deptPub.length > 0 ? deptPub[0].public_id : null,
        assigned_user: ut.assigned_to ? (await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [ut.assigned_to]))[0] : null,
        created_at: ut.created_at
      }
    });
  } catch (e) {
    logger.error('Update task error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== DELETE TASK ====================
// DELETE /api/tasks/:id
router.delete('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const task = await q('SELECT * FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);

    if (!task || task.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const taskId = task[0].id;
    await q('DELETE FROM subtasks WHERE task_id = ?', [taskId]);
    await q('DELETE FROM task_assignments WHERE task_id = ?', [taskId]);
    await q('DELETE FROM tasks WHERE id = ?', [taskId]);
    await q('INSERT INTO task_activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)', [taskId, req.user._id, 'deleted', 'Task deleted']);

    res.json({ success: true, message: 'Task deleted' });
  } catch (e) {
    logger.error('Delete task error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
