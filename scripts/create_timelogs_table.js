const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function main() {
  try {
    console.log('Creating timelogs table if not exists...');
    const sql = `
      CREATE TABLE IF NOT EXISTS timelogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        task_id INT DEFAULT NULL,
        date DATE DEFAULT NULL,
        hours DECIMAL(10,2) DEFAULT NULL,
        start_time DATETIME DEFAULT NULL,
        end_time DATETIME DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL,
        INDEX idx_user (user_id),
        INDEX idx_task (task_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await q(sql);
    console.log('timelogs table is present (created or already existed).');
    process.exit(0);
  } catch (e) {
    console.error('Failed to create timelogs table:', e && e.message);
    process.exit(2);
  }
}

main();
