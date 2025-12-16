const fs = require('fs');
const path = require('path');
const db = require(__dirname + '/../db');

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
const migrationFile = path.join(migrationsDir, '008_create_projects_tasks_schema.sql');

console.log('Running migration:', migrationFile);
runSqlFile(migrationFile)
  .then((res) => {
    console.log('Migration applied successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  });
