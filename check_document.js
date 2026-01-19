const db = require('./src/db');
const id = process.argv[2];
if (!id) { console.error('Usage: node check_document.js <documentId>'); process.exit(1); }

db.query('SELECT documentId, filePath, fileName FROM documents WHERE documentId = ? LIMIT 1', [id], (err, rows) => {
  if (err) { console.error('DB error:', err.message || err); process.exit(1); }
  console.log('DB rows:', rows);
  process.exit(0);
});
