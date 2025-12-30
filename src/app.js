const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config()
const app = express();
const db = require('./db');
const path = require('path');
const fs = require('fs');

global.__root = __dirname + '/';

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Ensure uploads directory exists so static serving won't 404 for newly saved files
try {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const profilesDir = path.join(uploadsDir, 'profiles');
  if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
} catch (e) {
  console.warn('Failed to ensure uploads directory exists:', e && e.message);
}
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

const AuthController = require(__root + 'controllers/AuthController');
app.use('/api/auth', AuthController);

// Client-Viewer Access Control Middleware
// Enforces read-only access and endpoint restrictions for Client-Viewer users
const clientViewerAccessControl = require(__root + 'middleware/clientViewerAccess');

const StaffUser = require(__root + 'controllers/User');
app.use('/api/users', clientViewerAccessControl, StaffUser);

const tasksCRUD=require(__root + 'controllers/Tasks');
app.use('/api/tasks', clientViewerAccessControl, tasksCRUD);


const uploadCRUD=require(__root + 'controllers/Uploads');
app.use('/api/uploads',uploadCRUD);

const clientRoutes = require(__root + 'routes/clientRoutes');
app.use('/api/clients', clientRoutes);

// Admin routes (modules, departments, projects, tasks overview)
const adminRoutes = require(__root + 'routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// Project Management Routes (department-wise projects, tasks, subtasks)
const projectRoutes = require(__root + 'routes/projectRoutes');
app.use('/api/projects', projectRoutes);

const managerRoutes = require(__root + 'routes/managerRoutes');
app.use('/api/manager', managerRoutes);

const employeeRoutes = require(__root + 'routes/employeeRoutes');
app.use('/api/employee', employeeRoutes);


module.exports = app;
