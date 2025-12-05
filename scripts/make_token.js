require('dotenv').config();
const db = require(__dirname + '/../db');
const jwt = require('jsonwebtoken');

function q(sql, params=[]) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }

(async () => {
  try {
    const email = process.env.TEST_USER_EMAIL || 'testdev@tenant-1.example.com';
    const rows = await q('SELECT _id, public_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows || rows.length === 0) {
      console.error('Test user not found. Run scripts/create_test_user.js first.');
      process.exit(2);
    }
    const u = rows[0];
    const id = u.public_id || String(u._id);
    const token = jwt.sign({ id }, process.env.SECRET || 'change_this_secret', { expiresIn: '7d' });
    console.log(token);
    process.exit(0);
  } catch (e) {
    console.error('Error creating token', e && e.message);
    process.exit(1);
  }
})();