const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'taskmgr_db'
        });
        console.log("Connected to DB.");

        const [rows] = await connection.execute('SELECT task_Id, user_Id, is_read_only FROM taskassignments WHERE task_Id IN (318, 314)');
        console.log("DB State for tasks 318 and 314:");
        console.table(rows);

        await connection.end();
    } catch (e) {
        console.error(e);
    }
}
check();
