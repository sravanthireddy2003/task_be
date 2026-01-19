#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db'));

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function migrate() {
  try {
    console.log('Starting uploads migration: convert full URLs -> relative /uploads/... and clear blob: entries');

    const targets = [
      { table: 'files', col: 'file_url' },
      { table: 'client_documents', col: 'file_url' },
      { table: 'documents', col: 'filePath' }
    ];

    for (const t of targets) {
      // Convert entries that contain /uploads/ and are not already relative
      const updateSql = `UPDATE \`${t.table}\` SET \`${t.col}\` = CONCAT('/uploads/', SUBSTRING_INDEX(\`${t.col}\`, '/uploads/', -1)) WHERE \`${t.col}\` LIKE '%/uploads/%' AND \`${t.col}\` NOT LIKE '/uploads/%'`;
      const res1 = await q(updateSql);
      console.log(`Table ${t.table}.${t.col} - converted rows: ${res1 && res1.affectedRows ? res1.affectedRows : 0}`);

      // Clear blob: entries (these should not be persisted)
      const clearBlobSql = `UPDATE \`${t.table}\` SET \`${t.col}\` = NULL WHERE \`${t.col}\` LIKE 'blob:%'`;
      const res2 = await q(clearBlobSql);
      console.log(`Table ${t.table}.${t.col} - cleared blob: rows: ${res2 && res2.affectedRows ? res2.affectedRows : 0}`);
    }

    console.log('Migration complete. Please review affected rows and backup/rollback if necessary.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    process.exit(2);
  }
}

migrate();
