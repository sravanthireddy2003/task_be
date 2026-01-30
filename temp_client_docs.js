let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/db');

db.query("SELECT documentId, fileName, entityType, entityId FROM documents WHERE entityType = 'CLIENT' AND entityId = 62", (err, rows) => {
  if (err) logger.error('Error:', err);
  else logger.info('Client docs:', rows);
  process.exit();
});