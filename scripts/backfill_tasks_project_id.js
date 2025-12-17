const db = require('../db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    console.log('Starting backfill: populate tasks.project_id from client_id');

    // Check if project_id column exists
    const colCheck = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'project_id'");
    if (!Array.isArray(colCheck) || colCheck.length === 0) {
      console.log('ERROR: tasks.project_id column does not exist. Run add_tasks_project_columns.js first.');
      process.exit(1);
    }

    // Get all tasks that have a client_id but no project_id
    const tasksWithoutProject = await q(`
      SELECT t.id, t.client_id 
      FROM tasks t 
      WHERE (t.project_id IS NULL OR t.project_id = 0) 
      AND t.client_id IS NOT NULL
      LIMIT 100
    `);

    console.log(`Found ${tasksWithoutProject.length} tasks without project_id`);

    // For each task, try to find a project for that client and link it
    let updated = 0, skipped = 0;
    for (const task of tasksWithoutProject) {
      try {
        // Find a project for this client with both id and public_id
        const projects = await q('SELECT id, public_id FROM projects WHERE client_id = ? LIMIT 1', [task.client_id]);
        if (Array.isArray(projects) && projects.length > 0) {
          const projectId = projects[0].id;
          const projectPublicId = projects[0].public_id;
          
          // Update both project_id and project_public_id columns
          const updateQuery = `
            UPDATE tasks 
            SET project_id = ?, project_public_id = ?, updatedAt = NOW()
            WHERE id = ?
          `;
          await q(updateQuery, [projectId, projectPublicId, task.id]);
          console.log(`Updated task ${task.id} -> project ${projectId} (public_id: ${projectPublicId})`);
          updated++;
        } else {
          console.log(`Skipped task ${task.id}: no project found for client ${task.client_id}`);
          skipped++;
        }
      } catch (e) {
        console.error(`Error updating task ${task.id}:`, e && e.message);
      }
    }

    console.log(`\nBackfill complete. Updated: ${updated}, Skipped: ${skipped}`);
    console.log('Next steps:');
    console.log('1. If you need to link more tasks, re-run this script');
    console.log('2. Create new tasks with projectId/projectPublicId in POST requests');
    console.log('3. GET /api/projects/tasks?project_id=<ID> should now return tasks');
    
    process.exit(0);
  } catch (e) {
    console.error('Backfill failed:', e && e.message);
    process.exit(1);
  }
})();
