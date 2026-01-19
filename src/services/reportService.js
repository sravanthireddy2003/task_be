const db = require(__root + 'db');
const logger = require(__root + 'logger');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

async function projectExistsAndBelongs(projectIdentifier) {
  if (!projectIdentifier && projectIdentifier !== 0) return null;
  const idRaw = String(projectIdentifier).trim();
  const attempts = [];

  if (/^\d+$/.test(idRaw)) attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE id = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE public_id = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE LOWER(public_id) = LOWER(?) LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE public_id LIKE ? LIMIT 1', params: ['%' + idRaw + '%'] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE name = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE name LIKE ? LIMIT 1', params: ['%' + idRaw + '%'] });

  for (const a of attempts) {
    try {
      logger.debug('Project lookup attempt', { sql: a.sql, params: a.params });
      const rows = await q(a.sql, a.params);
      if (rows && rows.length > 0) return rows[0];
    } catch (e) {
      logger.warn('Project lookup attempt failed', { sql: a.sql, err: e && e.message });
    }
  }

  return null;
}

async function projectLookupDiagnostic(projectIdentifier) {
  const idRaw = projectIdentifier == null ? '' : String(projectIdentifier).trim();
  const attempts = [];
  if (!idRaw) return { matched: null, attempts: [] };

  if (/^\d+$/.test(idRaw)) attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE id = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE public_id = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE LOWER(public_id) = LOWER(?) LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE public_id LIKE ? LIMIT 1', params: ['%' + idRaw + '%'] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE name = ? LIMIT 1', params: [idRaw] });
  attempts.push({ sql: 'SELECT id, public_id, name FROM projects WHERE name LIKE ? LIMIT 1', params: ['%' + idRaw + '%'] });

  const results = [];
  for (const a of attempts) {
    try {
      const rows = await q(a.sql, a.params);
      results.push({ sql: a.sql, params: a.params, found: Array.isArray(rows) && rows.length > 0, rows: (rows || []).map(r => ({ id: r.id, public_id: r.public_id, name: r.name })) });
      if (rows && rows.length > 0) return { matched: { id: rows[0].id, public_id: rows[0].public_id, name: rows[0].name }, attempts: results };
    } catch (e) {
      results.push({ sql: a.sql, params: a.params, error: e && e.message });
    }
  }

  return { matched: null, attempts: results };
}

async function userHasAccessToProject(user, projectId) {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Manager') return true;
  const rows = await q('SELECT COUNT(*) as c FROM taskassignments ta JOIN tasks t ON ta.task_id = t.id WHERE ta.user_id = ? AND t.project_id = ?', [user._id, projectId]);
  return rows && rows[0] && rows[0].c > 0;
}

