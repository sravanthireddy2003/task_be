const db = require('../db');

const q = (sql, params) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

(async () => {
  try {
    console.log('Fixing task with NULL client_id by assigning to a project...\n');

    // Get task details
    const task = await q('SELECT id, title, client_id FROM tasks WHERE id = 162');
    if (!task || task.length === 0) {
      console.log('Task 162 not found.');
      process.exit(0);
    }

    console.log(`Found task: ID ${task[0].id}, Title: "${task[0].title}", Client: ${task[0].client_id}`);

    // Get first available project
    const projects = await q('SELECT id, public_id, client_id FROM projects LIMIT 1');
    if (!projects || projects.length === 0) {
      console.log('No projects found in database. Please create a project first.');
      process.exit(1);
    }

    const project = projects[0];
    console.log(`\nAssigning to project: ID ${project.id}, Public ID: ${project.public_id}, Client ID: ${project.client_id}`);

    // Update task with project and client references
    await q(
      'UPDATE tasks SET project_id = ?, project_public_id = ?, client_id = ?, updatedAt = NOW() WHERE id = ?',
      [project.id, project.public_id, project.client_id, task[0].id]
    );

    console.log('\n✓ Task updated successfully!');

    // Verify the update
    const updated = await q('SELECT id, title, client_id, project_id, project_public_id FROM tasks WHERE id = 162');
    if (updated && updated.length > 0) {
      const u = updated[0];
      console.log(`\nVerification:`);
      console.log(`  ID: ${u.id}`);
      console.log(`  Title: "${u.title}"`);
      console.log(`  Client ID: ${u.client_id}`);
      console.log(`  Project ID: ${u.project_id}`);
      console.log(`  Project Public ID: ${u.project_public_id}`);
    }

    console.log('\nNext steps:');
    console.log(`  Test GET /api/projects/tasks?project_id=${project.id}`);
    console.log(`  You should now see the task in the response.`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e);
    process.exit(1);
  }
})();
