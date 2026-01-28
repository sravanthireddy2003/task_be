// scripts/migrate_workflows.js
const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function run() {
  try {
    console.log('Creating workflow tables...');
    await q(`
      CREATE TABLE IF NOT EXISTS workflow_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        trigger_event VARCHAR(255),
        department_id INT NULL,
        department_name VARCHAR(255) NULL,
        project_id INT NULL,
        project_name VARCHAR(255) NULL,
        active BOOLEAN DEFAULT TRUE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS workflow_steps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_id INT NOT NULL,
        step_order INT NOT NULL,
        role VARCHAR(100),
        action VARCHAR(50),
        rule_id VARCHAR(255),
        FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS workflow_step_meta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        step_id INT NOT NULL,
        sla_hours INT NULL,
        notify_roles JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_step (step_id),
        FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS workflow_instances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        template_id INT NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        current_state VARCHAR(50) NOT NULL,
        sla_deadline DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS workflow_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        instance_id INT NOT NULL,
        from_state VARCHAR(50),
        to_state VARCHAR(50),
        user_id INT,
        comment TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    console.log('Workflow tables created');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed', e);
    process.exit(2);
  }
}

run();
