// scripts/seed_workflow_step_meta.js
// Seed SLA and notify metadata for existing workflow steps (idempotent)

const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

async function run() {
  try {
    console.log('Seeding workflow_step_meta from existing workflow_steps...');

    // Find steps that do not yet have meta
    const steps = await q(`
      SELECT s.id, s.template_id, s.step_order, s.role
      FROM workflow_steps s
      LEFT JOIN workflow_step_meta m ON m.step_id = s.id
      WHERE m.id IS NULL
      ORDER BY s.template_id, s.step_order
    `);

    if (!steps || !steps.length) {
      console.log('No workflow steps without metadata found. Nothing to seed.');
      process.exit(0);
      return;
    }

    for (const s of steps) {
      // Simple default SLA strategy:
      // step 1 -> 4 hours, step 2 -> 12 hours, others -> 24 hours
      let slaHours = 24;
      if (s.step_order === 1) slaHours = 4;
      else if (s.step_order === 2) slaHours = 12;

      const notifyRoles = [String(s.role || '').toUpperCase() || 'MANAGER'];

      await q(
        'INSERT INTO workflow_step_meta (step_id, sla_hours, notify_roles) VALUES (?, ?, ?)',
        [s.id, slaHours, JSON.stringify(notifyRoles)]
      );
      console.log(`Seeded meta for step ${s.id} (template ${s.template_id}, order ${s.step_order})`);
    }

    console.log('workflow_step_meta seeding completed.');
    process.exit(0);
  } catch (e) {
    console.error('Seeding workflow_step_meta failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

run();
