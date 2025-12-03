require('dotenv').config();
const db = require('../db');

const DEFAULT_TENANT = process.env.DEFAULT_TENANT || 'default_tenant';

async function run() {
  console.log('Backfill tenants script starting. Default tenant:', DEFAULT_TENANT);

  // helper to run query returning Promise
  const q = (sql, params=[]) => new Promise((res, rej) => db.query(sql, params, (err, result) => err ? rej(err) : res(result)));

  try {
    // Users
    const usersRes = await q('SELECT COUNT(*) as cnt FROM users WHERE tenant_id IS NULL OR tenant_id = ""');
    const usersToUpdate = usersRes && usersRes[0] && usersRes[0].cnt ? usersRes[0].cnt : 0;
    if (usersToUpdate > 0) {
      const upd = await q('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ""', [DEFAULT_TENANT]);
      console.log('Updated users rows:', upd.affectedRows || usersToUpdate);
    } else console.log('No users require tenant backfill');

    // Clients (check table exists)
    try {
      await q('SELECT 1 FROM clients LIMIT 1');
      const clientsRes = await q('SELECT COUNT(*) as cnt FROM clients WHERE tenant_id IS NULL OR tenant_id = ""');
      const clientsToUpdate = clientsRes && clientsRes[0] && clientsRes[0].cnt ? clientsRes[0].cnt : 0;
      if (clientsToUpdate > 0) {
        const upd2 = await q('UPDATE clients SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ""', [DEFAULT_TENANT]);
        console.log('Updated clients rows:', upd2.affectedRows || clientsToUpdate);
      } else console.log('No clients require tenant backfill');
    } catch (e) {
      console.log('Table `clients` not found or inaccessible, skipping clients backfill');
    }

    // Tasks (optional)
    try {
      await q('SELECT 1 FROM tasks LIMIT 1');
      const tasksRes = await q('SELECT COUNT(*) as cnt FROM tasks WHERE tenant_id IS NULL OR tenant_id = ""');
      const tasksToUpdate = tasksRes && tasksRes[0] && tasksRes[0].cnt ? tasksRes[0].cnt : 0;
      if (tasksToUpdate > 0) {
        const upd3 = await q('UPDATE tasks SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ""', [DEFAULT_TENANT]);
        console.log('Updated tasks rows:', upd3.affectedRows || tasksToUpdate);
      } else console.log('No tasks require tenant backfill');
    } catch (e) {
      console.log('Table `tasks` not found or inaccessible, skipping tasks backfill');
    }

    console.log('Backfill completed');
    process.exit(0);
  } catch (e) {
    console.error('Backfill error:', e.message || e);
    process.exit(1);
  }
}

run();
