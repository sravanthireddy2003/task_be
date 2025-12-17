const db = require('../db');

function q(sql, params = []){
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

(async () => {
  try {
    const arg = process.argv[2];
    let clients;
    if (arg) {
      clients = await q('SELECT id, ref, name, email, user_id FROM clientss WHERE id = ? LIMIT 1', [arg]);
    } else {
      clients = await q('SELECT id, ref, name, email, user_id FROM clientss ORDER BY id DESC LIMIT 5');
    }
    if (!clients || clients.length === 0) {
      console.log('No clients found');
      process.exit(0);
    }

    for (const c of clients) {
      console.log('--- Client:', c.id, c.ref, c.name, 'email:', c.email, 'user_id:', c.user_id);
      const viewers = await q('SELECT cv.id, cv.user_id, u.email, u.name, u.public_id, u.role FROM client_viewers cv LEFT JOIN users u ON cv.user_id = u._id WHERE cv.client_id = ?', [c.id]).catch(()=>[]);
      console.log('client_viewers:', viewers.length);
      for (const v of viewers) console.log('  mapping:', v.id, 'user_id:', v.user_id, 'email:', v.email, 'name:', v.name, 'role:', v.role, 'public_id:', v.public_id);

      // find users by client email or recent created users with role Client-Viewer/Client
      if (c.email) {
        const usersByEmail = await q('SELECT _id, public_id, name, email, role, createdAt FROM users WHERE email = ? LIMIT 10', [c.email]).catch(()=>[]);
        console.log('users with client.email:', usersByEmail.length);
        for (const u of usersByEmail) console.log('  user:', u._id, u.public_id, u.name, u.email, u.role, u.createdAt);
      }

      const recentUsers = await q("SELECT _id, public_id, name, email, role, createdAt FROM users WHERE role IN ('Client-Viewer','Client') ORDER BY _id DESC LIMIT 10").catch(()=>[]);
      console.log('recent Client/Viewer users:', recentUsers.length);
      for (const u of recentUsers) console.log('  recent:', u._id, u.public_id, u.name, u.email, u.role, u.createdAt);
    }
    process.exit(0);
  } catch (e) {
    console.error('Error:', e && e.message);
    process.exit(1);
  }
})();
