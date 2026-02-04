const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mime = require('mime-types');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');
const { normalizeProjectStatus } = require(__root + 'utils/projectStatus');

function createProjectStatusInfo(projectStatus, isLocked) {
  const raw = projectStatus == null ? null : String(projectStatus);
  const upper = raw ? raw.toUpperCase() : '';
  const locked = isLocked === 1 || isLocked === true;

  const isPendingClosure = upper === 'PENDING_FINAL_APPROVAL';
  const isProjectClosed = upper === 'CLOSED' || (locked && !isPendingClosure);
  
  return {

    raw: raw,

    display: isPendingClosure ? 'PENDING_CLOSURE' : (isProjectClosed ? 'CLOSED' : raw || 'ACTIVE'),

    is_closed: isProjectClosed,
    is_pending_closure: isPendingClosure,
    is_locked: locked,
    can_create_tasks: !locked && !isPendingClosure,
    can_edit_project: !locked && !isPendingClosure,
    can_request_closure: !locked && !isPendingClosure && upper === 'ACTIVE'
  };
}

const NotificationService = require('../services/notificationService');
require('dotenv').config();
let env;
try { env = require(__root + 'config/env'); } catch (e) { env = require('../config/env'); }
router.use(requireAuth);

const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsRoot);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const name = `${base}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });
 
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
 
router.post('/', upload.array('documents', 10), ruleEngine(RULES.PROJECT_CREATE), requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { projectName, description, clientPublicId, projectManagerId, projectManagerPublicId, project_manager_id, department_ids = [], departmentIds = [], departmentPublicIds = [], priority = 'Medium', startDate, endDate, start_date, end_date, budget } = req.body;
 
    if (!projectName || !clientPublicId) {
      return res.status(400).json({ success: false, message: 'projectName and clientPublicId are required' });
    }
 
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
 
    const deptInput = Array.isArray(departmentPublicIds) && departmentPublicIds.length > 0 ? departmentPublicIds : (department_ids.length > 0 ? department_ids : departmentIds);
    let deptIdMap = {};
    let departmentNames = [];
    if (Array.isArray(deptInput) && deptInput.length > 0) {

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
 
      const notFound = deptInput.filter(di => !deptIdMap[String(di)]);
      if (notFound.length > 0) {
        return res.status(400).json({ success: false, message: `Departments not found: ${notFound.join(', ')}` });
      }
    }
 
    const publicId = crypto.randomBytes(8).toString('hex');
    const createdBy = req.user._id;
 
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

    const projectSql = `
      INSERT INTO projects (public_id, client_id, project_manager_id, name, description, priority, start_date, end_date, budget, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Planning', ?)
    `;
    const projectParams = [publicId, clientId, pmId, projectName, description || null, priority, startDate || start_date || null, endDate || end_date || null, budget || null, createdBy];
 
    const result = await q(projectSql, projectParams);
    const projectId = result.insertId;

    if (Array.isArray(deptInput) && deptInput.length > 0) {
      for (const di of deptInput) {
        const deptId = deptIdMap[String(di)];
        if (deptId) {
          await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [projectId, deptId]);
        }
      }
    }

    const project = await q('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    const depts = await q('SELECT pd.department_id, d.name, d.public_id FROM project_departments pd JOIN departments d ON pd.department_id = d.id WHERE pd.project_id = ?', [projectId]);
 
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
   
    if (project[0].project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [project[0].project_manager_id]);
      if (pmRows && pmRows.length > 0) {
        response.project_manager = { public_id: pmRows[0].public_id, name: pmRows[0].name };
      }
    }
 
    const emailService = require(__root + 'utils/emailService');
   
    const projectLink = `${env.FRONTEND_URL || env.BASE_URL}/projects/${publicId}`;
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
 
    logger.info('Project emails sent:', emailResults);

    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin', 'Manager'], 'Project Created', `New project "${projectName}" has been created`, 'PROJECT_CREATED', 'project', projectId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Project creation notification error:', notifErr);
      }
    })();

    const attachedDocuments = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;
          const fileType = mime.lookup(file.originalname) || file.mimetype || null;
          const documentId = crypto.randomBytes(8).toString('hex');
          await q(
            'INSERT INTO documents (documentId, entityType, entityId, uploadedBy, storageProvider, filePath, encrypted, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [documentId, 'PROJECT', projectId, req.user._id, 'local', fileUrl, false]
          );
          attachedDocuments.push({ documentId, fileName: file.originalname, fileType, fileUrl });
        } catch (e) {
          logger.debug('Failed to attach document for project ' + projectId + ': ' + (e && e.message));
        }
      }
    }

    response.documents = attachedDocuments;

    res.status(201).json({ success: true, data: response });
  } catch (e) {
    logger.error('Create project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
router.get('/', async (req, res) => {
  try {
    if (req.query.dropdown === '1' || req.query.dropdown === 'true') {
      let rows;
      if (req.user.role === 'Admin' || req.user.role === 'Manager') {
        rows = await q('SELECT public_id as projectId, name as projectName FROM projects WHERE is_active = 1 ORDER BY name');
      } else if (req.user.role === 'Employee') {
        rows = await q(`
          SELECT DISTINCT p.public_id as projectId, p.name as projectName FROM projects p
          JOIN tasks t ON p.id = t.project_id
          JOIN taskassignments ta ON t.id = ta.task_Id
          WHERE ta.user_Id = ? AND p.is_active = 1
          ORDER BY p.name
        `, [req.user._id]);
      } else {
        rows = [];
      }

      const out = (rows || []).map(r => ({ projectId: r.projectId, projectName: r.projectName }));
      return res.json(out);
    }

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
          d.public_id = (SELECT department_public_id FROM users u WHERE u._id = ?)
        )
        ORDER BY p.created_at DESC
      `, [req.user._id, req.user._id]);
    } else if (req.user.role === 'Employee') {

      projects = await q(`
        SELECT DISTINCT p.* FROM projects p
        JOIN tasks t ON p.id = t.project_id
        JOIN taskassignments ta ON t.id = ta.task_id
        WHERE ta.user_id = ?
        ORDER BY p.created_at DESC
      `, [req.user._id]);
    } else {
      projects = [];
    }

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
        status: createProjectStatusInfo(p.status, p.is_locked).display,
        created_at: p.created_at,
        departments: depts.map(d => ({ public_id: d.public_id, name: d.name }))
      };

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


