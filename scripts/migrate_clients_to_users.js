const db = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function q(sql, params = []){
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

(async () => {
  try {
    console.log('Starting migration: add user_id to clientss and create users for clients');

    // 1) Add user_id column if missing
    const colCheck = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientss' AND COLUMN_NAME = 'user_id'");
    if (!Array.isArray(colCheck) || colCheck.length === 0) {
      console.log('Adding column clientss.user_id');
      await q('ALTER TABLE clientss ADD COLUMN user_id INT NULL');
    } else {
      console.log('Column clientss.user_id already exists');
    }

    // 2) Add foreign key if not exists
    const fkCheck = await q("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientss' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users'");
    if (!Array.isArray(fkCheck) || fkCheck.length === 0) {
      try {
        console.log('Adding foreign key fk_client_user -> users(_id)');
        await q('ALTER TABLE clientss ADD CONSTRAINT fk_client_user FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE SET NULL ON UPDATE CASCADE');
      } catch (e) {
        console.warn('Failed to add foreign key (maybe users table or _id missing). Continuing without FK:', e.message);
      }
    } else {
      console.log('Foreign key from clientss.user_id to users detected');
    }

    // 3) Fetch clients that have no user_id
    const clients = await q('SELECT id, name FROM clientss WHERE user_id IS NULL OR user_id = 0');
    console.log('Found', clients.length, 'clients without user account mapping');

    let created = 0, skipped = 0;
    for (const c of clients) {
      try {
        // try to get an email from client_contacts primary contact
        const contacts = await q('SELECT email, name FROM client_contacts WHERE client_id = ? AND is_primary = 1 LIMIT 1', [c.id]).catch(()=>[]);
        let email = null, contactName = null;
        if (Array.isArray(contacts) && contacts.length > 0) { email = contacts[0].email; contactName = contacts[0].name; }

        // if clientss has an email column, try that
        try {
          const r = await q('SELECT email FROM clientss WHERE id = ? LIMIT 1', [c.id]);
          if (Array.isArray(r) && r.length > 0 && r[0].email) email = email || r[0].email;
        } catch (e) {}

        if (!email) {
          console.log(`Skipping client id=${c.id} (${c.name}) - no email found to create user`);
          skipped++;
          continue;
        }

        // avoid creating duplicate users for same email
        const exists = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [email]);
        if (Array.isArray(exists) && exists.length > 0) {
          const uid = exists[0]._id;
          await q('UPDATE clientss SET user_id = ? WHERE id = ?', [uid, c.id]);
          console.log(`Linked existing user ${uid} -> client ${c.id}`);
          continue;
        }

        const tempPassword = crypto.randomBytes(6).toString('hex');
        const hashed = await bcrypt.hash(tempPassword, 10);
        const publicId = crypto.randomBytes(8).toString('hex');
        const name = contactName || c.name || `Client ${c.id}`;

        const insert = await q('INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())', [publicId, name, email, hashed, 'Client', 1]);
        const newId = insert.insertId;
        if (newId) {
          await q('UPDATE clientss SET user_id = ? WHERE id = ?', [newId, c.id]);
          console.log(`Created user ${newId} for client ${c.id} (${email})`);
          created++;
        }
      } catch (e) {
        console.error('Error creating user for client', c.id, e && e.message);
      }
    }

    console.log('Migration complete. Created users:', created, 'Skipped:', skipped);
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e && e.message);
    process.exit(1);
  }
})();
