require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const TOKEN = process.env.TOKEN;
const BASE = process.env.BASE_URL || 'http://localhost:4000';
if (!TOKEN) { console.error('Set TOKEN env var'); process.exit(2); }

async function req(path, opts={}){
  const url = `${BASE}${path}`;
  const h = Object.assign({'Authorization': `Bearer ${TOKEN}`, 'Content-Type':'application/json'}, opts.headers||{});
  const res = await fetch(url, Object.assign({method: 'GET', headers: h}, opts));
  let body;
  try { body = await res.json(); } catch(e) { body = await res.text(); }
  return { status: res.status, body };
}

(async ()=>{
  try {
    // create user
    const create = await req('/api/users/create', { method: 'POST', body: JSON.stringify({ name: 'Setup User', email: `setup+${Date.now()}@example.com`, role: 'Employee' }) });
    console.log('create', create.status, create.body);
    if (create.status !== 201) process.exit(3);
    const setupToken = create.body && create.body.data && create.body.data.setupToken;
    if (!setupToken) { console.error('No setupToken returned'); process.exit(4); }

    // complete setup
    const newPass = 'SetupPass123!';
    const complete = await fetch(`${BASE}/api/auth/complete-setup`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ setupToken, newPassword: newPass, confirmPassword: newPass }) });
    const cbody = await complete.json().catch(()=>null);
    console.log('complete', complete.status, cbody);

    process.exit(0);
  } catch (e) {
    console.error('err', e && e.message);
    process.exit(1);
  }
})();
