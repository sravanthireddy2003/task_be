const db = require('./src/db');
const fs = require('fs');
const path = require('path');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function runMigrations() {
  try {
    logger.info('Running workflow migrations...');

    const q = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    const schemaPath = path.join(__dirname, 'src', 'workflow', 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    const statements = schemaSQL.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);

    for (const statement of statements) {
      try {
        await q(statement);
        logger.info('Executed: ' + statement.substring(0, 50) + '...');
      } catch (e) {
        if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_FIELDNAME') {
          logger.info('Table/Column already exists, skipping: ' + statement.substring(0, 50) + '...');
        } else {
          throw e;
        }
      }
    }

    logger.info('Workflow migrations completed successfully.');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

runMigrations();