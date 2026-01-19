const db = require('../src/db');

// Scans the current database for text columns that likely contain upload paths
// and fixes double-encoded values like '/uploads/Full%2520Name.pdf' -> '/uploads/Full Name.pdf'
// Usage: node scripts/fix_double_encoded_urls.js

function q(sql, params=[]) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function findCandidateColumns() {
  const sql = `
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND DATA_TYPE IN ('varchar','text','char')
      AND (
        LOWER(COLUMN_NAME) LIKE '%file%'
        OR LOWER(COLUMN_NAME) LIKE '%url%'
        OR LOWER(COLUMN_NAME) LIKE '%path%'
        OR LOWER(COLUMN_NAME) LIKE '%storage%'
      )
  `;
  return await q(sql);
}

async function getPrimaryKeyColumn(table) {
  const rows = await q(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' LIMIT 1`,
    [table]
  );
  return (rows && rows[0] && rows[0].COLUMN_NAME) || null;
}

function normalizeStoredValue(val) {
  if (!val || typeof val !== 'string') return null;
  if (val.indexOf('/uploads/') === -1) return null;
  try {
    // Replace %25 -> % repeatedly
    let s = val;
    while (s.indexOf('%25') !== -1) s = s.replace(/%25/g, '%');
    // Attempt to decode URI components for the uploads part only
    const parts = s.split('/uploads/');
    if (parts.length < 2) return null;
    const prefix = parts[0];
    const rest = parts.slice(1).join('/uploads/');
    const decoded = decodeURIComponent(rest);
    return (prefix ? prefix + '/uploads/' : '/uploads/') + decoded;
  } catch (e) {
    return null;
  }
}

async function processTableColumn(table, column) {
  const pk = await getPrimaryKeyColumn(table);
  if (!pk) {
    console.log(`[SKIP] ${table}.${column} - no primary key found`);
    return { updated: 0, skipped: 0 };
  }

  const selectSql = `SELECT ?? AS __pk, ?? AS __val FROM ?? WHERE ?? LIKE ?`;
  const rows = await q(selectSql, [pk, column, table, column, '%/uploads/%25%']);
  if (!rows || rows.length === 0) return { updated: 0, skipped: 0 };

  let updated = 0; let skipped = 0;
  for (const r of rows) {
    const current = r.__val;
    const newVal = normalizeStoredValue(current);
    if (!newVal) { skipped++; continue; }
    if (newVal === current) { skipped++; continue; }
    try {
      const updateSql = `UPDATE ?? SET ?? = ? WHERE ?? = ? LIMIT 1`;
      await q(updateSql, [table, column, newVal, pk, r.__pk]);
      console.log(`[UPDATE] ${table}.${column} id=${r.__pk} -> ${newVal}`);
      updated++;
    } catch (e) {
      console.error(`[ERROR] updating ${table}.${column} id=${r.__pk}:`, e && e.message);
    }
  }
  return { updated, skipped };
}

async function main() {
  try {
    console.log('Scanning for candidate columns...');
    const cols = await findCandidateColumns();
    const byTable = {};
    cols.forEach(c => {
      const t = c.TABLE_NAME; const col = c.COLUMN_NAME;
      if (!byTable[t]) byTable[t] = new Set();
      byTable[t].add(col);
    });

    let totalUpdated = 0; let totalSkipped = 0;
    for (const table of Object.keys(byTable)) {
      for (const column of Array.from(byTable[table])) {
        console.log(`Processing ${table}.${column} ...`);
        const res = await processTableColumn(table, column);
        totalUpdated += res.updated; totalSkipped += res.skipped;
      }
    }
    console.log(`Done. Updated: ${totalUpdated}, Skipped: ${totalSkipped}`);
    process.exit(0);
  } catch (e) {
    console.error('Script failed:', e && e.message);
    process.exit(2);
  }
}

main();
