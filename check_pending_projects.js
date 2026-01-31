const db = require('./src/db');

db.query(`
  SELECT p.id, p.public_id, p.name, p.status, wr.id as request_id, wr.status as request_status
  FROM projects p
  LEFT JOIN workflow_requests wr ON wr.entity_id = p.id AND wr.entity_type = 'PROJECT' AND wr.to_state = 'CLOSED'
  WHERE p.status = 'PENDING_FINAL_APPROVAL'
  ORDER BY p.name
`, (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('Projects with PENDING_FINAL_APPROVAL status:');
  rows.forEach(row => {
    console.log(`${row.name}: status=${row.status}, has_request=${!!row.request_id}, request_status=${row.request_status}`);
  });
  process.exit(0);
});