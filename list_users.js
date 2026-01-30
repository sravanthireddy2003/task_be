let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/config/db');

db.query('SELECT _id, name, role, email FROM users LIMIT 5', (err, res) => {
  if(err) {
    logger.error('Error:', err);
  } else {
    logger.info('Sample users in database:');
    logger.info(JSON.stringify(res, null, 2));
  }
  db.end();
});
