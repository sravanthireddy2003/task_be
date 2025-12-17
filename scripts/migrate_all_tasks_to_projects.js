const db = require('../db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    console.log('Starting comprehensive task-to-project migration');
    console.log('='.repeat(60));

    // Step 1: Check if project columns exist, if not create them
    console.log('\nStep 1: Checking project columns...');
    const colCheck = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME IN ('project_id', 'project_public_id')");
    const hasProjectId = colCheck.some(c => c.COLUMN_NAME === 'project_id');
    const hasProjectPublicId = colCheck.some(c => c.COLUMN_NAME === 'project_public_id');

    if (!hasProjectId || !hasProjectPublicId) {
      console.log('Missing columns detected. Adding...');
      if (!hasProjectId) {
        console.log('  Adding column: project_id');
        await q("ALTER TABLE tasks ADD COLUMN project_id INT NULL");
      }
      if (!hasProjectPublicId) {
        console.log('  Adding column: project_public_id');
        await q("ALTER TABLE tasks ADD COLUMN project_public_id VARCHAR(255) NULL");
      }
      console.log('Columns added successfully.');
    } else {
      console.log('✓ Project columns already exist.');
    }

    // Step 2: Migrate tasks without project_id but with client_id
    console.log('\nStep 2: Finding tasks without project references...');
    const tasksWithoutProject = await q(`
      SELECT t.id, t.client_id, t.title
      FROM tasks t 
      WHERE (t.project_id IS NULL OR t.project_id = 0) 
      AND t.client_id IS NOT NULL
      ORDER BY t.id
    `);

    console.log(`Found ${tasksWithoutProject.length} tasks without project references.`);

    if (tasksWithoutProject.length > 0) {
      console.log('\nStep 3: Linking tasks to projects...');
      let updated = 0, skipped = 0, errors = 0;

      for (const task of tasksWithoutProject) {
        try {
          // Find a project for this client
          const projects = await q(
            'SELECT id, public_id FROM projects WHERE client_id = ? LIMIT 1',
            [task.client_id]
          );

          if (Array.isArray(projects) && projects.length > 0) {
            const projectId = projects[0].id;
            const projectPublicId = projects[0].public_id;

            // Update task with project references
            await q(
              'UPDATE tasks SET project_id = ?, project_public_id = ?, updatedAt = NOW() WHERE id = ?',
              [projectId, projectPublicId, task.id]
            );
            console.log(`  ✓ Task ${task.id} ("${task.title}") → Project ${projectId} (${projectPublicId})`);
            updated++;
          } else {
            console.log(`  ⊘ Task ${task.id} ("${task.title}") - No project found for client ${task.client_id}`);
            skipped++;
          }
        } catch (e) {
          console.error(`  ✗ Task ${task.id} - Error: ${e && e.message}`);
          errors++;
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('Migration Summary:');
      console.log(`  Updated: ${updated}`);
      console.log(`  Skipped: ${skipped} (no project for client)`);
      console.log(`  Errors:  ${errors}`);
    }

    // Step 4: Verify results
    console.log('\nStep 4: Verification...');
    const tasksWithProject = await q('SELECT COUNT(*) as count FROM tasks WHERE project_id IS NOT NULL');
    const tasksTotal = await q('SELECT COUNT(*) as count FROM tasks');
    console.log(`  Total tasks: ${tasksTotal[0].count}`);
    console.log(`  Tasks with project: ${tasksWithProject[0].count}`);

    console.log('\n' + '='.repeat(60));
    console.log('Migration complete!');
    console.log('Next steps:');
    console.log('  1. Test GET /api/projects/tasks?project_id=<project_id>');
    console.log('  2. Verify response includes all tasks with proper project references');
    console.log('  3. Create new tasks with projectId/projectPublicId in POST requests');
    
    process.exit(0);
  } catch (e) {
    console.error('\nMigration FAILED:', e && e.message);
    console.error(e);
    process.exit(1);
  }
})();
