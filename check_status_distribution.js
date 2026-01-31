const db = require('./src/db');
db.query('SELECT status, COUNT(*) as count FROM projects GROUP BY status', (err, rows) => {
  if (err) { console.error('Error:', err); return; }
  console.log('Project status distribution:');
  rows.forEach(row => console.log(`${row.status}: ${row.count}`));
  process.exit(0);
});