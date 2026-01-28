// scripts/seed_workflow_definitions.js
// Seed sample workflow definitions for TASK and PROJECT

const db = require('../src/db');

const q = (sql, params = []) => (db.q ? db.q(sql, params) : new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r))));

async function seedWorkflows() {
  const tenantId = 1; // Sample tenant

  // TASK Workflow
  const taskStates = ['Draft', 'Assigned', 'In Progress', 'Review', 'Completed', 'Closed'];
  const taskRules = {
    EMPLOYEE: {
      'Assigned': ['In Progress'],
      'In Progress': ['Review']
    },
    MANAGER: {
      'Draft': ['Assigned'],
      'Assigned': ['In Progress'],
      'Review': ['Completed'],
      'Completed': ['Closed']
    },
    ADMIN: {} // Full permissions
  };

  await q(
    'INSERT INTO workflow_definitions (tenant_id, entity_type, name, states, rules) VALUES (?, ?, ?, ?, ?)',
    [tenantId, 'TASK', 'Default Task Workflow', JSON.stringify(taskStates), JSON.stringify(taskRules)]
  );

  // PROJECT Workflow
  const projectStates = ['Draft', 'Pending Approval', 'Active', 'On Hold', 'Completed', 'Archived'];
  const projectRules = {
    MANAGER: {
      'Draft': ['Pending Approval'],
      'Active': ['On Hold', 'Completed'],
      'On Hold': ['Active'],
      'Completed': ['Archived']
    },
    ADMIN: {} // Full permissions
  };

  await q(
    'INSERT INTO workflow_definitions (tenant_id, entity_type, name, states, rules) VALUES (?, ?, ?, ?, ?)',
    [tenantId, 'PROJECT', 'Default Project Workflow', JSON.stringify(projectStates), JSON.stringify(projectRules)]
  );

  console.log('Workflow definitions seeded');
}

if (require.main === module) seedWorkflows();

module.exports = { seedWorkflows };