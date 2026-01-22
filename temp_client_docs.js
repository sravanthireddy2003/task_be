const db = require('./src/db');

db.query("SELECT documentId, fileName, entityType, entityId FROM documents WHERE entityType = 'CLIENT' AND entityId = 62", (err, rows) => {
  if (err) console.error('Error:', err);
  else console.log('Client docs:', rows);
  process.exit();
});