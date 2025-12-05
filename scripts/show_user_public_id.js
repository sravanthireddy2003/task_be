#!/usr/bin/env node
require('dotenv').config();
const db = require('../db');

async function q(sql, params=[]) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, r) => err ? reject(err) : resolve(r)));
}

async function run() {
  const email = process.argv[2] || 'korapatiashwini@gmail.com';
  try {
    const rows = await q('SELECT _id, email, public_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows || rows.length === 0) { console.log('User not found'); process.exit(2); }
    console.log(rows[0]);
    process.exit(0);
  } catch (e) { console.error(e && e.message ? e.message : e); process.exit(1); }
}

run();
