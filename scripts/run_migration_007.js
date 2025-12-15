#!/usr/bin/env node
/**
 * Migration 007: Expand clients schema with all required fields
 * Run with: node scripts/run_migration_007.js
 */

const db = require('../db');
const fs = require('fs');
const path = require('path');

const migrate = () => {
  const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '007_expand_clients_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let completed = 0;
  statements.forEach((statement, idx) => {
    db.query(statement, (err) => {
      if (err) {
        console.error(`[ERROR] Statement ${idx + 1} failed:`, err.message);
      } else {
        completed++;
        console.log(`[OK] Statement ${idx + 1}/${statements.length}`);
      }

      if (completed === statements.length) {
        console.log('\n✓ Migration 007 completed successfully!');
        process.exit(0);
      }
    });
  });
};

migrate();
