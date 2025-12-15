const bcrypt = require('bcryptjs');
const db = require('./db');

const password = 'admin123';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Hash error:', err);
    process.exit(1);
  }
  
  console.log('Hash for "admin123":', hash);
  
  // Update the admin user
  db.query('UPDATE users SET password = ? WHERE email = ? LIMIT 1', [hash, 'korapatiashwini@gmail.com'], (err, result) => {
    if (err) {
      console.error('Update error:', err.message);
      process.exit(1);
    }
    
    console.log('✅ Admin password updated!');
    console.log('Email: korapatiashwini@gmail.com');
    console.log('Password: admin123');
    process.exit(0);
  });
});
