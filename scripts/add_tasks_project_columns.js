const db = require('../db');

function q(sql, params = []){
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    console.log('Adding project reference columns to tasks table if missing...');

    const col1 = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_id'");
    if (!Array.isArray(col1) || col1.length === 0) {
      console.log('Adding column tasks.project_id (INT NULL)');
      await q('ALTER TABLE tasks ADD COLUMN project_id INT NULL');
    } else {
      console.log('Column tasks.project_id already exists');
    }

    const col2 = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_public_id'");
    if (!Array.isArray(col2) || col2.length === 0) {
      console.log('Adding column tasks.project_public_id (VARCHAR(255) NULL)');
      await q("ALTER TABLE tasks ADD COLUMN project_public_id VARCHAR(255) NULL");
    } else {
      console.log('Column tasks.project_public_id already exists');
    }

    console.log('Done. You may want to run any backfill script to populate these columns for existing tasks.');
    process.exit(0);
  } catch (e) {
    console.error('Failed to add columns:', e && e.message);
    process.exit(1);
  }
})();
