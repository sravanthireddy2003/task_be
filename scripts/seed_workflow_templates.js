// scripts/seed_workflow_templates.js
const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function run() {
  try {
    // Simple sample template for task approvals
    const res = await q(`INSERT INTO workflow_templates (tenant_id, name, trigger_event, department_id, department_name, project_id, project_name, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`, [1, 'Task Approval', 'TASK_CREATED', null, null, null, null, 1, 1]);
    const templateId = res.insertId;
    await q(`INSERT INTO workflow_steps (template_id, step_order, role, action) VALUES (?, ?, ?, ?)`, [templateId, 1, 'Manager', 'REVIEW']);
    await q(`INSERT INTO workflow_steps (template_id, step_order, role, action) VALUES (?, ?, ?, ?)`, [templateId, 2, 'Admin', 'APPROVE']);
    console.log('Seeded workflow template', templateId);
    process.exit(0);
  } catch (e) {
    console.error('Seeding failed', e);
    process.exit(2);
  }
}

run();
