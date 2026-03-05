const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));

(async () => {
  try {
    console.log('Starting test insert...');
    const insert = await q("INSERT INTO audit_logs (actor_id, action, entity, details, createdAt) VALUES (?, ?, ?, ?, NOW())", [null, 'SCRIPT_TEST_INSERT', 'ScriptTest', JSON.stringify({ note: 'test insert' })]);
    console.log('Insert result:', insert);

    const rows = await q('SELECT id, actor_id, action, entity, details, createdAt FROM audit_logs ORDER BY createdAt DESC LIMIT 5');
    console.log('Recent audit rows:', rows);
  } catch (e) {
    console.error('Test failed:', e && e.message ? e.message : e);
  } finally {
    try { db.end(() => process.exit(0)); } catch (_) { process.exit(0); }
  }
})();