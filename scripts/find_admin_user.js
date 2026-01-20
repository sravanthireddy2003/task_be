const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function main() {
  try {
    const rows = await q('SELECT _id, name, email, role, public_id FROM users WHERE role IN ("Admin","admin") LIMIT 1');
    console.log('admins:', rows);
    process.exit(0);
  } catch (e) {
    console.error('error:', e && e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
