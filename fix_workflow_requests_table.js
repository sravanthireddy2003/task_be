const db = require('./src/db');

async function fixWorkflowRequestsTable() {
  console.log('Running migration to fix workflow_requests table...');

  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

  try {
    // Using a more robust way to check for columns before adding them
    const columns = await q(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'workflow_requests'
    `, [db.config.database]);
    
    const columnNames = columns.map(c => c.COLUMN_NAME.toLowerCase());

    if (!columnNames.includes('requested_by_id')) {
        await q("ALTER TABLE workflow_requests ADD COLUMN requested_by_id INT NOT NULL AFTER to_state");
        console.log("Successfully added 'requested_by_id' column.");
    } else {
        console.log("'requested_by_id' column already exists.");
    }

    if (!columnNames.includes('approver_role')) {
        await q("ALTER TABLE workflow_requests ADD COLUMN approver_role VARCHAR(50) AFTER requested_by_id");
        console.log("Successfully added 'approver_role' column.");
    } else {
        console.log("'approver_role' column already exists.");
    }

    console.log('Table workflow_requests has been checked and updated.');
    process.exit(0);

  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

fixWorkflowRequestsTable();
