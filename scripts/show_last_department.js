require('dotenv').config();
const db = require(__dirname + '/../db');
function q(sql, params=[]) { return new Promise((res, rej) => db.query(sql, params, (e, r) => e ? rej(e) : res(r))); }
(async()=>{
  try{
    const rows = await q('SELECT * FROM departments ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  }catch(e){ console.error('err', e && e.message); process.exit(1); }
})();
