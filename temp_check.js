let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/db');

async function check() {
  try {
    // Check tasks
    const tasks = await new Promise((resolve, reject) => {
      db.query('SELECT id, public_id FROM tasks WHERE project_id = 18 OR project_public_id = ?', ['dc8ddd50d72f015e'], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    logger.info('Tasks under project:', tasks);

    // Check client docs
    const clientDocs = await new Promise((resolve, reject) => {
      db.query("SELECT documentId, fileName FROM documents WHERE entityType = 'CLIENT' AND entityId = 62", (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    logger.info('Client docs for client 62:', clientDocs.length, clientDocs);

    if (tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      const taskPublicIds = tasks.map(t => t.public_id).filter(Boolean);
      const allTaskIds = taskIds.concat(taskPublicIds);
      const placeholders = allTaskIds.map(() => '?').join(',');
      const taskDocs = await new Promise((resolve, reject) => {
        db.query(`SELECT documentId, fileName, entityId FROM documents WHERE entityType = 'TASK' AND entityId IN (${placeholders})`, allTaskIds, (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });
      logger.info('Task docs:', taskDocs.length, taskDocs);
    }

    process.exit(0);
  } catch (e) {
    logger.error('Error:', e);
    process.exit(1);
  }
}

check();