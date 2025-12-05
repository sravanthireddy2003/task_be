require('dotenv').config();
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const TOKEN = process.env.TOKEN || '';
const MANAGER = process.env.MANAGER_ID || '';
const NAME = process.env.DEP_NAME || 'Development Test';
const HEAD = process.env.HEAD_ID || '';
const MANAGER_NAME = process.env.MANAGER_NAME || '';

if (!TOKEN) {
  console.error('Please set TOKEN environment variable with an Admin Bearer token');
  process.exit(1);
}
if (!MANAGER) {
  console.error('Please set MANAGER_ID environment variable (public_id or numeric id)');
  process.exit(1);
}

const payload = { name: NAME, managerId: MANAGER };
if (HEAD) payload.headId = HEAD;
if (MANAGER_NAME) payload.managerName = MANAGER_NAME;
const data = JSON.stringify(payload);
const url = new URL('/api/admin/departments', BASE);

const opts = {
  hostname: url.hostname,
  port: url.port || 80,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': 'Bearer ' + TOKEN
  }
};

const req = http.request(opts, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(body), null, 2)); } catch (e) { console.log(body); }
  });
});
req.on('error', (e) => { console.error('Request error', e.message); });
req.write(data);
req.end();
