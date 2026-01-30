let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
// scripts/migrate_project_closure.js
// Run: node scripts/migrate_project_closure.js
const db = require('../src/db');

const q = (sql, params=[]) => new Promise((resolve, reject) => db.query(sql, params, (err, res) => err ? reject(err) : resolve(res)));

(async () => {
  try {
    logger.info('Starting migration: project closure support');

    // Ensure workflow_requests has project_id, approver_role, reason
    const ensureColumn = async (table, column, definition) => {
      const rows = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column]);
      if (Array.isArray(rows) && rows.length > 0) {
        logger.info(`Column ${table}.${column} already exists`);
        return;
      }
      logger.info(`Adding column ${table}.${column}`);
      await q(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };

    await ensureColumn('workflow_requests', 'project_id', 'INT NULL');
    await ensureColumn('workflow_requests', 'approver_role', "VARCHAR(50) NULL");
    await ensureColumn('workflow_requests', 'reason', 'TEXT NULL');

    // Make projects.status flexible and ensure is_locked/closed_at exist
    try {
      const col = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'status'`);
      if (Array.isArray(col) && col.length > 0) {
        logger.info('Ensuring projects.status is VARCHAR(50)');
        await q(`ALTER TABLE projects MODIFY COLUMN status VARCHAR(50) NULL`);
      } else {
        logger.info('Adding projects.status column');
        await q(`ALTER TABLE projects ADD COLUMN status VARCHAR(50) NULL`);
      }
    } catch (e) { logger.warn('Failed adjusting projects.status:', e.message); }

    await ensureColumn('projects', 'is_locked', 'TINYINT(1) DEFAULT 0');
    await ensureColumn('projects', 'closed_at', 'DATETIME NULL');

    logger.info('Migration complete');
    process.exit(0);
  } catch (e) {
    logger.error('Migration failed:', e);
    process.exit(1);
  }
})();
