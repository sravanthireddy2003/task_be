const db = require(__root + 'db');

module.exports = {
  getMyTasks: (req, res) => {
    db.query('SELECT id, title, description, status, assigned_to FROM tasks WHERE assigned_to = ?', [req.user.id], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: rows });
    });
  },

  addSubtask: (req, res) => {
    const { taskId, title } = req.body;
    if (!taskId || !title) return res.status(400).json({ success: false, error: 'taskId and title required' });
    const sql = 'INSERT INTO subtasks (task_id, title, status, created_by, created_at) VALUES (?, ?, ?, ?, NOW())';
    db.query(sql, [taskId, title, 'Pending', req.user.id], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: { id: result.insertId, taskId, title, status: 'Pending' } });
    });
  },

  updateSubtask: (req, res) => {
    const { id } = req.params;
    db.query('UPDATE subtasks SET ? WHERE id = ?', [req.body, id], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Subtask updated' });
    });
  }
};
