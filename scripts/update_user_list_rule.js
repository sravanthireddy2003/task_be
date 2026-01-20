const db = require('../src/db');
(async () => {
  try {
    const payload = JSON.stringify({ userRole: { $in: ['Admin','Manager'] }, action: 'GET_GETUSERS' });
    db.query('UPDATE business_rules SET conditions = ? WHERE rule_code = ?', [payload, 'user_list'], (e, r) => {
      if (e) { console.error('ERR', e); process.exit(1); }
      console.log('Updated rule conditions rows:', r.affectedRows);
      db.end();
    });
  } catch (err) { console.error(err); process.exit(1); }
})();
