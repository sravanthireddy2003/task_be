const db = require('../db');

const TASK_ID = 67;
// payload from user
const payload = {
  projectPublicId: '7f05dc959dc3a283',
  projectId: '7f05dc959dc3a283',
  assignedTo: 'fc68843efb360a12',
  departmentPublicId: 'fdf26d8593119af4',
  description: 'vbnm',
  dueDate: '2025-12-17',
  estimatedHours: 45,
  priority: 'low',
  status: 'pending',
  title: 'gfhj',
};

function toUpperOrNull(v){ return v ? String(v).toUpperCase() : null; }

// helper to run a single query with promise
function queryAsync(sql, params){
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async () => {
  try {
    console.log('Fetching existing task', TASK_ID);
    const rows = await queryAsync('SELECT * FROM tasks WHERE id = ? LIMIT 1', [TASK_ID]);
    if (!rows || rows.length === 0) {
      console.error('Task not found:', TASK_ID);
      process.exit(1);
    }
    const existing = rows[0];

    // resolve client_id: prefer payload projectId/publicId, else keep existing
    let clientId = existing.client_id;
    if (payload.projectId || payload.projectPublicId) {
      const pr = await queryAsync('SELECT client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [payload.projectId || null, payload.projectPublicId || null]);
      if (pr && pr.length > 0) clientId = pr[0].client_id;
      else console.warn('Project not found for provided projectId/projectPublicId; keeping existing client_id');
    }

    const updated = {
      title: payload.title || existing.title,
      description: payload.description || existing.description,
      taskDate: payload.dueDate || existing.taskDate,
      priority: toUpperOrNull(payload.priority) || existing.priority,
      time_alloted: (payload.estimatedHours !== undefined && payload.estimatedHours !== null) ? payload.estimatedHours : existing.time_alloted,
      estimated_hours: (payload.estimatedHours !== undefined && payload.estimatedHours !== null) ? payload.estimatedHours : existing.estimated_hours,
      status: payload.status || existing.status,
      stage: payload.stage || existing.stage || 'TODO',
      client_id: clientId || existing.client_id,
      updatedAt: new Date().toISOString(),
    };

    const sql = `UPDATE tasks SET title = ?, description = ?, taskDate = ?, priority = ?, time_alloted = ?, estimated_hours = ?, status = ?, stage = ?, client_id = ?, updatedAt = ? WHERE id = ?`;
    const params = [updated.title, updated.description, updated.taskDate, updated.priority, updated.time_alloted, updated.estimated_hours, updated.status, updated.stage, updated.client_id, updated.updatedAt, TASK_ID];

    console.log('Running update with params:', params);
    const res = await queryAsync(sql, params);
    console.log('Update result:', res);

    const after = await queryAsync('SELECT * FROM tasks WHERE id = ? LIMIT 1', [TASK_ID]);
    console.log('Row after update:', after[0]);

    process.exit(0);
  } catch (err) {
    console.error('Error updating task:', err);
    process.exit(1);
  }
})();
