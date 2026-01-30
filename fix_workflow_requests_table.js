const db = require('./src/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function fixWorkflowRequestsTable() {
  logger.info('Running migration to fix workflow_requests table...');

  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

  try {
    const columns = await q(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'workflow_requests'
    `, [db.config.database]);
    
    const columnNames = columns.map(c => c.COLUMN_NAME.toLowerCase());

    if (!columnNames.includes('requested_by_id')) {
        await q("ALTER TABLE workflow_requests ADD COLUMN requested_by_id INT NOT NULL AFTER to_state");
        logger.info("Successfully added 'requested_by_id' column.");
    } else {
        logger.info("'requested_by_id' column already exists.");
    }

    if (!columnNames.includes('approver_role')) {
        await q("ALTER TABLE workflow_requests ADD COLUMN approver_role VARCHAR(50) AFTER requested_by_id");
        logger.info("Successfully added 'approver_role' column.");
    } else {
        logger.info("'approver_role' column already exists.");
    }

      logger.info('Table workflow_requests has been checked and updated.');
    process.exit(0);

  } catch (e) {
    logger.error('Migration failed:', e);
    process.exit(1);
  }
}

fixWorkflowRequestsTable();
