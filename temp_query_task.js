const db = require('./src/db');
db.query('DESCRIBE workflow_requests', (err, rows) => {
    if (err) { console.error(err); }
    else { console.log(JSON.stringify(rows, null, 2)); }
    process.exit();
});
