require('dotenv').config();
const db = require(__dirname + '/../db');

function q(sql, params=[]) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

async function ensureColumn(table, column) {
  const check = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`;
  const rows = await q(check, [table, column]).catch(()=>[]);
  return Array.isArray(rows) && rows.length > 0;
}

(async () => {
  try {
    const table = 'users';
    const column = 'phone';
    const exists = await ensureColumn(table, column);
    if (exists) {
      console.log(`Column \`${column}\` already exists on table \`${table}\``);
      process.exit(0);
    }

    const sql = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(20) DEFAULT NULL`;
    console.log('Adding column:', sql);
    await q(sql).catch(e => { console.error('Failed to add column:', e && e.message); process.exit(2); });
    console.log('Column added successfully.');
    process.exit(0);
  } catch (e) {
    console.error('Fatal:', e && e.message);
    process.exit(1);
  }
})();
