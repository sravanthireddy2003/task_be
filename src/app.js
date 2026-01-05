const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});
const db = require('./db');
const path = require('path');
const fs = require('fs');

global.__root = __dirname + '/';

// Socket.IO authentication and room joining
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, process.env.SECRET || 'secret');
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id; // Assuming id is public_id or _id
  socket.join(`user_${userId}`);
  console.log(`User ${userId} connected and joined room user_${userId}`);
  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
  });
});

// Make io available globally
global.io = io;

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

const notificationRoutes = require(__root + 'routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);


module.exports = server;
