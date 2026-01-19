const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function main() {
  try {
    console.log('Creating audit_logs table if not exists...');
    await q(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_id INT NULL,
        action VARCHAR(100) NOT NULL,
        entity VARCHAR(100) NULL,
        entity_id VARCHAR(255) NULL,
        details JSON NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_createdAt (createdAt),
        INDEX idx_audit_actor (actor_id),
        CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(_id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('audit_logs table is present (created or already existed).');
    process.exit(0);
  } catch (e) {
    console.error('Failed creating audit_logs table:', e && e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
