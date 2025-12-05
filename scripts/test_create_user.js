require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const TOKEN = process.env.TOKEN;
const BASE = process.env.BASE_URL || 'http://localhost:4000';
if (!TOKEN) { console.error('Set TOKEN env var'); process.exit(2); }

(async ()=>{
  try {
    const res = await fetch(`${BASE}/api/users/create`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ name: 'Test Employee', email: `te+${Date.now()}@example.com`, phone: '9998887777', role: 'Employee' })
    });
    const body = await res.json().catch(()=>null);
    console.log('status', res.status);
    console.log(JSON.stringify(body, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('err', e && e.message);
    process.exit(1);
  }
})();
