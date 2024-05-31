const mysql = require('mysql');

let dbConfig = {
    host     : '127.0.0.1',
    port     : '3306',
    user     : 'root',
    password : '',    
    database : 'task_db'
};

const pool = mysql.createPool(dbConfig);

pool.on('connection', function (connection) {
    console.log('Connected to the database via threadId %d!', connection.threadId);
});

pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.');
        }
        return;
    }

    if (connection) connection.release();
    return;
});

module.exports = pool;

