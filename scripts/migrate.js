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
    console.log('Connected to DB');

    const queries = [
      `CREATE TABLE IF NOT EXISTS clientss (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ref VARCHAR(255),
        name VARCHAR(255),
        company VARCHAR(255),
        billing_address TEXT,
        office_address TEXT,
        gst_number VARCHAR(128),
        tax_id VARCHAR(128),
        industry VARCHAR(128),
        notes TEXT,
        status ENUM('Active','Inactive','Pending','Suspended') DEFAULT 'Active',
        manager_id INT,
        email VARCHAR(255),
        phone VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        isDeleted TINYINT(1) DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS client_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        designation VARCHAR(255),
        is_primary TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS client_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        file_url TEXT,
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        uploaded_by INT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active TINYINT(1) DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS client_activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        actor_id INT,
        action VARCHAR(255),
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      `CREATE TABLE IF NOT EXISTS client_viewers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        user_id INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    ];

    for (const q of queries) {
      try {
        await query(q);
        console.log('Executed query');
      } catch (e) {
        console.warn('Query failed:', e.message);
      }
    }

    console.log('Migration complete');
  } catch (e) {
    console.error('Migration error', e.message);
  } finally {
    conn.end();
  }
})();