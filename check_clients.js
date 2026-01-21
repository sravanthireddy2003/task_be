const db = require('./src/db');

console.log('Starting check...');

async function checkClients() {
  const q = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) {
        console.log('Query error:', sql, err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  try {
    console.log('Querying tables...');
    const tables = await q("SHOW TABLES");
    console.log('Tables:', tables.map(t => Object.values(t)[0]));

    // Try clients
    try {
      console.log('Checking clients...');
      const clients = await q("SELECT COUNT(*) as count FROM clients");
      console.log('Clients count:', clients[0].count);
    } catch (e) {
      console.log('Clients table error:', e.message);
    }

    // Try clientss
    try {
      console.log('Checking clientss...');
      const clientss = await q("SELECT COUNT(*) as count FROM clientss");
      console.log('Clientss count:', clientss[0].count);
    } catch (e) {
      console.log('Clientss table error:', e.message);
    }

    // Check projects client_id
    try {
      console.log('Checking projects...');
      const projects = await q("SELECT COUNT(*) as count FROM projects WHERE client_id IS NOT NULL");
      console.log('Projects with client_id:', projects[0].count);
    } catch (e) {
      console.log('Projects error:', e.message);
    }

  } catch (e) {
    console.log('Error:', e);
  } finally {
    process.exit(0);
  }
}

checkClients();