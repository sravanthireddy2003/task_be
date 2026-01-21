const db = require('./src/db');

db.query('SELECT id, public_id, client_id FROM projects WHERE id=18 OR public_id=?', ['dc8ddd50d72f015e'], (err, rows) => {
  if (err) console.error('Error:', err);
  else console.log('Project:', rows);
  process.exit();
});