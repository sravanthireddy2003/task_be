const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function main() {
  try {
    const rows = await q(`SELECT a.id, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.details, a.createdAt FROM audit_logs a LEFT JOIN users u ON u._id = a.actor_id ORDER BY a.createdAt DESC`);

    const logs = (rows || []).map(r => {
      let details = r.details;
      try { if (typeof details === 'string' && details.length) details = JSON.parse(details); } catch (e) {}
      return {
        id: r.id,
        actor: { id: r.actor_id, name: r.actor_name || null },
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        details: details || null,
        createdAt: r.createdAt && (new Date(r.createdAt)).toISOString()
      };
    });

    console.log(JSON.stringify({ success: true, data: { total: logs.length, page: 1, perPage: logs.length, logs } }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Failed to print logs:', e && e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
