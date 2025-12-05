require('dotenv').config();
const crypto = require('crypto');
const db = require(__dirname + '/../db');

function q(sql, params = []) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

async function getColumns(table) {
  const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]).catch(() => []);
  return Array.isArray(rows) ? rows.map(r => r.COLUMN_NAME) : [];
}

function makeId() { return crypto.randomBytes(8).toString('hex'); }

(async () => {
  try {
    const table = 'departments';
    const cols = await getColumns(table);
    const hasPublic = cols.includes('public_id');

    if (!hasPublic) {
      console.log('Adding `public_id` column to', table);
      await q(`ALTER TABLE ${table} ADD COLUMN public_id VARCHAR(64) NULL UNIQUE`).catch(e => { throw e; });
    } else {
      console.log('`public_id` column already exists on', table);
    }

    // Populate missing public_id values
    const rows = await q(`SELECT id FROM ${table} WHERE public_id IS NULL OR public_id = ''`);
    if (!rows || rows.length === 0) {
      console.log('No rows to backfill');
      process.exit(0);
    }

    const updated = [];
    for (const r of rows) {
      const pub = makeId();
      await q(`UPDATE ${table} SET public_id = ? WHERE id = ?`, [pub, r.id]);
      updated.push({ id: r.id, public_id: pub });
    }

    console.log(JSON.stringify({ success: true, updated }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Fatal:', e && e.message);
    process.exit(1);
  }
})();
