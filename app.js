const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const db = require('./db');

global.__root = __dirname + '/';

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors());

app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'Auth/AuthController');
app.use('/api/auth', AuthController);

const IndividualController = require(__root + 'app/Individual/IndividualController');
app.use('/api/individual', IndividualController);

const EntityController = require(__root + 'app/Entity/EntityController');
app.use('/api/entity', EntityController);
// const UserController = require(__root + 'app/User/UserController');
// app.use('/api/user', UserController); 

const AuditController = require(__root + 'app/Audit/AuditController');
app.use('/api/audit', AuditController);

const AdminController = require(__root + 'app/Admin/AdminController');
app.use('/api/admin', AdminController);

const CompanyController = require(__root + 'app/Company/CompanyController.js');
app.use('/api/company', CompanyController);

module.exports = app;
