const db = require(__root + 'db');

module.exports = {
  getManagerDashboard: async (req, res) => {
    try {
      const q = (sql, params=[]) => new Promise((r, rej) => db.query(sql, params, (e, rows) => e ? rej(e) : r(rows)));
      const cols = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'manager_id'");
      let projectCountRow;
      if (Array.isArray(cols) && cols.length > 0) {
        projectCountRow = (await q('SELECT COUNT(*) as c FROM projects WHERE manager_id = ?', [req.user.id]))[0] || { c: 0 };
      } else {
        projectCountRow = { c: 0 };
      }
      const projectCount = projectCountRow.c;
      const taskCountRow = (await q('SELECT COUNT(*) as c FROM tasks'))[0] || { c: 0 };
      const taskCount = taskCountRow.c;
      return res.json({ success: true, data: { projectCount, taskCount } });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  },

  createProject: (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Project name required' });
    const sql = 'INSERT INTO projects (name, description, manager_id, tenant_id, created_at) VALUES (?, ?, ?, ?, NOW())';
    const tenant = req.user.tenant_id || null;
    db.query(sql, [name, description || '', req.user.id, tenant], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: { id: result.insertId, name, description } });
    });
  },

  updateProject: (req, res) => {
    const { id } = req.params;
    db.query('UPDATE projects SET ? WHERE id = ?', [req.body, id], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Project updated' });
    });
  },

  reassignTask: (req, res) => {
    const { taskId, newUserId } = req.body;
    if (!taskId || !newUserId) return res.status(400).json({ success: false, error: 'taskId and newUserId required' });
    db.query('UPDATE tasks SET assigned_to = ? WHERE id = ?', [newUserId, taskId], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Task reassigned' });
    });
  }
};
