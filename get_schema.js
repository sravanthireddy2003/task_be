const mysql = require('mysql');
const fs = require('fs');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taskmgr_db'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }
    const dbName = process.env.DB_NAME || 'taskmgr_db';
    connection.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?", [dbName], (err, tables) => {
        if (err) {
            console.error(err);
            connection.end();
            return;
        }

        const schema = {};
        let pending = tables.length;
        if (pending === 0) {
            fs.writeFileSync('schema_output.json', JSON.stringify(schema, null, 2), 'utf-8');
            connection.end();
            return;
        }

        tables.forEach(row => {
            const tableName = row.TABLE_NAME;
            connection.query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [dbName, tableName], (err, columns) => {
                if (!err) {
                    schema[tableName] = columns.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`);
                }
                pending--;
                if (pending === 0) {
                    fs.writeFileSync('schema_output.json', JSON.stringify(schema, null, 2), 'utf-8');
                    connection.end();
                }
            });
        });
    });
});
