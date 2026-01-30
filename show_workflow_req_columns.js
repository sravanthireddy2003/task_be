let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, results) => {
    if (err) return reject(err);
    resolve(results);
  });
});

(async () => {
  try {
    logger.info('DB schema:', db.config && db.config.database);
    const rows = await q(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workflow_requests'
      ORDER BY ORDINAL_POSITION
    `);
    logger.info(rows.map(r => r.COLUMN_NAME).join(', '));
    process.exit(0);
  } catch (e) {
    logger.error('ERROR', e);
    process.exit(1);
  }
})();
