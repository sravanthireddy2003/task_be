let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const ADMIN_PUBLIC_ID = 'ac510b2dd0e311f088c200155daedf50'; // from users table
const SECRET = process.env.SECRET || process.env.JWT_SECRET || 'change_this_secret';
const BASE = process.env.BASE_URL || 'http://localhost:4000';

async function main() {
  try {
    const token = jwt.sign({ id: ADMIN_PUBLIC_ID }, SECRET, { expiresIn: '7d' });
    logger.info('Using token:', token);

    const resp = await axios.get(`${BASE}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });
    logger.info('Status:', resp.status);
    logger.info(JSON.stringify(resp.data, null, 2));
  } catch (e) {
    logger.error('Error:', e.response ? e.response.data : e.message);
  }
}

main();