async function generateProjectReport(user, projectIdentifier, startDate, endDate) {
  const project = await projectExistsAndBelongs(projectIdentifier);
  if (!project) {
    const diag = await projectLookupDiagnostic(projectIdentifier);
    throw { status: 404, message: 'Project not found or not accessible', diagnostic: diag };
  }

  const access = await userHasAccessToProject(user, project.id);
  if (!access) throw { status: 403, message: 'Access denied to project' };

  const start = startDate + ' 00:00:00';
  const end = endDate + ' 23:59:59';

  let tasks = [];
  // Try several query variants to tolerate missing columns (due_date, timelogs)
  const taskQueryVariants = [
    {
      sql: `SELECT t.public_id as taskId, t.title as taskName, t.status, DATE_FORMAT(t.due_date, '%Y-%m-%d') as dueDate, DATE_FORMAT(t.createdAt, '%Y-%m-%d') as createdDate,
            GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as assignedTo,
            COALESCE((SELECT SUM(hours) FROM timelogs tl WHERE tl.task_id = t.id), t.total_duration, 0) as hoursLogged
          FROM tasks t
          LEFT JOIN taskassignments ta ON t.id = ta.task_id
          LEFT JOIN users u ON ta.user_id = u._id
          WHERE t.project_id = ? AND ((t.taskDate BETWEEN ? AND ?) OR (t.createdAt BETWEEN ? AND ?))
          GROUP BY t.id
          ORDER BY t.createdAt DESC`,
      params: [project.id, start, end, start, end]
    },
    {
      // Without timelogs subquery
      sql: `SELECT t.public_id as taskId, t.title as taskName, t.status, DATE_FORMAT(t.due_date, '%Y-%m-%d') as dueDate, DATE_FORMAT(t.createdAt, '%Y-%m-%d') as createdDate,
            GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as assignedTo,
            COALESCE(t.total_duration, 0) as hoursLogged
          FROM tasks t
          LEFT JOIN taskassignments ta ON t.id = ta.task_id
          LEFT JOIN users u ON ta.user_id = u._id
          WHERE t.project_id = ? AND ((t.taskDate BETWEEN ? AND ?) OR (t.createdAt BETWEEN ? AND ?))
          GROUP BY t.id
          ORDER BY t.createdAt DESC`,
      params: [project.id, start, end, start, end]
    },
    {
      // Without due_date but with timelogs
      sql: `SELECT t.public_id as taskId, t.title as taskName, t.status, DATE_FORMAT(t.createdAt, '%Y-%m-%d') as createdDate,
        GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as assignedTo,
        COALESCE((SELECT SUM(hours) FROM timelogs tl WHERE tl.task_id = t.id), t.total_duration, 0) as hoursLogged
          FROM tasks t
          LEFT JOIN taskassignments ta ON t.id = ta.task_id
          LEFT JOIN users u ON ta.user_id = u._id
          WHERE t.project_id = ? AND ((t.taskDate BETWEEN ? AND ?) OR (t.createdAt BETWEEN ? AND ?))
          GROUP BY t.id
          ORDER BY t.createdAt DESC`,
      params: [project.id, start, end, start, end]
    },
    {
      // Minimal: no due_date, no timelogs
      sql: `SELECT t.public_id as taskId, t.title as taskName, t.status, DATE_FORMAT(t.createdAt, '%Y-%m-%d') as createdDate,
        GROUP_CONCAT(DISTINCT u.name SEPARATOR ', ') as assignedTo,
        COALESCE(t.total_duration, 0) as hoursLogged
          FROM tasks t
          LEFT JOIN taskassignments ta ON t.id = ta.task_id
          LEFT JOIN users u ON ta.user_id = u._id
          WHERE t.project_id = ? AND ((t.taskDate BETWEEN ? AND ?) OR (t.createdAt BETWEEN ? AND ?))
          GROUP BY t.id
          ORDER BY t.createdAt DESC`,
      params: [project.id, start, end, start, end]
    }
  ];

  let lastErr = null;
  for (const v of taskQueryVariants) {
    try {
      tasks = await q(v.sql, v.params);
      break;
    } catch (e) {
      // If DB reports missing field(s) or missing table, try next variant; otherwise surface the error
      if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE')) {
        lastErr = e;
        logger.warn('Task query variant failed (schema issue), trying next', { sql: v.sql, err: e && e.message, code: e && e.code });
        continue;
      }
      throw e;
    }
  }

  if ((!tasks || tasks.length === 0) && lastErr) {
    // No variant succeeded and we saw schema errors — throw the last schema error
    throw lastErr;
  }

  const nowIso = new Date().toISOString().slice(0, 10);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
  const pendingTasks = tasks.filter(t => (t.status || '').toLowerCase() !== 'completed' && t.status).length;
  const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < nowIso && ((t.status || '').toLowerCase() !== 'completed')).length;

  const tasksOut = (tasks || []).map(t => ({
    taskId: t.taskId,
    taskName: t.taskName,
    assignedTo: t.assignedTo || '',
    status: t.status || null,
    hoursLogged: Number(t.hoursLogged) || 0,
    dueDate: (t.dueDate && String(t.dueDate).trim()) || (t.createdDate && String(t.createdDate).trim()) || endDate || ''
  }));

  // Compute total hours
  const totalHoursLogged = tasksOut.reduce((s, t) => s + (Number(t.hoursLogged) || 0), 0);

  // Productivity score: simple metric = completed / total * 100
  const productivityScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Status distribution
  const statusDistribution = { notStarted: 0, inProgress: 0, completed: 0 };
  for (const t of tasksOut) {
    const s = (t.status || '').toLowerCase();
    if (s === 'completed' || s === 'done') statusDistribution.completed += 1;
    else if (s === 'in progress' || s === 'inprogress' || s === 'doing') statusDistribution.inProgress += 1;
    else statusDistribution.notStarted += 1;
  }

  // Try aggregating user productivity from taskassignments + timelogs when possible
  let userProductivity = [];
  try {
    const userAggSql = `SELECT u._id as userId, u.name as userName,
        SUM(CASE WHEN LOWER(t.status) = 'completed' THEN 1 ELSE 0 END) as tasksCompleted,
        COALESCE(SUM(tl.hours), SUM(t.total_duration), 0) as hoursLogged
      FROM taskassignments ta
      JOIN users u ON ta.user_id = u._id
      JOIN tasks t ON ta.task_id = t.id
      LEFT JOIN timelogs tl ON tl.task_id = t.id
      WHERE t.project_id = ? AND ((t.taskDate BETWEEN ? AND ?) OR (t.createdAt BETWEEN ? AND ?))
      GROUP BY u._id, u.name`;
    const rows = await q(userAggSql, [project.id, start, end, start, end]);
    if (rows && rows.length > 0) {
      userProductivity = rows.map(r => ({ userId: r.userId || null, userName: r.userName || null, tasksCompleted: Number(r.tasksCompleted) || 0, hoursLogged: Number(r.hoursLogged) || 0 }));
    }
  } catch (e) {
    // If user aggregation fails (missing tables/columns), fallback to deriving from tasksOut by name
    logger.warn('User productivity aggregation failed, falling back to names', { err: e && e.message });
    const map = Object.create(null);
    for (const t of tasksOut) {
      const names = t.assignedTo ? String(t.assignedTo).split(',').map(s => s.trim()).filter(Boolean) : [];
      for (const n of names) {
        if (!map[n]) map[n] = { userId: '', userName: n, tasksCompleted: 0, hoursLogged: 0 };
        map[n].hoursLogged += Number(t.hoursLogged) || 0;
        if ((t.status || '').toLowerCase() === 'completed') map[n].tasksCompleted += 1;
      }
    }
    // Try to map names to real user IDs when possible
    const entries = Object.keys(map).map(k => map[k]);
    for (const ent of entries) {
      try {
        const urows = await q('SELECT _id FROM users WHERE name = ? LIMIT 1', [ent.userName]);
        if (urows && urows.length > 0) ent.userId = urows[0]._id || '';
      } catch (ux) {
        ent.userId = ent.userId || '';
      }
    }
    userProductivity = entries;
  }

  // Attempt to include clientName if present on project row; try to enrich if missing
  let clientName = project.client_name || project.clientName || project.client || '';
  if (!clientName) {
    try {
      const pr = await q('SELECT client_name, client_id FROM projects WHERE id = ? LIMIT 1', [project.id]);
      if (pr && pr.length > 0) {
        clientName = pr[0].client_name || pr[0].clientName || '';
      }
    } catch (e) {
      logger.debug('Could not enrich project clientName', { err: e && e.message });
      clientName = clientName || '';
    }
  }

  return {
    project: { projectId: project.public_id || String(project.id), projectName: project.name, clientName },
    dateRange: { startDate, endDate },
    summary: { totalTasks, completedTasks, pendingTasks, overdueTasks, totalHoursLogged, productivityScore },
    statusDistribution,
    userProductivity,
    tasks: tasksOut
  };
}

module.exports = { generateProjectReport, projectLookupDiagnostic };
