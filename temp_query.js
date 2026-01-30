let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const db = require('./src/db');

db.query('SELECT id, public_id, client_id FROM projects WHERE id=18 OR public_id=?', ['dc8ddd50d72f015e'], (err, rows) => {
  if (err) logger.error('Error:', err);
  else logger.info('Project:', rows);
  process.exit();
});