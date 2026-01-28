// scripts/migrate_workflow.js
// Migration script for workflow tables

const db = require('../src/db');

const q = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (e, r) => e ? reject(e) : resolve(r));
  });
};

async function migrateWorkflow() {
  try {
    console.log('Migrating workflow tables...');

    // workflow_definitions
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        entity_type ENUM('TASK', 'PROJECT') NOT NULL,
        name VARCHAR(255) NOT NULL,
        states JSON NOT NULL,
        rules JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_entity (tenant_id, entity_type)
      )
    `);
    console.log('Created workflow_definitions table');

    // workflow_requests
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        entity_type ENUM('TASK', 'PROJECT') NOT NULL,
        entity_id INT NOT NULL,
        from_state VARCHAR(50) NOT NULL,
        to_state VARCHAR(50) NOT NULL,
        requested_by INT NOT NULL,
        approved_by INT NULL,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_status (tenant_id, status),
        INDEX idx_entity (entity_type, entity_id)
      )
    `);
    console.log('Created workflow_requests table');

    // workflow_logs
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NULL,
        tenant_id INT NOT NULL,
        entity_type ENUM('TASK', 'PROJECT') NOT NULL,
        entity_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        user_id INT NOT NULL,
        details JSON,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant_entity (tenant_id, entity_type, entity_id),
        INDEX idx_request (request_id)
      )
    `);
    console.log('Created workflow_logs table');

    console.log('Workflow migration completed');
  } catch (e) {
    console.error('Migration error:', e);
  }
}

if (require.main === module) migrateWorkflow();

module.exports = { migrateWorkflow };