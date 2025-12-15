const db = require('./db');

db.query('SELECT _id, public_id, email, password, role FROM users WHERE role = "Admin" LIMIT 3', (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
  console.log('Admin users (limited columns):');
  rows.forEach(row => {
    console.log(`
ID: ${row._id}
Public ID: ${row.public_id}
Email: ${row.email}
Role: ${row.role}
---`);
  });
  process.exit(0);
});
