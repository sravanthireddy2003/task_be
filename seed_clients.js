const db = require('./src/db');

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

async function seedClients() {
  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

  try {
    logger.info('Seeding clients...');

    // Insert a dummy client
    const result = await q("INSERT INTO clientss (name, email, created_at, isDeleted) VALUES (?, ?, NOW(), NULL) ON DUPLICATE KEY UPDATE name = VALUES(name)", ['Test Client', 'client@example.com']);
    const clientId = result.insertId || (await q("SELECT id FROM clientss WHERE name = ?", ['Test Client']))[0].id;

    logger.info('Client ID:', clientId);

    // Find a project that has tasks
    const projectsWithTasks = await q("SELECT DISTINCT project_id FROM tasks LIMIT 1");
    if (projectsWithTasks.length > 0) {
      const projectId = projectsWithTasks[0].project_id;
      await q("UPDATE projects SET client_id = ? WHERE id = ?", [clientId, projectId]);
      logger.info('Project', projectId, 'linked to client');
    } else {
      logger.info('No projects with tasks found');
    }
  } catch (e) {
    logger.error('Error seeding clients:', e);
  } finally {
    process.exit(0);
  }
}

seedClients();