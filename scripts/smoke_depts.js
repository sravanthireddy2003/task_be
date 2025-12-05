require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const BASE = process.env.BASE_URL || process.env.BASEURL || process.env.BASE || 'http://localhost:4000';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Please set env TOKEN with a valid JWT'); process.exit(2); }

async function req(path, opts={}){
  const url = `${BASE}${path}`;
  const h = Object.assign({'Authorization': `Bearer ${TOKEN}`, 'Content-Type':'application/json'}, opts.headers||{});
  const res = await fetch(url, Object.assign({method: 'GET', headers: h}, opts));
  let body;
  try { body = await res.json(); } catch(e) { body = await res.text(); }
  console.log(path, '->', res.status, body);
  return { status: res.status, body };
}

(async ()=>{
  try {
    console.log('Smoke test: create department');
    const create = await req('/api/admin/departments', { method: 'POST', body: JSON.stringify({ name: 'SmokeDept' }) });
    if (create.status >= 400) { console.error('Create failed'); process.exit(3); }
    const dept = create.body && create.body.data ? create.body.data : null;
    const id = dept && (dept.id || dept.insertId);
    console.log('Created id:', id);

    console.log('Listing departments');
    await req('/api/admin/departments');

    if (id) {
      console.log('Update department');
      await req(`/api/admin/departments/${id}`, { method: 'PUT', body: JSON.stringify({ name: 'SmokeDept Updated' }) });

      console.log('Get departments (filter by id)');
      await req(`/api/admin/departments?userId=${encodeURIComponent('')}`);

      console.log('Delete department');
      await req(`/api/admin/departments/${id}`, { method: 'DELETE' });
    }

    console.log('Smoke tests completed');
    process.exit(0);
  } catch(e) {
    console.error('Smoke tests failed', e && e.message);
    process.exit(1);
  }
})();