require('dotenv').config();
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DEFAULT_TENANT = process.env.DEFAULT_TENANT || process.env.DEFAULT_TENANT_ID || process.env.TENANT_ID || 'tenant_1';

function genPassword(len = 12) {
  return crypto.randomBytes(len).toString('base64').slice(0, len) + 'Aa1!';
}

// sanitize tenant to use as email domain (domains cannot contain underscores)
const sanitizedTenant = String(DEFAULT_TENANT).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const emailDomain = `${sanitizedTenant}.example.com`;

const usersToCreate = [
  { name: 'Admin User', email: `admin@${emailDomain}`, role: 'Admin' },
  { name: 'Manager User', email: `manager@${emailDomain}`, role: 'Manager' },
  { name: 'Employee User', email: `employee@${emailDomain}`, role: 'Employee' }
];

async function q(sql, params=[]) {
  return new Promise((res, rej) => db.query(sql, params, (err, r) => err ? rej(err) : res(r)));
}

async function run() {
  console.log('Creating users for tenant:', DEFAULT_TENANT);

  for (const u of usersToCreate) {
    try {
      // check existing
      const exists = await q('SELECT * FROM users WHERE email = ? AND tenant_id = ? LIMIT 1', [u.email, DEFAULT_TENANT]).catch(()=>[]);
      if (exists && exists.length) {
        console.log('User already exists, skipping:', u.email);
        continue;
      }

      const password = genPassword(10);
      const hashed = await bcrypt.hash(password, 10);
      // Insert into columns present in your schema. _id is auto-increment.
      const title = u.title || '';
      const isAdmin = u.role === 'Admin' ? 1 : 0;
      const tasks = JSON.stringify([]);
      const insert = 'INSERT INTO users (name, title, role, email, password, isAdmin, tasks, isActive, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
      const result = await q(insert, [u.name, title, u.role, u.email, hashed, isAdmin, tasks, 1, DEFAULT_TENANT]);

      const newId = result && result.insertId ? result.insertId : '(unknown)';
      console.log(`Created user: ${u.email}  role=${u.role}  _id=${newId}  password=${password}`);
    } catch (e) {
      console.error('Failed to create user', u.email, e.message || e);
    }
  }

  console.log('Done. Verify by running: SELECT _id, email, role, tenant_id FROM users WHERE tenant_id = "' + DEFAULT_TENANT + '"');
  process.exit(0);
}

run();
