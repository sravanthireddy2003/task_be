const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const ADMIN_PUBLIC_ID = 'ac510b2dd0e311f088c200155daedf50'; // from users table
const SECRET = process.env.SECRET || process.env.JWT_SECRET || 'change_this_secret';
const BASE = process.env.BASE_URL || 'http://localhost:4000';

async function main() {
  try {
    const token = jwt.sign({ id: ADMIN_PUBLIC_ID }, SECRET, { expiresIn: '7d' });
    console.log('Using token:', token);

    const resp = await axios.get(`${BASE}/api/admin/audit-logs?all=true`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });
    console.log('Status:', resp.status);
    console.log(JSON.stringify(resp.data, null, 2));
  } catch (e) {
    console.error('Request failed:', e && (e.response && e.response.data) ? e.response.data : e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
