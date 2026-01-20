#!/usr/bin/env node
/*
 Run this to POST an approval and then verify DB state.
 Usage:
   node scripts/test-approve.js --task 229 --request 41 --new 59
 Environment variables (optional, defaults shown):
   API_BASE=http://localhost:4000
   DB_HOST=localhost
   DB_USER=root
   DB_PASS=
   DB_NAME=your_db_name
*/

const axios = require('axios');
const mysql = require('mysql2/promise');

const argv = require('minimist')(process.argv.slice(2));
const taskId = argv.task || argv.t || '229';
const requestId = argv.request || argv.r || '41';
const newAssignee = argv.new || argv.n; // required

if (!newAssignee) {
  console.error('Missing --new <newAssigneeId|email|publicId>');
  process.exit(2);
}

const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'task_be';
const AUTH_TOKEN = argv.token || argv.auth || process.env.AUTH_TOKEN || process.env.TOKEN || null;

async function main(){
  try{
    console.log('POSTing approve...');
    const url = `${API_BASE}/api/tasks/${taskId}/reassign-requests/${requestId}/approve`;
    let payload;
    if (/^\d+$/.test(String(newAssignee))) payload = { new_assignee_id: Number(newAssignee) };
    else if (newAssignee.includes('@')) payload = { email: newAssignee };
    else payload = { newAssigneePublicId: newAssignee };
    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) headers['Authorization'] = AUTH_TOKEN.startsWith('Bearer ') ? AUTH_TOKEN : `Bearer ${AUTH_TOKEN}`;
    const resp = await axios.post(url, payload, { headers });
    console.log('API response:', JSON.stringify(resp.data, null, 2));
  }catch(err){
    if (err.response) console.error('API error:', err.response.status, err.response.data);
    else console.error('API request failed:', err.message);
  }

  // Wait a moment for DB commit
  await new Promise(r => setTimeout(r, 500));

  // Connect to DB and inspect rows
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASS, database: DB_NAME });
  try{
    console.log('\nQuery: resign request');
    const [rrows] = await conn.execute('SELECT id, task_id, requested_by, new_assignee_id, status FROM task_resign_requests WHERE id = ?', [requestId]);
    console.log(JSON.stringify(rrows, null, 2));

    console.log('\nQuery: taskassignments');
    const [trows] = await conn.execute('SELECT id, user_id, task_id, is_read_only FROM taskassignments WHERE task_id = ? ORDER BY id DESC LIMIT 10', [taskId]);
    console.log(JSON.stringify(trows, null, 2));
  }catch(e){
    console.error('DB query error:', e.message);
    if (e.code === 'ER_BAD_DB_ERROR') {
      console.error(`Database "${DB_NAME}" not found. Set DB_NAME or MYSQL_DATABASE env var to your database.`);
    }
  }finally{
    await conn.end();
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
