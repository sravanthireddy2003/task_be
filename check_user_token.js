const jwt = require('jsonwebtoken');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjNTEwYjJkZDBlZTMxMWYwODhjMjAwMTU1ZGFlZGY1MCIsImlhdCI6MTc2OTA2NjAyMSwiZXhwIjoxNzY5NjcwODIxfQ.GJshTATUXtRuJyg9F5loK_-nO2p6Y8hRMjXSqVNu7eQ';

// This will fail without the secret, but we can use 'verify' with options
try {
  const decoded = jwt.decode(token);
  logger.info('Decoded JWT:');
  logger.info(JSON.stringify(decoded, null, 2));
} catch (e) {
  logger.error('Error:', e.message);
}

const db = require('./src/config/db');

const userId = 'ac510b2dd0ee311f088c200155daedf50';

db.query('SELECT _id, name, role, email FROM users WHERE _id = ? LIMIT 1', [userId], (err, res) => {
  if(err) {
    logger.error('Error querying user:', err);
  } else {
    logger.info('\nUser in database:');
    logger.info(JSON.stringify(res, null, 2));
  }
  db.end();
});
