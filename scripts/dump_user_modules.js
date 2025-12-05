#!/usr/bin/env node
require('dotenv').config();
const db = require('../db');

async function q(sql, params=[]) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, r) => err ? reject(err) : resolve(r)));
}

async function run() {
  const emailArgIndex = process.argv.findIndex(a => a === '--email');
  const idArgIndex = process.argv.findIndex(a => a === '--id');
  const email = emailArgIndex >= 0 ? process.argv[emailArgIndex+1] : process.env.UPDATE_USER_EMAIL || 'korapatiashwini@gmail.com';
  const userId = idArgIndex >= 0 ? process.argv[idArgIndex+1] : null;

  try {
    let rows;
    if (userId) rows = await q('SELECT _id, email, modules FROM users WHERE _id = ? LIMIT 1', [userId]);
    else rows = await q('SELECT _id, email, modules FROM users WHERE email = ? LIMIT 1', [email]);

    if (!rows || rows.length === 0) {
      console.error('User not found');
      process.exit(2);
    }

    const u = rows[0];
    console.log('User:', u._id, u.email);
    try {
      const modules = typeof u.modules === 'string' ? JSON.parse(u.modules) : u.modules;
      console.log('modules:', JSON.stringify(modules, null, 2));
    } catch (e) {
      console.log('modules (raw):', u.modules);
    }
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

run();
