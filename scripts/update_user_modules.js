#!/usr/bin/env node
require('dotenv').config();
const db = require('../db');
const crypto = require('crypto');

function randId() {
  // 16 hex chars
  return crypto.randomBytes(8).toString('hex');
}

function makeModules() {
  const names = [
    'User Management',
    'Dashboard',
    'Clients',
    'Departments',
    'Tasks',
    'Projects',
    // 'Team & Employees'  <--- intentionally removed
    'Workflow (Project & Task Flow)',
    'Notifications',
    'Reports & Analytics',
    'Document & File Management',
    'Settings & Master Configuration',
    'Chat / Real-Time Collaboration',
    'Approval Workflows'
  ];

  return names.map((name) => ({
    moduleId: randId(),
    name,
    access: 'full'
  }));
}

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
    if (userId) {
      rows = await q('SELECT _id, email, modules FROM users WHERE _id = ? LIMIT 1', [userId]);
    } else {
      rows = await q('SELECT _id, email, modules FROM users WHERE email = ? LIMIT 1', [email]);
    }

    if (!rows || rows.length === 0) {
      console.error('User not found for', userId ? `id=${userId}` : `email=${email}`);
      process.exit(2);
    }

    const user = rows[0];
    const modules = makeModules();

    // IMPORTANT: run database migration first to add `modules` column.
    // The migration file at database/migrations/002_add_modules_to_users.sql has been added.

    const res = await q('UPDATE users SET modules = ? WHERE _id = ?', [JSON.stringify(modules), user._id]);
    console.log(`Updated modules for user _id=${user._id} email=${user.email}. Modules count=${modules.length}`);
    console.log(JSON.stringify(modules, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Failed to update user modules:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

run();
