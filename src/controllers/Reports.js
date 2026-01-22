const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const { generateProjectReport, projectLookupDiagnostic } = require(__root + 'services/reportService');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const db = require(__root + 'db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

router.use(requireAuth);

// POST /api/reports/project
router.post('/project', async (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.body || {};
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'projectId, startDate and endDate are required' });
    }

    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime()) || sd > ed) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    const report = await generateProjectReport(req.user, projectId, startDate, endDate);
    return res.json({ success: true, data: report });
  } catch (err) {
    logger.error('Generate project report error:', err && err.stack ? err.stack : err);
    if (err && err.status) {
      const payload = { success: false, message: err.message };
      if (err.diagnostic) payload.diagnostic = err.diagnostic;
      return res.status(err.status).json(payload);
    }
    return res.status(500).json({ success: false, message: err && err.message ? err.message : 'Failed generating project report' });
  }
});

// DEBUG: GET /api/reports/debug-project?projectId=...
// Returns which lookup strategies succeeded/failed. Restricted to Admin/Manager.
router.get('/debug-project', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const projectId = req.query.projectId || req.query.project_id;
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId required' });
    const diag = await projectLookupDiagnostic(projectId, req.user ? req.user.tenant_id : null);
    return res.json({ success: true, data: diag });
  } catch (err) {
    logger.error('Project lookup diagnostic error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Diagnostic failed', error: err && err.message });
  }
});

module.exports = router;

