// scripts/alter_workflow_history.js
// Ensure workflow_history table has the expected instance_id column.

const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

async function run() {
  try {
    console.log('Altering workflow_history table to ensure instance_id column exists...');

    // Fetch existing columns
    const cols = await q('SHOW COLUMNS FROM workflow_history');
    const names = new Set((cols || []).map(c => c.Field));

    // If legacy task_id column exists, relax NOT NULL so inserts without task_id won't violate FKs
    if (names.has('task_id')) {
      await q('ALTER TABLE workflow_history MODIFY COLUMN task_id INT NULL');
      console.log('Updated task_id column on workflow_history to be nullable');
    }

    // Ensure instance_id column
    if (!names.has('instance_id')) {
      await q('ALTER TABLE workflow_history ADD COLUMN instance_id INT NOT NULL AFTER id');
      console.log('Added instance_id column to workflow_history');
    } else {
      console.log('instance_id column already exists on workflow_history');
    }

    // Ensure from_state column
    if (!names.has('from_state')) {
      await q("ALTER TABLE workflow_history ADD COLUMN from_state VARCHAR(50) NULL AFTER instance_id");
      console.log('Added from_state column to workflow_history');
    }

    // Ensure to_state column
    if (!names.has('to_state')) {
      await q("ALTER TABLE workflow_history ADD COLUMN to_state VARCHAR(50) NULL AFTER from_state");
      console.log('Added to_state column to workflow_history');
    }

    // Ensure user_id column
    if (!names.has('user_id')) {
      await q("ALTER TABLE workflow_history ADD COLUMN user_id INT NULL AFTER to_state");
      console.log('Added user_id column to workflow_history');
    }

    // Ensure comment column
    if (!names.has('comment')) {
      await q("ALTER TABLE workflow_history ADD COLUMN comment TEXT NULL AFTER user_id");
      console.log('Added comment column to workflow_history');
    }

    // Ensure timestamp column
    if (!names.has('timestamp')) {
      await q("ALTER TABLE workflow_history ADD COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER comment");
      console.log('Added timestamp column to workflow_history');
    }

    console.log('alter_workflow_history completed.');
    process.exit(0);
  } catch (e) {
    console.error('alter_workflow_history failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

run();
