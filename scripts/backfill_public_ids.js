const db = require(__root + 'db');
const crypto = require('crypto');
require('dotenv').config();

async function q(sql, params=[]) {
  return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r)));
}

async function ensureColumn(table, column) {
  const check = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`;
  const rows = await q(check, [table, column]).catch(()=>[]);
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(table, column) {
  const exists = await ensureColumn(table, column);
  if (exists) return false;
  const sql = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(64) DEFAULT NULL`;
  await q(sql);
  return true;
}

async function backfill(table, idCol='_id', column='public_id') {
  try {
    const added = await addColumnIfMissing(table, column).catch(e => { console.warn('Could not add column', table, e && e.message); return false; });
    if (added) console.log(`Added column ${column} to ${table}`);

    const rows = await q(`SELECT ${idCol} FROM ${table} WHERE ${column} IS NULL OR ${column} = ''`);
    console.log(`Found ${rows.length} rows to backfill in ${table}`);
    for (const r of rows) {
      const idVal = r[idCol];
      const pub = crypto.randomBytes(16).toString('hex');
      await q(`UPDATE ${table} SET ${column} = ? WHERE ${idCol} = ?`, [pub, idVal]);
    }
    console.log(`Backfilled ${table}`);
  } catch (e) {
    console.error(`Backfill failed for ${table}:`, e && e.message);
  }
}

(async () => {
  try {
    // users likely already have public_id
    await backfill('clientss', 'id', 'public_id');
    await backfill('projects', 'id', 'public_id');
    await backfill('tasks', 'id', 'public_id');
    console.log('Backfill completed. Verify with SELECT id, public_id FROM <table> LIMIT 5');
    process.exit(0);
  } catch (e) {
    console.error('Fatal error', e && e.message);
    process.exit(1);
  }
})();
