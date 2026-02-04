const mysql = require('mysql');
const env = require('./env');
const logger = require('../logger');
 
const dbConfig = {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: false,
    connectionLimit: 10,
};
 
const pool = mysql.createPool(dbConfig);
 
pool.on('connection', function (connection) {
    logger.info(`DB connected (threadId=${connection.threadId})`);
});
 
pool.on('error', function (err) {
    logger.error('MySQL pool error: ' + (err && err.message));
});
 
pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') logger.error('Database connection was closed.');
        if (err.code === 'ER_CON_COUNT_ERROR') logger.error('Database has too many connections.');
        if (err.code === 'ECONNREFUSED') logger.error('Database connection was refused.');
        logger.warn('Initial DB connection failed; continuing — will retry on first query.');
    }
    if (connection) connection.release();
});
 
function endPool(cb) {
    try {
        pool.end(err => {
            if (err) logger.error('Error closing DB pool: ' + (err && err.message));
            else logger.info('DB pool closed');
            if (typeof cb === 'function') cb(err);
        });
    } catch (e) {
        logger.error('Failed to end DB pool: ' + (e && e.message));
        if (typeof cb === 'function') cb(e);
    }
}
 
module.exports = pool;
module.exports.end = endPool;
 
 
 