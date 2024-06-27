const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config()


const app = express();
const db = require('./db');

global.__root = __dirname + '/';

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors());

app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'controller/AuthController');
app.use('/api/auth', AuthController);

const StaffUser = require(__root + 'controller/User');
app.use('/api/users', StaffUser);

const tasksCRUD=require(__root + 'controller/Tasks');
app.use('/api/tasks',tasksCRUD);


module.exports = app;
