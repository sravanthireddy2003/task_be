const db = require('./db');

async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Add status column
    await db.query("ALTER TABLE tasks ADD COLUMN status ENUM('Pending', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Pending'");
    console.log('Added status column to tasks');

    // Add started_at
    await db.query("ALTER TABLE tasks ADD COLUMN started_at DATETIME NULL");
    console.log('Added started_at column to tasks');

    // Add completed_at
    await db.query("ALTER TABLE tasks ADD COLUMN completed_at DATETIME NULL");
    console.log('Added completed_at column to tasks');

    // Add total_duration
    await db.query("ALTER TABLE tasks ADD COLUMN total_duration INT DEFAULT 0");
    console.log('Added total_duration column to tasks');

    // Create task_time_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS task_time_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        user_id INT NOT NULL,
        action ENUM('start', 'pause', 'resume', 'complete', 'reassign') NOT NULL,
        timestamp DATETIME NOT NULL,
        duration INT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE
      )
    `);
    console.log('Created task_time_logs table');

    // Indexes
    await db.query("CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_task_time_logs_timestamp ON task_time_logs(timestamp)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)");

    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
}

runMigrations();