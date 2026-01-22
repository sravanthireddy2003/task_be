const db = require('./src/config/db');

db.query('SELECT rule_code, description, conditions, action FROM business_rules WHERE rule_code = "task_creation"', (err, res) => {
  if(err) {
    console.error('Error:', err);
  } else {
    console.log('Current task_creation rule:');
    console.log(JSON.stringify(res, null, 2));
  }
  db.end();
});
