require('dotenv').config();
const crypto = require('crypto');
const db = require(__dirname + '/../db');

function q(sql, params=[]) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

function makeId() { return crypto.randomBytes(8).toString('hex'); }

async function getColumns(table) {
  const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [table]).catch(()=>[]);
  return Array.isArray(rows) ? rows.map(r => r.COLUMN_NAME) : [];
}

async function resolveUser(raw) {
  if (!raw) return null;
  if (/^\d+$/.test(String(raw))) return raw;
  const rows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [raw]).catch(()=>[]);
  return (rows && rows[0] && rows[0]._id) ? rows[0]._id : null;
}

(async () => {
  try {
    const table = 'departments';
    const cols = await getColumns(table);
    const hasManager = cols.includes('manager_id');
    const hasHead = cols.includes('head_id');
    const hasCreatedBy = cols.includes('created_by');
    const hasPublic = cols.includes('public_id');

    // lookup a test user to use as manager/head if available
    const testEmail = process.env.TEST_USER_EMAIL || 'testdev@tenant-1.example.com';
    const testUserRows = await q('SELECT _id, public_id FROM users WHERE email = ? LIMIT 1', [testEmail]).catch(()=>[]);
    const testUser = (testUserRows && testUserRows[0]) ? testUserRows[0] : null;

    const samples = [
      { name: 'Sales', manager: testUser ? testUser.public_id : null, head: null },
      { name: 'Engineering', manager: null, head: testUser ? testUser.public_id : null },
      { name: 'HR', manager: testUser ? testUser.public_id : null, head: testUser ? testUser.public_id : null }
    ];

    const created = [];
    for (const s of samples) {
      const parts = ['name'];
      const params = [s.name];
      if (hasManager) {
        const mid = await resolveUser(s.manager);
        parts.push('manager_id'); params.push(mid);
      }
      if (hasHead) {
        const hid = await resolveUser(s.head);
        parts.push('head_id'); params.push(hid);
      }
      if (hasPublic) {
        const pub = makeId();
        parts.push('public_id'); params.push(pub);
      }
      if (hasCreatedBy) {
        parts.push('created_by'); params.push(testUser ? testUser._id : null);
      }

      const placeholders = parts.map(_=>'?').join(', ');
      const sql = `INSERT INTO ${table} (${parts.join(', ')}, created_at) VALUES (${placeholders}, NOW())`;
      const res = await q(sql, params).catch(e => { console.error('Insert error', e && e.message); return null; });
      if (!res || !res.insertId) {
        console.warn('Insert returned no id for', s.name);
        continue;
      }
      const id = res.insertId;
      // Select back present columns to return
      const selectCols = ['id','name'].concat(hasManager ? ['manager_id'] : []).concat(hasHead ? ['head_id'] : []).concat(hasPublic ? ['public_id'] : []);
      const row = (await q(`SELECT ${selectCols.join(', ')} FROM ${table} WHERE id = ? LIMIT 1`, [id]).catch(()=>[]))[0] || null;
      if (row) created.push(row);
    }

    // Map any manager/head numeric ids to public_id
    const userIds = new Set();
    created.forEach(r => {
      if (r.manager_id) userIds.add(r.manager_id);
      if (r.head_id) userIds.add(r.head_id);
    });
    const userMap = {};
    if (userIds.size > 0) {
      const urows = await q('SELECT _id, public_id FROM users WHERE _id IN (?)', [Array.from(userIds)]).catch(()=>[]);
      (urows||[]).forEach(u => { userMap[u._id] = u.public_id || u._id; });
    }
    const out = created.map(r => ({
      id: hasPublic && r.public_id ? r.public_id : r.id,
      name: r.name,
      manager: r.manager_id ? (userMap[r.manager_id] || r.manager_id) : null,
      head: r.head_id ? (userMap[r.head_id] || r.head_id) : null
    }));

    console.log(JSON.stringify({ success: true, data: out }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Fatal:', e && e.message);
    process.exit(1);
  }
})();