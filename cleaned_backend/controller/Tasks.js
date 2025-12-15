// Placeholder Tasks controller - trimmed version for cleaned backend
const db = require(__root + 'db');

module.exports = {
  // lightweight task list for client viewers
  listTasksForClient: (req, res) => {
    const clientId = req.params.clientId;
    db.query('SELECT id, title, status, assigned_to FROM tasks WHERE client_id = ? LIMIT 200', [clientId], (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      return res.json({ success: true, data: rows });
    });
  }
};
