const db = require('./src/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function addApproverRoleColumn() {
  logger.info('Running migration to add approver_role column...');

  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

  try {
    await q("ALTER TABLE workflow_requests ADD COLUMN approver_role VARCHAR(50) AFTER requested_by_id");
    logger.info("Successfully added 'approver_role' column to 'workflow_requests' table.");
    process.exit(0);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      logger.info("'approver_role' column already exists.");
      process.exit(0);
    } else {
      logger.error('Migration failed:', e);
      process.exit(1);
    }
  }
}

addApproverRoleColumn();
