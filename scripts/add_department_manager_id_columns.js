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
    const table = 'departments';
    const cols = ['manager_id','head_id'];
    for (const c of cols) {
      const exists = await ensureColumn(table, c);
      if (exists) {
        console.log(`${c} already exists on ${table}`);
        continue;
      }
      const sql = 'ALTER TABLE `' + table + '` ADD COLUMN `' + c + '` VARCHAR(64) DEFAULT NULL';
      await q(sql).catch(e => { console.error('Failed to add', c, e && e.message); });
      console.log(`Added column ${c} to ${table}`);
    }
    console.log('Done');
    process.exit(0);
  } catch (e) {
    console.error('Fatal', e && e.message);
    process.exit(1);
  }
})();
