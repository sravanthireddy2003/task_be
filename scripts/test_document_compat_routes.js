const axios = require('axios');

const BASE = process.env.BASE_URL || process.env.FRONTEND_URL || null;
if (!BASE) { console.error('BASE_URL not set. Set BASE_URL or FRONTEND_URL in environment.'); process.exit(1); }
const TOKEN = process.env.TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjNTEwYjJkZDBlMzExZjA4OGMyMDAxNTVkYWVkZjUwIiwiaWF0IjoxNzY4ODA1NDE4LCJleHAiOjE3Njg4MDYzMTh9.j0kWa5hp9hUVIjTf7-ZMV68-i8p-7T2t1Ancz_UF67k';

async function main() {
  try {
    const headers = { Authorization: 'Bearer ' + TOKEN };
    console.log('Listing documents at', BASE + '/api/documents');
    const listRes = await axios.get(BASE + '/api/documents', { headers, timeout: 10000 }).catch(e => e.response || e);
    console.log('List status:', listRes && listRes.status);
    const payload = listRes && listRes.data && (listRes.data.data || listRes.data);
    let docId = null;
    if (Array.isArray(payload) && payload.length > 0) {
      docId = payload[0].id || payload[0]._id || payload[0].document_id || payload[0].doc_id;
    } else if (payload && typeof payload === 'object') {
      // try common shapes
      if (Array.isArray(payload.rows) && payload.rows.length > 0) docId = payload.rows[0].id || payload.rows[0]._id;
    }
    if (!docId) {
      console.error('No document id found from list response. Aborting.');
      process.exit(1);
    }
    console.log('Using document id:', docId);

    const paths = [
      `/api/documents/${docId}/preview`,
      `/api/documents/preview/${docId}`,
      `/api/documents/${docId}/download`,
      `/api/documents/download/${docId}`
    ];

    for (const p of paths) {
      const url = BASE + p;
      try {
        console.log('\nRequesting', url);
        const r = await axios.get(url, { headers, responseType: 'stream', validateStatus: () => true, timeout: 15000 }).catch(e => e.response || e);
        console.log('Status:', r && r.status);
        if (r && r.headers) console.log('Content-Type:', r.headers['content-type']);
        if (r && r.data && r.data.readable) {
          let total = 0;
          r.data.on('data', (chunk) => { total += chunk.length; if (total > 65536) r.data.destroy(); });
          await new Promise((resolve) => r.data.on('close', resolve) || r.data.on('end', resolve) || r.data.on('error', resolve));
          console.log('Streamed bytes (approx):', total);
        } else {
          const txt = r && r.data && typeof r.data === 'string' ? r.data : JSON.stringify(r && r.data || '').slice(0, 400);
          console.log('Body (truncated):', txt);
        }
      } catch (err) {
        console.error('Request error for', p, err && err.message ? err.message : err);
      }
    }
  } catch (e) {
    console.error('Fatal error:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

main();
