const db = require('../db');

db.query('DESCRIBE users', (err, rows) => {
  if (err) {
    console.error('Error:', err.message || err);
    return process.exit(1);
  }
  console.table(rows.map(({ Field, Type }) => ({ Field, Type })));
  process.exit(0);
});
