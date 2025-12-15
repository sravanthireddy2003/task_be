const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ==================== CREATE TASK ====================
// POST /api/tasks
router.post('/', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId, departmentId, title, description, priority = 'Medium', assignedTo, startDate, endDate, estimatedHours } = req.body;

    if (!projectId || !departmentId || !title) {
      return res.status(400).json({ success: false, message: 'projectId, departmentId, and title are required' });
    }

    // Verify project exists
    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Verify department is linked to project
    const deptMapping = await q('SELECT * FROM project_departments WHERE project_id = ? AND department_id = ? LIMIT 1', [project[0].id, departmentId]);
    if (!deptMapping || deptMapping.length === 0) {
      return res.status(400).json({ success: false, message: 'Department is not linked to this project' });
    }

    const publicId = crypto.randomBytes(8).toString('hex');
    const createdBy = req.user._id;

    const taskSql = `
      INSERT INTO tasks (public_id, project_id, department_id, title, description, priority, assigned_to, start_date, due_date, estimated_hours, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)
    `;
    const taskParams = [publicId, project[0].id, departmentId, title, description || null, priority, assignedTo || null, startDate || null, endDate || null, estimatedHours || null, createdBy];

    const result = await q(taskSql, taskParams);
    const taskId = result.insertId;

    // Log activity
    await q('INSERT INTO task_activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)', [taskId, createdBy, 'created', `Task "${title}" created`]);

    const task = await q('SELECT * FROM tasks WHERE id = ? LIMIT 1', [taskId]);
    res.status(201).json({
      success: true,
      data: {
        ...task[0],
        id: task[0].public_id,
        subtask_count: 0
      }
    });
  } catch (e) {
    logger.error('Create task error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== GET TASKS (Department-Aware) ====================
// GET /api/tasks?projectId=X&departmentId=Y
router.get('/', async (req, res) => {
  try {
    const { projectId, departmentId } = req.query;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const project = await q('SELECT * FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
    if (!project || project.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const projectId_internal = project[0].id;

    let tasks;

    if (departmentId) {
      // Fetch tasks for specific department
      tasks = await q(`
        SELECT t.*, u.name as assigned_user_name, u.public_id as assigned_user_id
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u._id
        WHERE t.project_id = ? AND t.department_id = ?
        ORDER BY t.created_at DESC
      `, [projectId_internal, departmentId]);
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

    // Enrich with subtask count
    const enriched = await Promise.all(tasks.map(async (t) => {
      const subtaskCount = await q('SELECT COUNT(*) as count FROM subtasks WHERE task_id = ?', [t.id]);
      return {
        ...t,
        id: t.public_id,
        subtask_count: subtaskCount[0].count,
        assigned_user: t.assigned_user_name ? { id: t.assigned_user_id, name: t.assigned_user_name } : null
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

    res.json({
      success: true,
      data: {
        ...t,
        id: t.public_id,
        assigned_user: assignedUser.length > 0 ? { id: assignedUser[0].public_id, name: assignedUser[0].name } : null,
        subtasks: subtasks.map(st => ({ ...st, id: st.public_id })),
        subtask_count: subtasks.length
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
    const { title, description, status, priority, assignedTo, startDate, endDate, estimatedHours, actualHours, progressPercentage } = req.body;

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
    if (assignedTo) { updateFields.push('assigned_to = ?'); params.push(assignedTo); }
    if (startDate) { updateFields.push('start_date = ?'); params.push(startDate); }
    if (endDate) { updateFields.push('due_date = ?'); params.push(endDate); }
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
    res.json({
      success: true,
      data: {
        ...updated[0],
        id: updated[0].public_id
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
