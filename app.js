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

// Global response logger: logs outgoing response bodies for each request
app.use((req, res, next) => {
  const oldJson = res.json;
  const oldSend = res.send;

  res.json = function (body) {
    try {
      console.log(`[RESPONSE] ${req.method} ${req.originalUrl} ->`, typeof body === 'object' ? JSON.stringify(body) : body);
    } catch (e) {
      console.log(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
    }
    return oldJson.call(this, body);
  };

  res.send = function (body) {
    try {
      console.log(`[RESPONSE] ${req.method} ${req.originalUrl} ->`, typeof body === 'object' ? JSON.stringify(body) : body);
    } catch (e) {
      console.log(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
    }
    return oldSend.call(this, body);
  };

  next();
});

// Error handler: log uncaught errors and forward a 500 response
app.use((err, req, res, next) => {
  try {
    console.error('[UNCAUGHT ERROR]', err && err.stack ? err.stack : err);
  } catch (e) {
    console.error('[UNCAUGHT ERROR] (failed to print stack)', err);
  }
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    next(err);
  }
});

app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'controller/AuthController');
app.use('/api/auth', AuthController);

const StaffUser = require(__root + 'controller/User');
app.use('/api/users', StaffUser);

const tasksCRUD=require(__root + 'controller/Tasks');
app.use('/api/tasks',tasksCRUD);

const clientsCRUD=require(__root + 'controller/ClientsApi');
app.use('/api/clients',clientsCRUD);


const uploadCRUD=require(__root + 'controller/Uploads');
app.use('/api/uploads',uploadCRUD);

// Admin routes (modules, departments, projects, tasks overview)
const adminRoutes = require(__root + 'routes/adminRoutes');
app.use('/api/admin', adminRoutes);



module.exports = app;
