const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const NotificationService = require('../services/notificationService');
require('dotenv').config();
router.use(requireAuth);
 
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
 
router.post('/', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { projectName, description, clientPublicId, projectManagerId, projectManagerPublicId, project_manager_id, department_ids = [], departmentIds = [], departmentPublicIds = [], priority = 'Medium', startDate, endDate, start_date, end_date, budget } = req.body;
 
    if (!projectName || !clientPublicId) {
      return res.status(400).json({ success: false, message: 'projectName and clientPublicId are required' });
    }
 
    // Resolve client by public_id if column exists; otherwise accept numeric id
    const clientHasPublic = await hasColumn('clientss', 'public_id');
    let client;
    if (clientHasPublic) {
      client = await q('SELECT id, name, email FROM clientss WHERE public_id = ? LIMIT 1', [clientPublicId]);
    } else {
      if (/^\d+$/.test(String(clientPublicId))) {
        client = await q('SELECT id, name, email FROM clientss WHERE id = ? LIMIT 1', [clientPublicId]);
      } else {
        return res.status(400).json({ success: false, message: 'clients table has no public_id column; provide numeric client id instead' });
      }
    }
    if (!client || client.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    const clientId = client[0].id;
    const clientInfo = client[0]; // Store client details for email
 
    // Validate departments if provided. Accept departmentPublicIds, department_ids, or departmentIds (mixed numeric or public_id)
    const deptInput = Array.isArray(departmentPublicIds) && departmentPublicIds.length > 0 ? departmentPublicIds : (department_ids.length > 0 ? department_ids : departmentIds);
    let deptIdMap = {};
    let departmentNames = [];
    if (Array.isArray(deptInput) && deptInput.length > 0) {
      // split numeric ids and public_ids
      const numeric = deptInput.filter(d => /^\d+$/.test(String(d))).map(Number);
      const publicIds = deptInput.filter(d => !/^\d+$/.test(String(d)));
 
      let deptRecords = [];
      if (numeric.length > 0 && publicIds.length > 0) {
        const placeholdersNum = numeric.map(() => '?').join(',');
        const placeholdersPub = publicIds.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id, name FROM departments WHERE id IN (${placeholdersNum}) OR public_id IN (${placeholdersPub})`, [...numeric, ...publicIds]);
      } else if (numeric.length > 0) {
        const placeholdersNum = numeric.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id, name FROM departments WHERE id IN (${placeholdersNum})`, numeric);
      } else if (publicIds.length > 0) {
        const placeholdersPub = publicIds.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id, name FROM departments WHERE public_id IN (${placeholdersPub})`, publicIds);
      }
 
      deptRecords.forEach(d => {
        if (d.public_id) deptIdMap[d.public_id] = d.id;
        deptIdMap[String(d.id)] = d.id;
        departmentNames.push(d.name);
      });
 
      // Check if all departments were found
      const notFound = deptInput.filter(di => !deptIdMap[String(di)]);
      if (notFound.length > 0) {
        return res.status(400).json({ success: false, message: `Departments not found: ${notFound.join(', ')}` });
      }
    }
 
    const publicId = crypto.randomBytes(8).toString('hex');
    const createdBy = req.user._id;
 
    // Resolve project manager public id -> numeric _id if provided
    let pmId = null;
    let projectManagerInfo = null;
    const pmPublic = projectManagerPublicId || projectManagerId || project_manager_id || null;
    if (pmPublic) {
      const pmRows = await q('SELECT _id, public_id, name, email FROM users WHERE public_id = ? LIMIT 1', [pmPublic]);
      if (!pmRows || pmRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Project manager not found' });
      }
      pmId = pmRows[0]._id;
      projectManagerInfo = pmRows[0]; // Store PM details for email
    }
 
    // Create project
    const projectSql = `
      INSERT INTO projects (public_id, client_id, project_manager_id, name, description, priority, start_date, end_date, budget, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Planning', ?)
    `;
    const projectParams = [publicId, clientId, pmId, projectName, description || null, priority, startDate || start_date || null, endDate || end_date || null, budget || null, createdBy];
 
    const result = await q(projectSql, projectParams);
    const projectId = result.insertId;
 
    // Map departments to project
    if (Array.isArray(deptInput) && deptInput.length > 0) {
      for (const di of deptInput) {
        const deptId = deptIdMap[String(di)];
        if (deptId) {
          await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [projectId, deptId]);
        }
      }
    }
 
    // Fetch created project with departments
    const project = await q('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    const depts = await q('SELECT pd.department_id, d.name, d.public_id FROM project_departments pd JOIN departments d ON pd.department_id = d.id WHERE pd.project_id = ?', [projectId]);
 
    // Enrich client info for response
    const responseClientInfo = clientHasPublic ? await q('SELECT public_id, name FROM clientss WHERE id = ? LIMIT 1', [clientId]) : await q('SELECT id as public_id, name FROM clientss WHERE id = ? LIMIT 1', [clientId]);
 
    const response = {
      id: project[0].public_id,
      public_id: project[0].public_id,
      name: project[0].name,
      description: project[0].description,
      priority: project[0].priority,
      start_date: project[0].start_date,
      end_date: project[0].end_date,
      budget: project[0].budget,
      status: project[0].status,
      created_at: project[0].created_at,
      departments: depts.map(d => ({ public_id: d.public_id, name: d.name })),
      client: responseClientInfo && responseClientInfo.length > 0 ? { public_id: responseClientInfo[0].public_id, name: responseClientInfo[0].name } : null
    };
   
    // Enrich with project manager info if present
    if (project[0].project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [project[0].project_manager_id]);
      if (pmRows && pmRows.length > 0) {
        response.project_manager = { public_id: pmRows[0].public_id, name: pmRows[0].name };
      }
    }
 
    const emailService = require(__root + 'utils/emailService');
   
    const projectLink = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/projects/${publicId}`;
    const creatorName = req.user.name || 'Administrator';
   
    const emailResults = await emailService.sendProjectNotifications({
      projectManagerInfo,
      clientInfo,
      projectName,
      publicId,
      priority,
      startDate: startDate || start_date,
      endDate: endDate || end_date,
      budget,
      departmentNames,
      projectLink,
      creatorName
    });
 
    console.log('Project emails sent:', emailResults);

    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin', 'Manager'], 'Project Created', `New project "${projectName}" has been created`, 'PROJECT_CREATED', 'project', projectId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        console.error('Project creation notification error:', notifErr);
      }
    })();

    res.status(201).json({ success: true, data: response });
  } catch (e) {
    logger.error('Create project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
router.get('/', async (req, res) => {
  try {
    let projects;
 
    if (req.user.role === 'Admin') {
      // Admins see all projects (no soft-delete filtering)
      projects = await q('SELECT * FROM projects ORDER BY created_at DESC');
    } else if (req.user.role === 'Manager') {
      // Managers see projects they manage + projects from their departments
      projects = await q(`
        SELECT DISTINCT p.* FROM projects p
        LEFT JOIN project_departments pd ON p.id = pd.project_id
        LEFT JOIN departments d ON pd.department_id = d.id
        WHERE (
          p.project_manager_id = ? OR
          d.public_id = (SELECT department_public_id FROM users u WHERE u._id = ?)
        )
        ORDER BY p.created_at DESC
      `, [req.user._id, req.user._id]);
    } else if (req.user.role === 'Employee') {
      // Employees see projects from their departments
      projects = await q(`
        SELECT DISTINCT p.* FROM projects p
        JOIN project_departments pd ON p.id = pd.project_id
        JOIN departments d ON pd.department_id = d.id
        WHERE d.public_id = (SELECT department_public_id FROM users u WHERE u._id = ? LIMIT 1)
        ORDER BY p.created_at DESC
      `, [req.user._id]);
    } else {
      projects = [];
    }
 
    // Enrich with department data
    const clientHasPublic = await hasColumn('clientss', 'public_id');
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
      // attach client info
      try {
        const clientInfo = clientHasPublic ? await q('SELECT public_id, name FROM clientss WHERE id = ? LIMIT 1', [p.client_id]) : await q('SELECT id as public_id, name FROM clientss WHERE id = ? LIMIT 1', [p.client_id]);
        if (clientInfo && clientInfo.length > 0) out.client = { public_id: clientInfo[0].public_id, name: clientInfo[0].name };
      } catch (e) {}
      if (p.project_manager_id) {
        const pm = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [p.project_manager_id]);
        if (pm && pm.length > 0) out.project_manager = { public_id: pm[0].public_id, name: pm[0].name };
      }
      return out;
    }));
 
    res.json({ success: true, data: enriched });
  } catch (e) {
    logger.error('Get projects error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET STATS ====================
// GET /api/projects/stats
router.get('/stats', async (req, res) => {
  try {
    let projectIds = [];
    let taskIds = [];
    let subtaskIds = [];

    if (req.user.role === 'Admin') {
      // All projects
      const projects = await q('SELECT id FROM projects');
      projectIds = projects.map(p => p.id);
    } else if (req.user.role === 'Manager') {
      // Projects managed by user or from user's departments
      const projects = await q(`
        SELECT DISTINCT p.id FROM projects p
        LEFT JOIN project_departments pd ON p.id = pd.project_id
        LEFT JOIN departments d ON pd.department_id = d.id
        WHERE p.project_manager_id = ? OR d.public_id = (SELECT department_public_id FROM users WHERE _id = ?)
      `, [req.user._id, req.user._id]);
      projectIds = projects.map(p => p.id);
    } else if (req.user.role === 'Employee') {
      // Projects from user's department
      const projects = await q(`
        SELECT DISTINCT p.id FROM projects p
        JOIN project_departments pd ON p.id = pd.project_id
        JOIN departments d ON pd.department_id = d.id
        WHERE d.public_id = (SELECT department_public_id FROM users WHERE _id = ? LIMIT 1)
      `, [req.user._id]);
      projectIds = projects.map(p => p.id);
    }

    if (projectIds.length === 0) {
      return res.json({
        success: true,
        data: {
          projects: { total: 0, byStatus: {} },
          tasks: { total: 0, byStage: {}, totalHours: 0 },
          subtasks: { total: 0, byStatus: {} }
        }
      });
    }

    // Get task IDs
    if (req.user.role === 'Employee') {
      // Only tasks assigned to employee
      const tasks = projectIds.length > 0 ? await q('SELECT t.id FROM tasks t JOIN taskassignments ta ON t.id = ta.task_id WHERE ta.user_id = ? AND t.project_id IN (?)', [req.user._id, projectIds]) : [];
      taskIds = tasks.map(t => t.id);
    } else {
      // All tasks in projects
      const tasks = projectIds.length > 0 ? await q('SELECT id FROM tasks WHERE project_id IN (?)', [projectIds]) : [];
      taskIds = tasks.map(t => t.id);
    }

    // Get subtask IDs
    const subtasks = taskIds.length > 0 ? await q('SELECT id FROM subtasks WHERE task_id IN (?)', [taskIds]) : [];
    subtaskIds = subtasks.map(s => s.id);

    // Projects stats
    const projectStats = projectIds.length > 0 ? await q('SELECT status, COUNT(*) as count FROM projects WHERE id IN (?) GROUP BY status', [projectIds]) : [];
    const projectsByStatus = {};
    let totalProjects = 0;
    projectStats.forEach(ps => {
      projectsByStatus[ps.status] = ps.count;
      totalProjects += ps.count;
    });

    // Tasks stats
    const taskStats = taskIds.length > 0 ? await q('SELECT stage, COUNT(*) as count FROM tasks WHERE id IN (?) GROUP BY stage', [taskIds]) : [];
    const tasksByStage = {};
    let totalTasks = 0;
    taskStats.forEach(ts => {
      tasksByStage[ts.stage] = ts.count;
      totalTasks += ts.count;
    });

    // Subtasks stats
    const subtaskStats = subtaskIds.length > 0 ? await q('SELECT status, COUNT(*) as count FROM subtasks WHERE id IN (?) GROUP BY status', [subtaskIds]) : [];
    const subtasksByStatus = {};
    let totalSubtasks = 0;
    subtaskStats.forEach(ss => {
      subtasksByStatus[ss.status] = ss.count;
      totalSubtasks += ss.count;
    });

    // Total hours from tasks
    const hoursResult = taskIds.length > 0 ? await q('SELECT SUM(total_duration) as totalHours FROM tasks WHERE id IN (?)', [taskIds]) : [{ totalHours: 0 }];
    const totalHours = hoursResult[0].totalHours || 0;

    res.json({
      success: true,
      data: {
        projects: {
          total: totalProjects,
          byStatus: projectsByStatus
        },
        tasks: {
          total: totalTasks,
          byStage: tasksByStage,
          totalHours: totalHours
        },
        subtasks: {
          total: totalSubtasks,
          byStatus: subtasksByStatus
        }
      }
    });
  } catch (e) {
    logger.error('Get stats error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET PROJECT BY ID ====================
// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
 
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    const p = project[0];
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
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [p.project_manager_id]);
      if (pmRows && pmRows.length > 0) out.project_manager = { public_id: pmRows[0].public_id, name: pmRows[0].name };
    }
    // attach client info for single project view
    try {
      const clientHasPublic_single = await hasColumn('clientss', 'public_id');
      const clientInfo_single = clientHasPublic_single ? await q('SELECT public_id, name FROM clientss WHERE id = ? LIMIT 1', [p.client_id]) : await q('SELECT id as public_id, name FROM clientss WHERE id = ? LIMIT 1', [p.client_id]);
      if (clientInfo_single && clientInfo_single.length > 0) out.client = { public_id: clientInfo_single[0].public_id, name: clientInfo_single[0].name };
    } catch (e) {}
 
    res.json({ success: true, data: out });
  } catch (e) {
    logger.error('Get project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
// ==================== UPDATE PROJECT ====================
// PUT /api/projects/:id
router.put('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    // ✅ FIXED: Added ALL missing fields
    const {
      name,
      description,
      priority,
      startDate,
      endDate,
      start_date,
      end_date,
      budget,
      status,
      department_ids,
      projectManagerId,
      project_manager_id,
      clientPublicId,      
      projectManagerPublicId
    } = req.body;
 
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    const projectId = project[0].id;
    const updateFields = [];
    const params = [];
 
    // ✅ FIXED #1: CLIENT HANDLING (moved BEFORE main update)
    if (clientPublicId !== undefined) {
      const clientHasPublic = await hasColumn('clientss', 'public_id');
      let client;
      if (clientHasPublic) {
        client = await q('SELECT id FROM clientss WHERE public_id = ? LIMIT 1', [clientPublicId]);
      } else {
        if (/^\d+$/.test(String(clientPublicId))) {
          client = await q('SELECT id FROM clientss WHERE id = ? LIMIT 1', [clientPublicId]);
        } else {
          return res.status(400).json({ success: false, message: 'clients table has no public_id column; provide numeric client id instead' });
        }
      }
      if (!client || client.length === 0) {
        return res.status(400).json({ success: false, message: 'Client not found' });
      }
      updateFields.push('client_id = ?');
      params.push(client[0].id);
    }
 
    // ✅ FIXED #2: MANAGER HANDLING (moved BEFORE main update + added projectManagerPublicId)
    if (projectManagerPublicId || projectManagerId || project_manager_id) {
      const pmPublic = projectManagerPublicId || projectManagerId || project_manager_id;
      const pmRows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [pmPublic]);
      if (!pmRows || pmRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Project manager not found' });
      }
      updateFields.push('project_manager_id = ?');
      params.push(pmRows[0]._id);
    }
 
    // ✅ Regular field updates
    if (name) { updateFields.push('name = ?'); params.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); params.push(description); }
    if (priority) { updateFields.push('priority = ?'); params.push(priority); }
    if (startDate || start_date) { updateFields.push('start_date = ?'); params.push(startDate || start_date); }
    if (endDate || end_date) { updateFields.push('end_date = ?'); params.push(endDate || end_date); }
    if (budget !== undefined) { updateFields.push('budget = ?'); params.push(budget); }
    if (status) { updateFields.push('status = ?'); params.push(status); }
 
    // ✅ FIXED #3: Main update (now includes client + manager)
    if (updateFields.length > 0) {
      params.push(projectId);
      const sql = `UPDATE projects SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`;
      await q(sql, params);
    }
 
    // ✅ Departments (already perfect)
    if (Array.isArray(department_ids) && department_ids.length > 0) {
      await q('DELETE FROM project_departments WHERE project_id = ?', [projectId]);
      const placeholders = department_ids.map(() => '?').join(',');
      const deptQuery = `SELECT id, public_id FROM departments WHERE public_id IN (${placeholders})`;
      const deptRecords = await q(deptQuery, department_ids);
      const deptIdMap = {};
      deptRecords.forEach(d => deptIdMap[d.public_id] = d.id);
 
      const notFound = department_ids.filter(deptPublicId => !deptIdMap[deptPublicId]);
      if (notFound.length > 0) {
        return res.status(400).json({ success: false, message: `Departments not found: ${notFound.join(', ')}` });
      }
 
      for (const deptPublicId of department_ids) {
        const deptId = deptIdMap[deptPublicId];
        if (deptId) {
          try {
            await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [projectId, deptId]);
          } catch (e) {
            if (!e.message.includes('Duplicate')) {
              throw e;
            }
          }
        }
      }
    }
 
    // ✅ Response (already perfect)
    const updated = await q('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    const depts = await q(`
      SELECT pd.department_id, d.name, d.public_id
      FROM project_departments pd
      JOIN departments d ON pd.department_id = d.id
      WHERE pd.project_id = ?
    `, [projectId]);
 
    const out = {
      ...updated[0],
      id: updated[0].public_id,
      departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
    };
    if (updated[0].project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [updated[0].project_manager_id]);
      if (pmRows && pmRows.length > 0) out.project_manager = { id: pmRows[0].public_id, name: pmRows[0].name };
    }
    // Send notification
    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin', 'Manager'], 'Project Updated', `Project "${name || updated[0].name}" has been updated`, 'PROJECT_UPDATED', 'project', projectId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        console.error('Project update notification error:', notifErr);
      }
    })();
    res.json({ success: true, data: out });
  } catch (e) {
    logger.error('Update project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
// ==================== ADD DEPARTMENTS TO PROJECT ====================
// POST /api/projects/:id/departments
router.post('/:id/departments', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { department_ids } = req.body;
 
    if (!Array.isArray(department_ids) || department_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'department_ids must be a non-empty array' });
    }
 
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    const projectId = project[0].id;
 
    // Add departments
    // Convert public_ids to numeric ids
    const placeholders = department_ids.map(() => '?').join(',');
    const deptQuery = `SELECT id, public_id FROM departments WHERE public_id IN (${placeholders})`;
    const deptRecords = await q(deptQuery, department_ids);
    const deptIdMap = {};
    deptRecords.forEach(d => deptIdMap[d.public_id] = d.id);
 
    // Check if all departments were found
    const notFound = department_ids.filter(deptPublicId => !deptIdMap[deptPublicId]);
    if (notFound.length > 0) {
      return res.status(400).json({ success: false, message: `Departments not found: ${notFound.join(', ')}` });
    }
 
    for (const deptPublicId of department_ids) {
      const deptId = deptIdMap[deptPublicId];
      if (deptId) {
        try {
          await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [projectId, deptId]);
        } catch (e) {
          if (!e.message.includes('Duplicate')) {
            throw e;
          }
        }
      }
    }
 
    const depts = await q(`
      SELECT pd.department_id, d.name, d.public_id
      FROM project_departments pd
      JOIN departments d ON pd.department_id = d.id
      WHERE pd.project_id = ?
    `, [projectId]);
 
    res.json({
      success: true,
      message: 'Departments added to project',
      data: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
    });
  } catch (e) {
    logger.error('Add departments error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
// ==================== REMOVE DEPARTMENT FROM PROJECT ====================
// DELETE /api/projects/:id/departments/:deptId
router.delete('/:id/departments/:deptId', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id, deptId } = req.params;
 
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    await q('DELETE FROM project_departments WHERE project_id = ? AND department_id = ?', [project[0].id, deptId]);
 
    res.json({ success: true, message: 'Department removed from project' });
  } catch (e) {
    logger.error('Remove department error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
// ==================== DELETE PROJECT ====================
// DELETE /api/projects/:id
router.delete('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;
 
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    const projectId = project[0].id;
 
    // Hard delete project and related rows (rely on FK CASCADE where available)
    try {
      // Remove explicit dependent rows where FK may not cascade
      await q('DELETE FROM subtasks WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)', [projectId]).catch(() => {});
      await q('DELETE FROM tasks WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM project_departments WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM projects WHERE id = ?', [projectId]);
    } catch (e) {
      // Fallback to soft-delete if hard delete fails
      await q('UPDATE projects SET is_active = 0 WHERE id = ?', [projectId]);
    }
 
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (e) {
    logger.error('Delete project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET PROJECT SUMMARY ====================
// GET /api/projects/:id/summary
router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const projectId = project[0].id;

    // Task counts
    const taskStats = await q('SELECT stage, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY stage', [projectId]);
    const tasksByStage = {};
    let totalTasks = 0;
    taskStats.forEach(ts => {
      tasksByStage[ts.stage] = ts.count;
      totalTasks += ts.count;
    });

    // Completed tasks
    const completedTasks = await q('SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status IN (?, ?)', [projectId, 'Completed', 'Review']);
    const completedCount = completedTasks[0].count;

    // In-progress tasks
    const inProgressTasks = await q('SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status IN (?, ?, ?)', [projectId, 'In Progress', 'On Hold', 'Review']);
    const inProgressCount = inProgressTasks[0].count;

    // Total hours
    const hoursResult = await q('SELECT SUM(total_duration) as totalHours FROM tasks WHERE project_id = ?', [projectId]);
    const totalHours = hoursResult[0].totalHours || 0;

    // Progress percentage
    const progressPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    res.json({
      success: true,
      data: {
        project: {
          id: project[0].public_id,
          name: project[0].name,
          status: project[0].status
        },
        tasks: {
          total: totalTasks,
          completed: completedCount,
          inProgress: inProgressCount,
          byStage: tasksByStage
        },
        totalHours: totalHours,
        progressPercentage: progressPercentage
      }
    });
  } catch (e) {
    logger.error('Get project summary error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET PROJECT TASKS (KANBAN) ====================
// GET /api/projects/:id/tasks
// Returns tasks for Kanban board - only assigned tasks for employees, all tasks for managers/admins
router.get('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await q('SELECT id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);

    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const projectId = project[0].id;
    let tasks;

    if (req.user.role === 'Admin' || req.user.role === 'Manager') {
      // Admins and Managers see all tasks in the project
      tasks = await q(`
        SELECT
          t.id,
          t.public_id,
          t.title,
          t.description,
          t.priority,
          t.status,
          t.stage,
          t.taskDate,
          t.time_alloted,
          t.total_duration,
          t.started_at,
          t.completed_at,
          t.createdAt,
          GROUP_CONCAT(DISTINCT u.name) as assigned_users,
          GROUP_CONCAT(DISTINCT u._id) as assigned_user_ids
        FROM tasks t
        LEFT JOIN taskassignments ta ON t.id = ta.task_id
        LEFT JOIN users u ON ta.user_id = u._id
        WHERE t.project_id = ?
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `, [projectId]);
    } else if (req.user.role === 'Employee') {
      // Employees only see tasks assigned to them in this project
      tasks = await q(`
        SELECT
          t.id,
          t.public_id,
          t.title,
          t.description,
          t.priority,
          t.status,
          t.stage,
          t.taskDate,
          t.time_alloted,
          t.total_duration,
          t.started_at,
          t.completed_at,
          t.createdAt,
          GROUP_CONCAT(DISTINCT u.name) as assigned_users,
          GROUP_CONCAT(DISTINCT u._id) as assigned_user_ids
        FROM tasks t
        JOIN taskassignments ta ON t.id = ta.task_id
        LEFT JOIN users u ON ta.user_id = u._id
        WHERE t.project_id = ? AND ta.user_id = ?
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `, [projectId, req.user._id]);
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Format response for Kanban board
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      public_id: task.public_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      stage: task.stage,
      taskDate: task.taskDate,
      time_alloted: task.time_alloted,
      total_duration: task.total_duration || 0,
      started_at: task.started_at,
      completed_at: task.completed_at,
      created_at: task.created_at,
      assigned_users: task.assigned_users ? task.assigned_users.split(',') : [],
      assigned_user_ids: task.assigned_user_ids ? task.assigned_user_ids.split(',').map(id => parseInt(id)) : []
    }));

    res.json({
      success: true,
      data: {
        project_id: projectId,
        tasks: formattedTasks,
        kanban_columns: {
          'To Do': formattedTasks.filter(t => t.status === 'To Do' || t.status === 'Pending' || t.status === 'PENDING'),
          'In Progress': formattedTasks.filter(t => t.status === 'In Progress'),
          'On Hold': formattedTasks.filter(t => t.status === 'On Hold'),
          'Completed': formattedTasks.filter(t => t.status === 'Completed')
        }
      }
    });
  } catch (e) {
    logger.error('Get project tasks error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
 
 
 