const fs = require('fs');
const path = require('path');
const db = require('../src/db');

function getConnection() {
  return new Promise((resolve, reject) => {
    db.getConnection((err, conn) => err ? reject(err) : resolve(conn));
  });
}

function query(conn, sql) {
  return new Promise((resolve, reject) => {
    conn.query(sql, (err, res) => err ? reject(err) : resolve(res));
  });
}

(async () => {
  try {
    const dir = path.join(__dirname);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    if (!files.length) {
      console.log('No .sql files found in scripts/.');
      process.exit(0);
    }
    const conn = await getConnection();
    try {
      for (const file of files) {
        const filePath = path.join(dir, file);
        console.log('Running', filePath);
        const sql = fs.readFileSync(filePath, 'utf8');
        // Execute the file; allow multiple statements if present
        await query(conn, sql);
        console.log('OK', file);
      }
    } finally {
      conn.release();
    }
    console.log('All migrations applied.');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
