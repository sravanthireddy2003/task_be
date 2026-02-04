const db = require('./src/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function runMigrations() {
  try {
    logger.info('Running migrations...');

    const q = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    try {
      await q("ALTER TABLE tasks ADD COLUMN status ENUM('Pending', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Pending'");
      logger.info('Added status column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        logger.info('Status column already exists');
      } else {
        throw e;
      }
    }

    try {
      await q("ALTER TABLE tasks ADD COLUMN started_at DATETIME NULL");
      logger.info('Added started_at column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        logger.info('started_at column already exists');
      } else {
        throw e;
      }
    }

    try {
      await q("ALTER TABLE tasks ADD COLUMN completed_at DATETIME NULL");
      logger.info('Added completed_at column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        logger.info('completed_at column already exists');
      } else {
        throw e;
      }
    }

    try {
      await q("ALTER TABLE tasks ADD COLUMN total_duration INT DEFAULT 0");
      logger.info('Added total_duration column to tasks');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        logger.info('total_duration column already exists');
      } else {
        throw e;
      }
    }

    try {
      await q("ALTER TABLE tasks ADD COLUMN task_day DATE NULL");
      logger.info('Added task_day column to tasks');

      try {
        await q("UPDATE tasks SET task_day = DATE(taskDate) WHERE taskDate IS NOT NULL");
        logger.info('Backfilled task_day from taskDate');
      } catch (be) {
        logger.warn('Note: task_day backfill skipped or failed:', be.message);
      }

      try {
        await q("CREATE INDEX idx_tasks_task_day ON tasks(task_day)");
        logger.info('Created index idx_tasks_task_day');
      } catch (ie) {
        logger.warn('Note: creating idx_tasks_task_day skipped or failed:', ie.message);
      }
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_COLUMN_EXISTS_ERROR') {
        logger.info('task_day column already exists');
      } else {
        throw e;
      }
    }

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
    logger.info('Created task_time_logs table');

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
    logger.info('Created notifications table');

    await q("CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON task_time_logs(task_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_task_time_logs_timestamp ON task_time_logs(timestamp)");
    await q("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)");
    await q("CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)");
    await q("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)");

    await q(`
      CREATE TABLE IF NOT EXISTS project_chats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        room_name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_room_name (room_name)
      )
    `);
    logger.info('Created project_chats table');

    await q(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        sender_id INT,
        sender_name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        message_type ENUM('text', 'system', 'bot') DEFAULT 'text',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_project_id (project_id),
        INDEX idx_sender_id (sender_id),
        INDEX idx_created_at (created_at),
        INDEX idx_message_type (message_type)
      )
    `);
    logger.info('Created chat_messages table');

    try {
      await q('ALTER TABLE chat_messages MODIFY COLUMN sender_id INT NULL');
      logger.info('Modified chat_messages sender_id to allow NULL');
    } catch (e) {

      logger.warn('Note: chat_messages sender_id modification skipped (might already be correct)');
    }

    try {
      await q('ALTER TABLE chat_messages DROP FOREIGN KEY chat_messages_ibfk_1');
      logger.info('Dropped foreign key constraint on chat_messages.sender_id');
    } catch (e) {

      logger.warn('Note: foreign key drop skipped (might not exist)');
    }

    await q(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        user_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_online BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE,
        UNIQUE KEY unique_project_user (project_id, user_id),
        INDEX idx_project_id (project_id),
        INDEX idx_user_id (user_id),
        INDEX idx_is_online (is_online)
      )
    `);
    logger.info('Created chat_participants table');

    logger.info('Seeding test notifications...');
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
    logger.info('Test notifications seeded');

    logger.info('Migrations completed successfully');
    process.exit(0);
  } catch (e) {
    logger.error('Migration failed:', e.message);
    process.exit(1);
  }
}

runMigrations();