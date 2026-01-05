const db = require('./src/db');

async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Helper function for promisified queries
    const q = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // Add status column
    try {
      await q("ALTER TABLE tasks ADD COLUMN status ENUM('Pending', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Pending'");
      console.log('Added status column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('Status column already exists');
      } else {
        throw e;
      }
    }

    // Add started_at
    try {
      await q("ALTER TABLE tasks ADD COLUMN started_at DATETIME NULL");
      console.log('Added started_at column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('started_at column already exists');
      } else {
        throw e;
      }
    }

    // Add completed_at
    try {
      await q("ALTER TABLE tasks ADD COLUMN completed_at DATETIME NULL");
      console.log('Added completed_at column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('completed_at column already exists');
      } else {
        throw e;
      }
    }

    // Add total_duration
    try {
      await q("ALTER TABLE tasks ADD COLUMN total_duration INT DEFAULT 0");
      console.log('Added total_duration column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('total_duration column already exists');
      } else {
        throw e;
      }
    }

    // Create task_time_logs table
    await q(`
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

    // Create notifications table
    await q(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE
      )
    `);
    console.log('Created notifications table');

    // Indexes
    await q("CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_task_time_logs_timestamp ON task_time_logs(timestamp)");
    await q("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)");
    await q("CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)");

    // Seed some test notifications
    console.log('Seeding test notifications...');
    await q(`
      INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, is_read, created_at) VALUES
      (51, 'Task Assigned', 'You have been assigned a new task: Task1', 'TASK_ASSIGNED', 'task', '539695824deb13c7', FALSE, NOW()),
      (45, 'Task Assigned', 'You have been assigned a new task: Task1', 'TASK_ASSIGNED', 'task', '539695824deb13c7', FALSE, NOW()),
      (51, 'Task Started', 'Task started: Task1', 'TASK_STARTED', 'task', '539695824deb13c7', FALSE, NOW() - INTERVAL 1 HOUR),
      (51, 'Task Completed', 'Task completed: Task1', 'TASK_COMPLETED', 'task', '539695824deb13c7', TRUE, NOW() - INTERVAL 30 MINUTE),
      (23, 'System Announcement', 'Welcome Admin to the Task Management System', 'SYSTEM', NULL, NULL, FALSE, NOW() - INTERVAL 2 DAY),
      (56, 'Project Update', 'Project P-1 has been updated', 'PROJECT_UPDATED', 'project', 'dc8ddd50d72f015e', FALSE, NOW() - INTERVAL 1 DAY),
      (23, 'Client Added', 'New client "Akash Aash" has been added', 'CLIENT_ADDED', 'client', '62', FALSE, NOW() - INTERVAL 3 HOUR),
      (51, 'Welcome', 'Welcome to the Task Management System', 'SYSTEM', NULL, NULL, FALSE, NOW() - INTERVAL 2 DAY),
      (23, 'Department Created', 'New department "Engineering" has been created', 'DEPARTMENT_CREATED', 'department', '1', FALSE, NOW() - INTERVAL 4 HOUR),
      (23, 'Module Created', 'New module "Dashboard" has been created', 'MODULE_CREATED', 'module', 'abc123', FALSE, NOW() - INTERVAL 5 HOUR),
      (23, 'User Created', 'New user "John Doe" has been created', 'USER_CREATED', 'user', '24', FALSE, NOW() - INTERVAL 6 HOUR),
      (56, 'Project Created', 'New project "Website Redesign" has been created', 'PROJECT_CREATED', 'project', 'newproj123', FALSE, NOW() - INTERVAL 7 HOUR)
    `);
    console.log('Test notifications seeded');

    console.log('Migrations completed successfully');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
}

runMigrations();