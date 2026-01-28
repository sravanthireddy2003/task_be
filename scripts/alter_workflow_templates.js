// scripts/alter_workflow_templates.js
const db = require('../src/db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function run() {
  try {
    console.log('Altering workflow_templates to add department/project columns if missing');
    await q("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS department_id INT NULL;");
    await q("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS department_name VARCHAR(255) NULL;");
    await q("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS project_id INT NULL;");
    await q("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS project_name VARCHAR(255) NULL;");
    console.log('Alterations complete');
    process.exit(0);
  } catch (e) {
    console.error('Alter failed', e);
    process.exit(2);
  }
}

run();