router.get('/stats', async (req, res) => {
  try {
    let projectIds = [];
    let taskIds = [];
    let subtaskIds = [];

    if (req.user.role === 'Admin') {

      const projects = await q('SELECT id FROM projects');
      projectIds = projects.map(p => p.id);
    } else if (req.user.role === 'Manager') {

      const projects = await q(`
        SELECT DISTINCT p.id FROM projects p
        LEFT JOIN project_departments pd ON p.id = pd.project_id
        LEFT JOIN departments d ON pd.department_id = d.id
        WHERE p.project_manager_id = ? OR d.public_id = (SELECT department_public_id FROM users WHERE _id = ?)
      `, [req.user._id, req.user._id]);
      projectIds = projects.map(p => p.id);
    } else if (req.user.role === 'Employee') {

      const projects = await q(`
        SELECT DISTINCT p.id FROM projects p
        JOIN tasks t ON p.id = t.project_id
        JOIN taskassignments ta ON t.id = ta.task_id
        WHERE ta.user_id = ?
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

    if (req.user.role === 'Employee') {

      const tasks = projectIds.length > 0 ? await q('SELECT t.id FROM tasks t JOIN taskassignments ta ON t.id = ta.task_id WHERE ta.user_id = ? AND t.project_id IN (?)', [req.user._id, projectIds]) : [];
      taskIds = tasks.map(t => t.id);
    } else {

      const tasks = projectIds.length > 0 ? await q('SELECT id FROM tasks WHERE project_id IN (?)', [projectIds]) : [];
      taskIds = tasks.map(t => t.id);
    }

    const subtasks = taskIds.length > 0 ? await q('SELECT id FROM subtasks WHERE task_id IN (?)', [taskIds]) : [];
    subtaskIds = subtasks.map(s => s.id);

    const projectStats = projectIds.length > 0 ? await q('SELECT status, COUNT(*) as count FROM projects WHERE id IN (?) GROUP BY status', [projectIds]) : [];
    const projectsByStatus = {};
    let totalProjects = 0;
    projectStats.forEach(ps => {
      const key = normalizeProjectStatus(ps.status, false).status || ps.status;
      projectsByStatus[key] = (projectsByStatus[key] || 0) + ps.count;
      totalProjects += ps.count;
    });

    const taskStats = taskIds.length > 0 ? await q('SELECT stage, COUNT(*) as count FROM tasks WHERE id IN (?) GROUP BY stage', [taskIds]) : [];
    const tasksByStage = {};
    let totalTasks = 0;
    taskStats.forEach(ts => {
      tasksByStage[ts.stage] = ts.count;
      totalTasks += ts.count;
    });

    const subtaskStats = subtaskIds.length > 0 ? await q('SELECT status, COUNT(*) as count FROM subtasks WHERE id IN (?) GROUP BY status', [subtaskIds]) : [];
    const subtasksByStatus = {};
    let totalSubtasks = 0;
    subtaskStats.forEach(ss => {
      subtasksByStatus[ss.status] = ss.count;
      totalSubtasks += ss.count;
    });

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
      status: normalizeProjectStatus(p.status, p.is_locked).status,
      created_at: p.created_at,
      departments: depts.map(d => ({ public_id: d.public_id, name: d.name }))
    };
    if (p.project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [p.project_manager_id]);
      if (pmRows && pmRows.length > 0) out.project_manager = { public_id: pmRows[0].public_id, name: pmRows[0].name };
    }
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


router.put('/:id', ruleEngine(RULES.PROJECT_UPDATE), requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;

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

    if (projectManagerPublicId || projectManagerId || project_manager_id) {
      const pmPublic = projectManagerPublicId || projectManagerId || project_manager_id;
      const pmRows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [pmPublic]);
      if (!pmRows || pmRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Project manager not found' });
      }
      updateFields.push('project_manager_id = ?');
      params.push(pmRows[0]._id);
    }

    if (name) { updateFields.push('name = ?'); params.push(name); }
    if (description !== undefined) { updateFields.push('description = ?'); params.push(description); }
    if (priority) { updateFields.push('priority = ?'); params.push(priority); }
    if (startDate || start_date) { updateFields.push('start_date = ?'); params.push(startDate || start_date); }
    if (endDate || end_date) { updateFields.push('end_date = ?'); params.push(endDate || end_date); }
    if (budget !== undefined) { updateFields.push('budget = ?'); params.push(budget); }
    if (status) { updateFields.push('status = ?'); params.push(status); }

    if (updateFields.length > 0) {
      params.push(projectId);
      const sql = `UPDATE projects SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`;
      await q(sql, params);
    }

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
      status: createProjectStatusInfo(updated[0].status, updated[0].is_locked).display,
      departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
    };
    if (updated[0].project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [updated[0].project_manager_id]);
      if (pmRows && pmRows.length > 0) out.project_manager = { id: pmRows[0].public_id, name: pmRows[0].name };
    }

    (async () => {
      try {
        await NotificationService.createAndSendToRoles(['Admin', 'Manager'], 'Project Updated', `Project "${name || updated[0].name}" has been updated`, 'PROJECT_UPDATED', 'project', projectId, req.user ? req.user.tenant_id : null);
      } catch (notifErr) {
        logger.error('Project update notification error:', notifErr);
      }
    })();
    res.json({ success: true, data: out });
  } catch (e) {
    logger.error('Update project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});


router.post('/:id/departments', ruleEngine(RULES.PROJECT_UPDATE), requireRole(['Admin', 'Manager']), async (req, res) => {
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


router.delete('/:id/departments/:deptId', ruleEngine(RULES.PROJECT_UPDATE), requireRole(['Admin', 'Manager']), async (req, res) => {
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


router.delete('/:id', ruleEngine(RULES.PROJECT_DELETE), requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { id } = req.params;
 
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
 
    const projectId = project[0].id;

    try {

      await q('DELETE FROM subtasks WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)', [projectId]).catch(() => {});
      await q('DELETE FROM tasks WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM project_departments WHERE project_id = ?', [projectId]).catch(() => {});
      await q('DELETE FROM projects WHERE id = ?', [projectId]);
    } catch (e) {
      await q('UPDATE projects SET is_active = 0 WHERE id = ?', [projectId]);
    }
 
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (e) {
    logger.error('Delete project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});


router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const projectId = project[0].id;

    const taskStats = await q('SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status', [projectId]);
    const tasksByStatus = {};
    let totalTasks = 0;
    taskStats.forEach(ts => {
      tasksByStatus[ts.status] = ts.count;
      totalTasks += ts.count;
    });

    const completedTasks = await q('SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status IN (?, ?)', [projectId, 'Completed', 'Review']);
    const completedCount = completedTasks[0].count;

    const inProgressTasks = await q('SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status IN (?, ?, ?)', [projectId, 'In Progress', 'On Hold', 'Review']);
    const inProgressCount = inProgressTasks[0].count;

    const hoursResult = await q('SELECT SUM(total_duration) as totalHours FROM tasks WHERE project_id = ?', [projectId]);
    const totalHours = hoursResult[0].totalHours || 0;

    const progressPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

    res.json({
      success: true,
      data: {
        project: {
          id: project[0].public_id,
          name: project[0].name,
          status: createProjectStatusInfo(project[0].status, project[0].is_locked).display
        },
        tasks: {
          total: totalTasks,
          completed: completedCount,
          inProgress: inProgressCount,
          byStatus: tasksByStatus
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
    ,
      subtasks: []
    }));

    // Fetch subtasks for the tasks and attach only those that belong to this project
    try {
      const taskIds = formattedTasks.map(t => t.id).filter(Boolean);
      if (taskIds.length) {
        const subs = await q(`SELECT id, COALESCE(task_id, task_Id) AS task_id, COALESCE(project_id, project_Id) AS project_id, title, description, due_date, tag, status, estimated_hours, completed_at, created_at, updated_at, created_by FROM subtasks WHERE COALESCE(task_id, task_Id) IN (?) AND COALESCE(project_id, project_Id) = ?`, [taskIds, projectId]);
        const subMap = {};
        (subs || []).forEach(s => {
          if (!s || s.task_id === undefined || s.task_id === null) return;
          if (String(s.project_id) !== String(projectId)) return;
          const key = String(s.task_id);
          subMap[key] = subMap[key] || [];
          subMap[key].push({
            id: s.id,
            title: s.title || null,
            description: s.description || null,
            due_date: s.due_date || null,
            tag: s.tag || null,
            status: s.status || null,
            estimated_hours: s.estimated_hours != null ? Number(s.estimated_hours) : null,
            completed_at: s.completed_at || null,
            created_at: s.created_at || null,
            updated_at: s.updated_at || null,
            created_by: s.created_by || null
          });
        });
        formattedTasks.forEach(t => { const key = String(t.id); if (subMap[key]) t.subtasks = subMap[key]; });
      }
    } catch (e) {
      logger.debug('Failed to fetch subtasks for project tasks: ' + (e && e.message));
    }

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

router.get('/projectdropdown', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const query = "SELECT public_id as id, name FROM projects WHERE is_active = 1 ORDER BY name";
    const results = await q(query);
    res.status(200).json(results);
  } catch (error) {
    logger.error('Project dropdown error:', error.message);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

module.exports = router;
 
 
 