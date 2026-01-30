let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/config/db');

db.query('SELECT rule_code, description, conditions, action FROM business_rules WHERE rule_code = "task_creation"', (err, res) => {
  if(err) {
    logger.error('Error:', err);
  } else {
    logger.info('Current task_creation rule:');
    logger.info(JSON.stringify(res, null, 2));
  }
  db.end();
});
