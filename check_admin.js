const db = require('./db');

db.query('SELECT public_id, email, role FROM users WHERE role = "Admin" LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  console.log('Admin users:');
  console.table(rows);
  process.exit(0);
});
