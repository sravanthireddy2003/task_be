const db = require('./src/db');
db.query('SELECT name, status FROM projects ORDER BY name', (err, rows) => {
  if (err) { console.error('Error:', err); return; }
  console.log('All project statuses:');
  rows.forEach(row => console.log(`${row.name}: ${row.status}`));
  process.exit(0);
});