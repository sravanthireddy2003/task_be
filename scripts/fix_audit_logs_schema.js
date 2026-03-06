const db = require('../src/config/db');

async function fixAuditLogsSchema() {
    const queries = [
        "ALTER TABLE audit_logs ADD COLUMN module VARCHAR(50) DEFAULT NULL COMMENT 'Module name: Auth, Tasks, Projects, etc.'",
        "ALTER TABLE audit_logs ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of actor'",
        "ALTER TABLE audit_logs ADD COLUMN user_agent TEXT DEFAULT NULL COMMENT 'User agent string'",
        "ALTER TABLE audit_logs ADD COLUMN correlation_id VARCHAR(100) DEFAULT NULL COMMENT 'Request correlation ID'",
        "ALTER TABLE audit_logs ADD COLUMN previous_value JSON DEFAULT NULL COMMENT 'Previous state before change'",
        "ALTER TABLE audit_logs ADD COLUMN new_value JSON DEFAULT NULL COMMENT 'New state after change'"
    ];

    console.log('Starting schema update for audit_logs...');
    for (const query of queries) {
        try {
            await new Promise((resolve, reject) => {
                db.query(query, (err) => {
                    // Ignore Duplicate column name errors
                    if (err && err.code !== 'ER_DUP_FIELDNAME') {
                        return reject(err);
                    }
                    resolve();
                });
            });
            console.log(`Executed: ${query.split(' COMMENT')[0]}`);
        } catch (error) {
            console.error(`Failed: ${query}`);
            console.error(error);
        }
    }

    console.log('Schema update complete.');
    db.end((err) => {
        if (err) console.error('Error closing DB:', err);
        process.exit(0);
    });
}

fixAuditLogsSchema();
