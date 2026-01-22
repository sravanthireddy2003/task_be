const db = require('./src/config/db');

db.query('SELECT _id, name, role, email FROM users LIMIT 5', (err, res) => {
  if(err) {
    console.error('Error:', err);
  } else {
    console.log('Sample users in database:');
    console.log(JSON.stringify(res, null, 2));
  }
  db.end();
});
