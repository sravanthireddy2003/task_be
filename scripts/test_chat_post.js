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
    // find a manager and a project
    const users = await q("SELECT public_id, _id FROM users WHERE role = 'Manager' LIMIT 1");
    const projects = await q('SELECT public_id FROM projects LIMIT 1');
    if (!users.length) return console.error('No manager found');
    if (!projects.length) return console.error('No project found');
    const user = users[0];
    const projectPublicId = projects[0].public_id;
    const token = jwt.sign({ id: user.public_id || user._id }, SECRET, { expiresIn: '7d' });

    console.log('Posting message as manager to project', projectPublicId);
    const resp = await axios.post(`${BASE}/api/projects/${projectPublicId}/chat/messages`, { message: 'Test from script' }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('Status:', resp.status);
    console.log(resp.data);
  } catch (e) {
    console.error('Error:', e && e.response && e.response.data ? e.response.data : e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
