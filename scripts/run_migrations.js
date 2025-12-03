const fs = require('fs');
const path = require('path');
const db = require(__dirname + '/../db');

async function run() {
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    console.log('Running migration', full);
    const sql = fs.readFileSync(full, 'utf8');
    // naive split by semicolon — okay for simple migrations
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        // use promise wrapper
        await new Promise((resolve, reject) => {
          db.query(stmt, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      } catch (e) {
        console.error('Migration statement failed:', e.message);
      }
    }
  }
  console.log('Migrations completed');
  process.exit(0);
}


run().catch(e => { console.error(e); process.exit(1); });
