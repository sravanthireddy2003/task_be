const db = require('./src/db');

async function runWorkflowMigrations() {
  console.log('Running workflow migrations...');

  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) {
        // If the error is that the table already exists, we can ignore it.
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(err.message);
          return resolve(results);
        }
        return reject(err);
      }
      resolve(results);
    });
  });

  try {
    // 1. Create workflow_definitions table
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        entity_type VARCHAR(50) NOT NULL COMMENT 'TASK | PROJECT',
        from_state VARCHAR(50) NOT NULL,
        to_state VARCHAR(50) NOT NULL,
        allowed_role VARCHAR(50) NOT NULL COMMENT 'Role that can initiate the transition',
        approval_required BOOLEAN NOT NULL DEFAULT FALSE,
        approver_role VARCHAR(50) COMMENT 'MANAGER | ADMIN',
        INDEX idx_workflow_def_tenant_entity (tenant_id, entity_type)
      )
    `);
    console.log('Table workflow_definitions created or already exists.');

    // 2. Create workflow_requests table
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        project_id VARCHAR(255),
        from_state VARCHAR(50) NOT NULL,
        to_state VARCHAR(50) NOT NULL,
        requested_by INT NOT NULL,
        approver_role VARCHAR(50),
        status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requested_by) REFERENCES users(_id) ON DELETE CASCADE,
        INDEX idx_workflow_req_tenant_entity (tenant_id, entity_type, entity_id),
        INDEX idx_workflow_req_status_role (status, approver_role)
      )
    `);
    console.log('Table workflow_requests created or already exists.');

    // 3. Create workflow_logs table
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        action VARCHAR(100) NOT NULL COMMENT 'e.g., REQUEST_APPROVAL, APPROVE, REJECT',
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        performed_by INT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (performed_by) REFERENCES users(_id) ON DELETE CASCADE,
        INDEX idx_workflow_log_tenant_entity (tenant_id, entity_type, entity_id)
      )
    `);
    console.log('Table workflow_logs created or already exists.');
    
    // 4. Add new statuses to the tasks table
    try {
        await q("ALTER TABLE tasks MODIFY COLUMN status ENUM('Pending', 'In Progress', 'On Hold', 'Completed', 'REVIEW', 'CLOSED') DEFAULT 'Pending'");
        console.log("Updated 'tasks.status' with 'REVIEW' and 'CLOSED' states.");
    } catch(e) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message.includes("Duplicate column name")) {
            console.log("'tasks.status' column already updated.");
        } else {
            throw e;
        }
    }

    // 5. Add status to projects table if it doesn't exist
    try {
        await q("ALTER TABLE projects ADD COLUMN status ENUM('ACTIVE', 'PENDING_FINAL_APPROVAL', 'CLOSED') NOT NULL DEFAULT 'ACTIVE'");
        console.log("Added 'status' column to 'projects' table.");
    } catch(e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("'projects.status' column already exists.");
        } else {
            throw e;
        }
    }


    console.log('Workflow migrations completed successfully.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

runWorkflowMigrations();
