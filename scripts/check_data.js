const db = require('../db');

const q = (sql, params) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

(async () => {
  try {
    const tasks = await q('SELECT id, title, client_id, project_id, project_public_id FROM tasks');
    console.log('Tasks in database:');
    tasks.forEach(t => {
      console.log(`  ID: ${t.id}, Title: ${t.title}, Client: ${t.client_id}, Project ID: ${t.project_id}, Public ID: ${t.project_public_id}`);
    });
    
    const clients = await q('SELECT id, name FROM clientss LIMIT 5');
    console.log('\nClients in database (sample):');
    clients.forEach(c => {
      console.log(`  ID: ${c.id}, Name: ${c.name}`);
    });
    
    const projects = await q('SELECT id, public_id, client_id FROM projects LIMIT 5');
    console.log('\nProjects in database (sample):');
    projects.forEach(p => {
      console.log(`  ID: ${p.id}, Public ID: ${p.public_id}, Client ID: ${p.client_id}`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
