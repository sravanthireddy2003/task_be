const mysql = require('mysql');
const util = require('util');
require('dotenv').config();

(async () => {
  const conn = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'task_manager'
  });
  const query = util.promisify(conn.query).bind(conn);

  try {
    console.log('Connected to DB for seeding');

    // Insert sample clients
    await query(`INSERT INTO clientss (ref, name, company, email, phone, status, created_at, isDeleted) VALUES
      ('CLI1001','John Doe','Doe Inc.','john.doe@example.com','1234567890','Active', NOW(), 0)
    `).catch(() => {});

    await query(`INSERT INTO clientss (ref, name, company, email, phone, status, created_at, isDeleted) VALUES
      ('CLI1002','Jane Smith','Smith LLC','jane.smith@example.com','0987654321','Active', NOW(), 0)
    `).catch(() => {});

    // Contacts
    const clients = await query('SELECT id FROM clientss LIMIT 2');
    if (Array.isArray(clients) && clients.length > 0) {
      try {
        await query('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary) VALUES (?, ?, ?, ?, ?, ?)', [clients[0].id, 'Alice','alice@example.com','1112223333','Manager',1]);
      } catch(e){}
      try {
        if (clients[1]) await query('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary) VALUES (?, ?, ?, ?, ?, ?)', [clients[1].id, 'Bob','bob@example.com','4445556666','Director',1]);
      } catch(e){}
    }

    console.log('Seeding complete');
  } catch (e) {
    console.error('Seeding error', e.message);
  } finally {
    conn.end();
  }
})();