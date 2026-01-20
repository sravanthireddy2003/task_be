const db = require('./src/db');
const bcrypt = require('bcryptjs');

async function createTestUser() {
  try {
    console.log('Creating test admin user...');

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

    console.log('✅ Test admin user created/updated successfully');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
    console.log('Role: Admin');

  } catch (error) {
    console.error('❌ Failed to create test user:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser();