const mysql = require('mysql');

const dbConfig = {
    host     : '127.0.0.1',
    port     : '3306',
    user     : 'root',
    password : '',    
    database :'market_task_db',
};

const connection = mysql.createConnection(dbConfig);

connection.connect();

connection.query('SELECT 1 + 1 AS solution', function (error, results, fields) {
  if (error) throw error;
  console.log('The solution is: ', results[0].solution);
  connection.end();
});
