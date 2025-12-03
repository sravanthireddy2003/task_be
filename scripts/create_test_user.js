require('dotenv').config();
const db = require('../db');
const bcrypt = require('bcryptjs');

async function q(sql, params=[]) {
  return new Promise((res, rej) => db.query(sql, params, (err, r) => err ? rej(err) : res(r)));
}

async function run() {
  const email = process.env.TEST_USER_EMAIL || 'testdev@tenant-1.example.com';
  const tenant = process.env.DEFAULT_TENANT || 'tenant_1';
  const password = process.env.TEST_USER_PASSWORD || 'Test1234!';
  try {
    const exists = await q('SELECT * FROM users WHERE email = ? AND tenant_id = ? LIMIT 1', [email, tenant]).catch(()=>[]);
    if (exists && exists.length) {
      console.log('Test user already exists, skipping:', email);
      process.exit(0);
    }
    const hashed = await bcrypt.hash(password, 10);
    const insert = 'INSERT INTO users (name, title, role, email, password, isAdmin, tasks, isActive, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const r = await q(insert, ['Test Dev', 'Dev', 'Admin', email, hashed, 1, JSON.stringify([]), 1, tenant]);
    console.log('Created test user:', email, 'password=', password, 'id=', r.insertId);
    process.exit(0);
  } catch (e) {
    console.error('Failed to create test user', e.message || e);
    process.exit(1);
  }
}

run();