// GET /api/reports/overview
// Returns organization-wide analytics for a date range suitable for dashboard cards and charts
router.get('/overview', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const startDate = req.query.startDate || req.query.start_date;
    const endDate = req.query.endDate || req.query.end_date;

    // Default to current month if not provided
    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

    // Tasks Created
    let tasksCreated = 0;
    const createdVariants = [
      { sql: 'SELECT COUNT(*) as c FROM tasks WHERE DATE(taskDate) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] },
      { sql: 'SELECT COUNT(*) as c FROM tasks WHERE DATE(createdAt) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] }
    ];
    for (const v of createdVariants) {
      try { const r = await q(v.sql, v.params); tasksCreated = Number(r[0].c) || 0; break; } catch (e) { continue; }
    }

    // Tasks Completed
    let tasksCompleted = 0;
    const completedVariants = [
      { sql: "SELECT COUNT(*) as c FROM tasks WHERE LOWER(status) = 'completed' AND (DATE(taskDate) BETWEEN DATE(?) AND DATE(?))", params: [startStr, endStr] },
      { sql: "SELECT COUNT(*) as c FROM tasks WHERE LOWER(status) = 'completed' AND (DATE(createdAt) BETWEEN DATE(?) AND DATE(?))", params: [startStr, endStr] }
    ];
    for (const v of completedVariants) {
      try { const r = await q(v.sql, v.params); tasksCompleted = Number(r[0].c) || 0; break; } catch (e) { continue; }
    }

    // Hours Logged (timelogs -> fallback tasks.total_duration)
    let hoursLogged = 0;
    const hoursVariants = [
      { sql: 'SELECT COALESCE(SUM(hours), 0) as h FROM timelogs WHERE DATE(log_date) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] },
      { sql: 'SELECT COALESCE(SUM(total_duration), 0) as h FROM tasks WHERE DATE(taskDate) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] },
      { sql: 'SELECT COALESCE(SUM(total_duration), 0) as h FROM tasks WHERE DATE(createdAt) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] }
    ];
    for (const v of hoursVariants) {
      try { const r = await q(v.sql, v.params); hoursLogged = Number(r[0].h) || 0; break; } catch (e) { continue; }
    }

    // Active Projects (projects with tasks in date range)
    let activeProjects = 0;
    const projectsVariants = [
      { sql: 'SELECT COUNT(DISTINCT project_id) as c FROM tasks WHERE DATE(taskDate) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] },
      { sql: 'SELECT COUNT(DISTINCT project_id) as c FROM tasks WHERE DATE(createdAt) BETWEEN DATE(?) AND DATE(?)', params: [startStr, endStr] }
    ];
    for (const v of projectsVariants) {
      try { const r = await q(v.sql, v.params); activeProjects = Number(r[0].c) || 0; break; } catch (e) { continue; }
    }

    // Task Status Distribution
    let statusRows = [];
    const statusVariants = [
      { sql: 'SELECT LOWER(status) as s, COUNT(*) as c FROM tasks WHERE DATE(taskDate) BETWEEN DATE(?) AND DATE(?) GROUP BY status', params: [startStr, endStr] },
      { sql: 'SELECT LOWER(status) as s, COUNT(*) as c FROM tasks WHERE DATE(createdAt) BETWEEN DATE(?) AND DATE(?) GROUP BY status', params: [startStr, endStr] }
    ];
    for (const v of statusVariants) {
      try { statusRows = await q(v.sql, v.params); break; } catch (e) { continue; }
    }
    const taskStatus = { completed: 0, inProgress: 0, notStarted: 0, overdue: 0 };
    for (const r of statusRows) {
      const s = (r.s || '').trim();
      if (s === 'completed' || s === 'done') taskStatus.completed += Number(r.c) || 0;
      else if (s === 'in progress' || s === 'doing' || s === 'inprogress') taskStatus.inProgress += Number(r.c) || 0;
      else taskStatus.notStarted += Number(r.c) || 0;
    }
    // Overdue: tasks with past taskDate (used as due date) not completed
    try {
      const odRows = await q("SELECT COUNT(*) as c FROM tasks WHERE taskDate < ? AND LOWER(status) <> 'completed'", [endStr]);
      taskStatus.overdue = Number(odRows[0].c) || 0;
    } catch (_) { /* ignore if taskDate missing */ }

    // User Productivity: aggregate by user across assignments
    let userRows = [];
    const userVariants = [
      { sql: `SELECT u._id as userId, u.name as userName, LOWER(u.role) as role,
               COUNT(t.id) as totalTasks,
               SUM(CASE WHEN LOWER(t.status) = 'completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN LOWER(t.status) IN ('in progress','doing','inprogress') THEN 1 ELSE 0 END) as inProgress,
               COALESCE(SUM(tl.hours), SUM(t.total_duration), 0) as hoursLogged
             FROM taskassignments ta
             JOIN users u ON ta.user_id = u._id
             JOIN tasks t ON ta.task_id = t.id
             LEFT JOIN timelogs tl ON tl.task_id = t.id
             WHERE (DATE(t.taskDate) BETWEEN DATE(?) AND DATE(?)) OR (DATE(t.createdAt) BETWEEN DATE(?) AND DATE(?))
             GROUP BY u._id, u.name, u.role
             ORDER BY u.name ASC`, params: [startStr, endStr, startStr, endStr] },
      { sql: `SELECT u._id as userId, u.name as userName, LOWER(u.role) as role,
               COUNT(t.id) as totalTasks,
               SUM(CASE WHEN LOWER(t.status) = 'completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN LOWER(t.status) IN ('in progress','doing','inprogress') THEN 1 ELSE 0 END) as inProgress,
               COALESCE(SUM(t.total_duration), 0) as hoursLogged
             FROM taskassignments ta
             JOIN users u ON ta.user_id = u._id
             JOIN tasks t ON ta.task_id = t.id
             WHERE (DATE(t.taskDate) BETWEEN DATE(?) AND DATE(?)) OR (DATE(t.createdAt) BETWEEN DATE(?) AND DATE(?))
             GROUP BY u._id, u.name, u.role
             ORDER BY u.name ASC`, params: [startStr, endStr, startStr, endStr] }
    ];
    for (const v of userVariants) {
      try { userRows = await q(v.sql, v.params); break; } catch (e) { continue; }
    }
    const userProductivity = (userRows || []).map(u => {
      const total = Number(u.totalTasks) || 0;
      const completed = Number(u.completed) || 0;
      const inProgress = Number(u.inProgress) || 0;
      const hours = Number(u.hoursLogged) || 0;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { userId: u.userId, userName: u.userName, role: u.role, totalTasks: total, completed, inProgress, hoursLogged: hours, completionRate };
    });

    // Client Summary: aggregate tasks by client via projects
    let clientRows = [];
    const clientVariants = [
      { sql: `SELECT c.id as clientId, c.name as clientName,
               COUNT(DISTINCT p.id) as projects,
               COUNT(t.id) as totalTasks,
               SUM(CASE WHEN LOWER(t.status) = 'completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN LOWER(t.status) IN ('in progress','doing','inprogress') THEN 1 ELSE 0 END) as inProgress,
               SUM(CASE WHEN LOWER(t.status) <> 'completed' AND DATE(t.due_date) < DATE(?) THEN 1 ELSE 0 END) as overdue
             FROM clients c
             LEFT JOIN projects p ON p.client_id = c.id
             LEFT JOIN tasks t ON t.project_id = p.id
             WHERE c.isDeleted IS NULL OR c.isDeleted != 1
             GROUP BY c.id, c.name
             ORDER BY clientName ASC`, params: [endStr] },
      { sql: `SELECT c.id as clientId, c.name as clientName,
               COUNT(DISTINCT p.id) as projectss,
               COUNT(t.id) as totalTasks,
               SUM(CASE WHEN LOWER(t.status) = 'completed' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN LOWER(t.status) IN ('in progress','doing','inprogress') THEN 1 ELSE 0 END) as inProgress,
               SUM(CASE WHEN LOWER(t.status) <> 'completed' AND DATE(t.due_date) < DATE(?) THEN 1 ELSE 0 END) as overdue
             FROM clientss c
             LEFT JOIN projects p ON p.client_id = c.id
             LEFT JOIN tasks t ON t.project_id = p.id
             WHERE c.isDeleted IS NULL OR c.isDeleted != 1
             GROUP BY c.id, c.name
             ORDER BY clientName ASC`, params: [endStr] }
    ];
    for (const v of clientVariants) {
      try { clientRows = await q(v.sql, v.params); break; } catch (e) { continue; }
    }

    // Fetch all tasks for the date range to include in clientSummary
    let allTasks = [];
    try {
      allTasks = await q(`SELECT t.id, t.name, t.status, t.taskDate as due_date, p.client_id as clientId, p.id as projectId, p.name as projectName FROM tasks t JOIN projects p ON t.project_id = p.id WHERE (DATE(t.taskDate) BETWEEN DATE(?) AND DATE(?)) OR (DATE(t.createdAt) BETWEEN DATE(?) AND DATE(?))`, [startStr, endStr, startStr, endStr]);
    } catch (e) { /* ignore if fails */ }

    const clientSummary = (clientRows || []).map(c => {
      const clientTasks = allTasks.filter(t => String(t.clientId) === String(c.clientId)).map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        dueDate: t.due_date,
        projectId: t.projectId,
        projectName: t.projectName
      }));
      return {
        clientId: c.clientId != null ? String(c.clientId) : '',
        clientName: c.clientName || 'Unknown',
        projects: Number(c.projects) || 0,
        totalTasks: Number(c.totalTasks) || 0,
        completed: Number(c.completed) || 0,
        inProgress: Number(c.inProgress) || 0,
        overdue: Number(c.overdue) || 0,
        tasks: clientTasks
      };
    });

    return res.json({ success: true, data: {
      summary: { tasksCreated, tasksCompleted, hoursLogged, activeProjects },
      taskStatus,
      userProductivity,
      clientSummary,
      dateRange: { startDate: startStr, endDate: endStr }
    }});
  } catch (err) {
    logger.error('Reports overview error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Failed to generate overview', error: err && err.message });
  }
});
