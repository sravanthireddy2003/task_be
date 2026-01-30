const db = require('./src/db');
let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

const id = process.argv[2];
if (!id) { logger.error('Usage: node check_document.js <documentId>'); process.exit(1); }

db.query('SELECT documentId, filePath, fileName FROM documents WHERE documentId = ? LIMIT 1', [id], (err, rows) => {
  if (err) { logger.error('DB error:', err.message || err); process.exit(1); }
  logger.info('DB rows:', rows);
  process.exit(0);
});
