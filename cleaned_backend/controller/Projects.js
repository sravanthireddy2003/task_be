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

// ==================== CREATE PROJECT ====================
// POST /api/projects
// Admin / Project Manager creates a project with client and departments
router.post('/', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { name, description, clientId, projectManagerId, departmentIds = [], priority = 'Medium', startDate, endDate, budget } = req.body;

    if (!name || !clientId) {
      return res.status(400).json({ success: false, message: 'name and clientId are required' });
    }

    // Validate client exists
    const client = await q('SELECT id FROM clientss WHERE id = ? LIMIT 1', [clientId]);
    if (!client || client.length === 0) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    const publicId = crypto.randomBytes(8).toString('hex');
    const createdBy = req.user._id;

    // Create project
    const projectSql = `
      INSERT INTO projects (public_id, client_id, project_manager_id, name, description, priority, start_date, end_date, budget, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Planning', ?)
    `;
    const projectParams = [publicId, clientId, projectManagerId || null, name, description || null, priority, startDate || null, endDate || null, budget || null, createdBy];
    
    const result = await q(projectSql, projectParams);
    const projectId = result.insertId;

    // Map departments to project
    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      const deptMappings = departmentIds.map(deptId => [projectId, deptId]);
      for (const mapping of deptMappings) {
        await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', mapping);
      }
    }

    // Fetch created project with departments
    const project = await q('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    const depts = await q('SELECT pd.department_id, d.name, d.public_id FROM project_departments pd JOIN departments d ON pd.department_id = d.id WHERE pd.project_id = ?', [projectId]);

    const response = {
      ...project[0],
      id: project[0].public_id,
      departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
    };
    delete response.public_id;

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
      // Admins see all projects
      projects = await q('SELECT * FROM projects WHERE is_active = 1 ORDER BY created_at DESC');
    } else if (req.user.role === 'Manager') {
      // Managers see projects they manage + projects from their departments
      projects = await q(`
        SELECT DISTINCT p.* FROM projects p
        LEFT JOIN project_departments pd ON p.id = pd.project_id
        LEFT JOIN departments d ON pd.department_id = d.id
        WHERE p.is_active = 1 AND (
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
        WHERE p.is_active = 1 AND d.id = (SELECT department_id FROM users u WHERE u._id = ? LIMIT 1)
        ORDER BY p.created_at DESC
      `, [req.user._id]);
    } else {
      projects = [];
    }

    // Enrich with department data
    const enriched = await Promise.all(projects.map(async (p) => {
      const depts = await q(`
        SELECT pd.department_id, d.name, d.public_id
        FROM project_departments pd
        JOIN departments d ON pd.department_id = d.id
        WHERE pd.project_id = ?
      `, [p.id]);
      return {
        ...p,
        id: p.public_id,
        departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
      };
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

    res.json({
      success: true,
      data: {
        ...p,
        id: p.public_id,
        departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
      }
    });
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
    const { name, description, priority, startDate, endDate, budget, status } = req.body;

    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const projectId = project[0].id;
    const updateFields = [];
    const params = [];

    if (name) { updateFields.push('name = ?'); params.push(name); }
    if (description) { updateFields.push('description = ?'); params.push(description); }
    if (priority) { updateFields.push('priority = ?'); params.push(priority); }
    if (startDate) { updateFields.push('start_date = ?'); params.push(startDate); }
    if (endDate) { updateFields.push('end_date = ?'); params.push(endDate); }
    if (budget) { updateFields.push('budget = ?'); params.push(budget); }
    if (status) { updateFields.push('status = ?'); params.push(status); }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(projectId);
    const sql = `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`;
    await q(sql, params);

    const updated = await q('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
    const depts = await q(`
      SELECT pd.department_id, d.name, d.public_id
      FROM project_departments pd
      JOIN departments d ON pd.department_id = d.id
      WHERE pd.project_id = ?
    `, [projectId]);

    res.json({
      success: true,
      data: {
        ...updated[0],
        id: updated[0].public_id,
        departments: depts.map(d => ({ id: d.department_id, name: d.name, public_id: d.public_id }))
      }
    });
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
    const { departmentIds } = req.body;

    if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'departmentIds must be a non-empty array' });
    }

    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [id, id]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const projectId = project[0].id;

    // Add departments
    for (const deptId of departmentIds) {
      try {
        await q('INSERT INTO project_departments (project_id, department_id) VALUES (?, ?)', [projectId, deptId]);
      } catch (e) {
        if (!e.message.includes('Duplicate')) {
          throw e;
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

module.exports = router;
