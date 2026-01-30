const db = require('./src/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

logger.info('Starting check...');

async function checkClients() {
  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) {
        logger.error('Query error:', sql, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  try {
    logger.info('Querying tables...');
    const tables = await q("SHOW TABLES");
    logger.info('Tables:', tables.map(t => Object.values(t)[0]));

    // Try clients
    try {
      logger.info('Checking clients...');
      const clients = await q("SELECT COUNT(*) as count FROM clients");
      logger.info('Clients count:', clients[0].count);
    } catch (e) {
      logger.error('Clients table error:', e.message);
    }

    // Try clientss
    try {
      logger.info('Checking clientss...');
      const clientss = await q("SELECT COUNT(*) as count FROM clientss");
      logger.info('Clientss count:', clientss[0].count);
    } catch (e) {
      logger.error('Clientss table error:', e.message);
    }

    // Check projects client_id
    try {
      logger.info('Checking projects...');
      const projects = await q("SELECT COUNT(*) as count FROM projects WHERE client_id IS NOT NULL");
      logger.info('Projects with client_id:', projects[0].count);
    } catch (e) {
      logger.error('Projects error:', e.message);
    }

  } catch (e) {
    logger.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

checkClients();