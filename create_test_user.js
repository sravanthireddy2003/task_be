const db = require('./src/db');
const bcrypt = require('bcryptjs');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function createTestUser() {
  try {
    logger.info('Creating test admin user...');

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const query = `
      INSERT INTO users (name, email, password, role, isActive, tenant_id, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
      password = VALUES(password),
      role = VALUES(role),
      isActive = VALUES(isActive)
    `;

    await new Promise((resolve, reject) => {
      db.query(query, [
        'Test Admin',
        'admin@example.com',
        hashedPassword,
        'Admin',
        1,
        'tenant_123'
      ], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    logger.info('✅ Test admin user created/updated successfully');
    logger.info('Email: admin@example.com');
    logger.info('Password: admin123');
    logger.info('Role: Admin');

  } catch (error) {
    logger.error('❌ Failed to create test user:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser();