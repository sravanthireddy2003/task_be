const db = require('./src/db');

const migration = [
    "ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;",
    "ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS rejected_at DATETIME DEFAULT NULL;"
].join(' ');

db.query(migration, (err, results) => {
    if (err) {
        console.error('Migration failed:', err);
    } else {
        console.log('Migration successful:', results);
    }
    process.exit();
});
