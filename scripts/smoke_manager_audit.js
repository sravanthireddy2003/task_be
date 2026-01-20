const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
require('dotenv').config();
const SECRET = process.env.SECRET || process.env.JWT_SECRET || 'change_this_secret';
const BASE = process.env.BASE_URL || process.env.FRONTEND_URL || null;
if (!BASE) { console.error('BASE_URL not set. Set BASE_URL or FRONTEND_URL in environment.'); process.exit(1); }

function q(sql, params = []) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

async function main() {
  try {
    const rows = await q("SELECT public_id, _id, name FROM users WHERE role = 'Manager' LIMIT 1");
    if (!rows || rows.length === 0) return console.error('No manager user found');
    const user = rows[0];
    const publicId = user.public_id || user._id || user.name;
    const token = jwt.sign({ id: publicId }, SECRET, { expiresIn: '7d' });
    console.log('Using token for manager:', publicId);

    const resp = await axios.get(`${BASE}/api/manager/audit-logs?all=true`, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    console.log('Status:', resp.status);
    console.log(JSON.stringify(resp.data, null, 2));
  } catch (e) {
    console.error('Request failed:', e && (e.response && e.response.data) ? e.response.data : e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
