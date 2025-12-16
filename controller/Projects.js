const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
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
 
// ==================== CREATE PROJECT ====================
// POST /api/projects
// Admin / Project Manager creates a project with client and departments
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
      client = await q('SELECT id FROM clientss WHERE public_id = ? LIMIT 1', [clientPublicId]);
    } else {
      if (/^\d+$/.test(String(clientPublicId))) {
        client = await q('SELECT id FROM clientss WHERE id = ? LIMIT 1', [clientPublicId]);
      } else {
        return res.status(400).json({ success: false, message: 'clients table has no public_id column; provide numeric client id instead' });
      }
    }
    if (!client || client.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    const clientId = client[0].id;
 
    // Validate departments if provided. Accept departmentPublicIds, department_ids, or departmentIds (mixed numeric or public_id)
    const deptInput = Array.isArray(departmentPublicIds) && departmentPublicIds.length > 0 ? departmentPublicIds : (department_ids.length > 0 ? department_ids : departmentIds);
    let deptIdMap = {};
    if (Array.isArray(deptInput) && deptInput.length > 0) {
      // split numeric ids and public_ids
      const numeric = deptInput.filter(d => /^\d+$/.test(String(d))).map(Number);
      const publicIds = deptInput.filter(d => !/^\d+$/.test(String(d)));
 
      let deptRecords = [];
      if (numeric.length > 0 && publicIds.length > 0) {
        const placeholdersNum = numeric.map(() => '?').join(',');
        const placeholdersPub = publicIds.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id FROM departments WHERE id IN (${placeholdersNum}) OR public_id IN (${placeholdersPub})`, [...numeric, ...publicIds]);
      } else if (numeric.length > 0) {
        const placeholdersNum = numeric.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id FROM departments WHERE id IN (${placeholdersNum})`, numeric);
      } else if (publicIds.length > 0) {
        const placeholdersPub = publicIds.map(() => '?').join(',');
        deptRecords = await q(`SELECT id, public_id FROM departments WHERE public_id IN (${placeholdersPub})`, publicIds);
      }
 
      deptRecords.forEach(d => { if (d.public_id) deptIdMap[d.public_id] = d.id; deptIdMap[String(d.id)] = d.id; });
 
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
    const pmPublic = projectManagerPublicId || projectManagerId || project_manager_id || null;
    if (pmPublic) {
      const pmRows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [pmPublic]);
      if (!pmRows || pmRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Project manager not found' });
      }
      pmId = pmRows[0]._id;
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
 
    // Enrich client info for response (reuse earlier clientHasPublic)
    const clientInfo = clientHasPublic ? await q('SELECT public_id, name FROM clientss WHERE id = ? LIMIT 1', [clientId]) : await q('SELECT id as public_id, name FROM clientss WHERE id = ? LIMIT 1', [clientId]);
 
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
      client: clientInfo && clientInfo.length > 0 ? { public_id: clientInfo[0].public_id, name: clientInfo[0].name } : null
    };
    // Enrich with project manager info if present
    if (project[0].project_manager_id) {
      const pmRows = await q('SELECT public_id, name FROM users WHERE _id = ? LIMIT 1', [project[0].project_manager_id]);
      if (pmRows && pmRows.length > 0) {
        response.project_manager = { public_id: pmRows[0].public_id, name: pmRows[0].name };
      }
    }
 
    res.status(201).json({ success: true, data: response });
  } catch (e) {
    logger.error('Create project error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});
 
// ==================== GET ALL PROJECTS ====================
// GET /api/projects
// Return projects visible to the user (based on role and department)
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
          d.id IN (SELECT department_id FROM users u WHERE u._id = ?)
        )
        ORDER BY p.created_at DESC
      `, [req.user._id, req.user._id]);
    } else if (req.user.role === 'Employee') {
      // Employees see projects from their departments
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
 
module.exports = router;
 
 