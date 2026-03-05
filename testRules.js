const db = require('./src/config/db');
db.query("SELECT rule_code, conditions, action FROM business_rules WHERE rule_code LIKE '%project%'", (err, res) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(res, null, 2));
    process.exit();
});
