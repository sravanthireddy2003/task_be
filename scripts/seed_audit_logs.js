const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function main() {
  try {
    console.log('Seeding audit_logs with sample entries...');

    const samples = [
      {
        actor_id: null,
        action: 'attach-document',
        entity: 'client',
        entity_id: '62',
        details: JSON.stringify({ id: 47, file_url: '/uploads/sample_doc_1.pdf', actor_name: 'Alice Admin' })
      },
      {
        actor_id: null,
        action: 'update',
        entity: 'project',
        entity_id: '12',
        details: JSON.stringify({ changes: { status: 'Active' }, actor_name: 'Bob Manager' })
      }
    ];

    for (const s of samples) {
      await q(`INSERT INTO audit_logs (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)
        `, [s.actor_id, s.action, s.entity, s.entity_id, s.details]);
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (e) {
    console.error('Seeding failed:', e && e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
