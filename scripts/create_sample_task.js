const db = require('../db');

const q = (sql, params) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

/**
 * Helper script to create a sample task with proper project and user assignment
 * Usage: node scripts/create_sample_task.js
 */
(async () => {
  try {
    console.log('Creating sample task with project assignment...\n');

    // Get a sample project
    const projects = await q('SELECT id, public_id, client_id FROM projects LIMIT 1');
    if (!projects || projects.length === 0) {
      console.log('❌ No projects found. Please create a project first.');
      process.exit(1);
    }
    const project = projects[0];

    // Get sample users
    const users = await q('SELECT _id, public_id, name FROM users LIMIT 2');
    if (!users || users.length === 0) {
      console.log('❌ No users found. Please create users first.');
      process.exit(1);
    }

    // Prepare task data
    const taskData = {
      title: 'Sample Task with Project',
      description: 'This task is properly linked to a project and users',
      priority: 'HIGH',
      stage: 'TODO',
      taskDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      assigned_to: users.map(u => u._id), // Assign to available users
      client_id: project.client_id,
      projectId: project.id,
      projectPublicId: project.public_id,
      time_alloted: 10,
      status: 'OPEN'
    };

    console.log('Task data to be created:');
    console.log(JSON.stringify(taskData, null, 2));
    console.log('\nInstructions:');
    console.log('1. Send POST request to: POST /api/tasks');
    console.log('2. Add Authorization header with valid JWT token');
    console.log('3. Send the above JSON in request body');
    console.log('\nExample curl command:');
    console.log(`curl -X POST http://localhost:4000/api/tasks \\`);
    console.log(`  -H "Authorization: Bearer YOUR_TOKEN" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '${JSON.stringify(taskData)}'`);

    console.log('\nAfter task creation, test with:');
    console.log(`curl -H "Authorization: Bearer YOUR_TOKEN" \\`);
    console.log(`  "http://localhost:4000/api/projects/tasks?project_id=${project.id}"`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
