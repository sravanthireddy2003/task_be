const db = require('../src/db');

(async () => {
  try {
    console.log('Normalizing tasks with status "Request Approved"...');

    const sql = `
      UPDATE tasks t
      JOIN (
        SELECT DISTINCT task_id FROM task_resign_requests WHERE status = 'APPROVE'
      ) r ON r.task_id = t.id
      SET t.status = CASE WHEN (t.started_at IS NOT NULL OR t.live_timer IS NOT NULL) THEN 'In Progress' ELSE 'To Do' END,
          t.is_locked = 0,
          t.pending_assignee = NULL
      WHERE t.status = 'Request Approved'
    `;

    db.query(sql, (err, result) => {
      if (err) {
        console.error('Normalization failed:', err.message || err);
        process.exit(1);
      }
      console.log('Normalization complete. Rows affected:', result && result.affectedRows);
      process.exit(0);
    });
  } catch (e) {
    console.error('Unexpected error:', e.message || e);
    process.exit(1);
  }
})();
