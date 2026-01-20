#!/usr/bin/env node
// Run an SQL migration file using Node (no mysql CLI required).
// Usage:
//   node scripts/run-migration.js db/migrations/20260120_add_new_assignee_id_to_task_resign_requests.sql --host 127.0.0.1 --user root --pass "" --db market_task_db
// Or set env vars: DB_HOST, DB_USER, DB_PASS, DB_NAME

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const argv = require('minimist')(process.argv.slice(2));
const sqlFile = argv._[0];
if (!sqlFile) {
  console.error('Usage: node scripts/run-migration.js <sql-file> [--host HOST] [--user USER] [--pass PASS] [--db DB_NAME]');
  process.exit(2);
}

const DB_HOST = argv.host || process.env.DB_HOST || '127.0.0.1';
const DB_USER = argv.user || process.env.DB_USER || 'root';
let DB_PASS = argv.pass || process.env.DB_PASS || '';
const DB_NAME = argv.db || process.env.DB_NAME || process.env.MYSQL_DATABASE || 'market_task_db';

// In PowerShell, passing an empty value like --pass "" can be parsed as boolean true by minimist.
// Coerce accidental boolean `true` to empty string to avoid mysql2 errors.
if (DB_PASS === true) DB_PASS = '';

async function run() {
  const fullPath = path.resolve(sqlFile);
  if (!fs.existsSync(fullPath)) {
    console.error('SQL file not found:', fullPath);
    process.exit(3);
  }

  const sql = fs.readFileSync(fullPath, 'utf8');

  console.log('Connecting to DB %s@%s...', DB_NAME, DB_HOST);
  const conn = await mysql.createConnection({ host: DB_HOST, user: DB_USER, password: DB_PASS, multipleStatements: true });
  try {
    // Ensure we use the requested database
    await conn.query(`USE \`${DB_NAME}\``);
    console.log('Executing', fullPath);
    await conn.query(sql);
    console.log('Migration executed successfully.');
  } catch (e) {
    console.error('Migration error:', e && e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

run();
