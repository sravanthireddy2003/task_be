const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const env = require('./config/env');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});
const db = require('./db');
const ChatService = require('./services/chatService');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

global.__root = __dirname + '/';

// Security middlewares
app.disable('x-powered-by');
app.use(helmet());
app.use(xss());
app.use(hpp());
// Basic rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// Request logging: morgan -> winston
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Socket.IO authentication and room joining
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', async (socket) => {
  try {
    // Get internal user ID from public_id
    const userResult = await new Promise((resolve, reject) => {
      db.query('SELECT _id, name, role FROM users WHERE public_id = ? LIMIT 1', [socket.user.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (!userResult || userResult.length === 0) {
      socket.emit('error', { message: 'User not found' });
      socket.disconnect();
      return;
    }

    const userId = userResult[0]._id; // Internal ID
    const userName = userResult[0].name || 'Unknown User';
    const userRole = userResult[0].role || 'Employee';

  logger.info(`User ${userName} (${userId}) connected`);

  socket.join(`user_${userId}`);

  // Handle joining project chat room
  socket.on('join_project_chat', async (projectId) => {
    try {
      // Validate user has access to this project
      const hasAccess = await ChatService.validateProjectAccess(userId, projectId);

      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to this project chat' });
        return;
      }

      // Create/get project chat room
      const chatRoom = await ChatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      // Join the project room
      socket.join(roomName);

      // Add user to participants
      await ChatService.addParticipant(projectId, userId, userName, userRole);

      // Notify others in the room
      socket.to(roomName).emit('user_joined', {
        userId,
        userName,
        userRole,
        timestamp: new Date()
      });

      // Send system message
      await ChatService.emitUserPresence(projectId, userName, 'joined');

      // Send online participants list
      const onlineParticipants = await ChatService.getOnlineParticipants(projectId);
      socket.emit('online_participants', onlineParticipants);

      logger.info(`User ${userName} joined project chat: ${roomName}`);

    } catch (error) {
      logger.error('Error joining project chat:', error);
      socket.emit('error', { message: 'Failed to join project chat' });
    }
  });

  // Handle leaving project chat room
  socket.on('leave_project_chat', async (projectId) => {
    try {
      const roomName = `project_${projectId}`;

      // Leave the room
      socket.leave(roomName);

      // Update participant status
      await ChatService.removeParticipant(projectId, userId);

      // Notify others
      socket.to(roomName).emit('user_left', {
        userId,
        userName,
        timestamp: new Date()
      });

      // Send system message
      await ChatService.emitUserPresence(projectId, userName, 'left');

      logger.info(`User ${userName} left project chat: ${roomName}`);

    } catch (error) {
      logger.error('Error leaving project chat:', error);
    }
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    try {
      const { projectId, message } = data;

      // Validate access
      const hasAccess = await ChatService.validateProjectAccess(userId, projectId);
      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to send messages in this project' });
        return;
      }

      let messageType = 'text';
      let responseMessage = message;

      if (message.startsWith('/')) {
        // Handle bot command - send response as a separate bot message
        const botResponse = await ChatService.handleChatbotCommand(projectId, message, userName, userId);

        // Save the bot response message
        const botMessage = await ChatService.saveMessage(
          projectId,
          0, // System user ID for bot
          'ChatBot',
          botResponse,
          'bot'
        );

        const userMessage = await ChatService.saveMessage(
          projectId,
          userId,
          userName,
          message,
          'text'
        );

        // Emit both messages
        const roomName = `project_${projectId}`;
        io.to(roomName).emit('chat_message', userMessage);
        io.to(roomName).emit('chat_message', botMessage);

        logger.info(`Bot command processed in ${roomName}: ${userName}`);
        return; // Don't send the original message
      }

      // Save regular message to database
      const savedMessage = await ChatService.saveMessage(
        projectId,
        userId,
        userName,
        responseMessage,
        messageType
      );

      // Emit to project room
      const roomName = `project_${projectId}`;
      io.to(roomName).emit('chat_message', savedMessage);

      logger.info(`Message sent in ${roomName}: ${userName}`);

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (projectId) => {
    const roomName = `project_${projectId}`;
    socket.to(roomName).emit('user_typing', {
      userId,
      userName,
      isTyping: true
    });
  });

  socket.on('typing_stop', (projectId) => {
    const roomName = `project_${projectId}`;
    socket.to(roomName).emit('user_typing', {
      userId,
      userName,
      isTyping: false
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    logger.info(`User ${userName} disconnected`);

    // Find all project rooms this user was in and update their status
    const rooms = Array.from(socket.rooms).filter(room => room.startsWith('project_'));

    for (const roomName of rooms) {
      const projectId = roomName.replace('project_', '');

      try {
        await ChatService.removeParticipant(projectId, userId);

        // Notify others in the room
        socket.to(roomName).emit('user_left', {
          userId,
          userName,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Error updating participant status on disconnect: ' + (error && error.stack ? error.stack : String(error)));
      }
    }
  });

  } catch (error) {
    logger.error('Error in socket connection: ' + (error && error.stack ? error.stack : String(error)));
    socket.emit('error', { message: 'Connection failed' });
    socket.disconnect();
  }
});

// Make io available globally
global.io = io;

// Start workflow SLA worker (non-blocking) - commented out as not implemented in new workflow module
// try {
// } catch (e) {
//   logger.error('Failed to start workflow SLA worker:', e && e.message);
// }

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
// Accept Vite dev-server pings (Content-Type: text/x-vite-ping)
app.use((req, res, next) => {
  try {
    const ct = req.headers['content-type'] || '';
    if (ct.indexOf('text/x-vite-ping') === 0) {
      return res.status(200).send('pong');
    }
  } catch (e) { /* ignore and continue */ }
  return next();
});
app.use(cors());
// Note: rule engine is applied per-route where needed to avoid protecting public endpoints like /api/auth/login
// Serve uploads from project root `uploads` directory (not src/uploads)
// Normalize double-encoded percent sequences (e.g. "%2520") so legacy/incorrect
// links like /uploads/Full%2520Name.pdf resolve to the actual file.
app.use('/uploads', (req, res, next) => {
  try {
    if (req.url && req.url.indexOf('%25') !== -1) {
      let u = req.url;
      // Replace repeated %25 -> % until none remain (handles multiple encodings)
      while (u.indexOf('%25') !== -1) u = u.replace(/%25/g, '%');
      req.url = u;
    }
  } catch (e) {
    // ignore normalization failures and proceed to static handler
  }
  return next();
}, express.static(path.join(__dirname, '..', 'uploads')));

try {
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const profilesDir = path.join(uploadsDir, 'profiles');
  if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
} catch (e) {
  logger.warn('Failed to ensure uploads directory exists: ' + (e && e.message ? e.message : String(e)));
}
app.use((req, res, next) => {
  const oldJson = res.json;
  const oldSend = res.send;

  res.json = function (body) {
    try {
      if (env.NODE_ENV !== 'production') {
        logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> ${typeof body === 'object' ? JSON.stringify(body) : body}`);
      } else {
        logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
      }
    } catch (e) {
      logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
    }
    return oldJson.call(this, body);
  };

  res.send = function (body) {
    try {
      if (env.NODE_ENV !== 'production') {
        logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> ${typeof body === 'object' ? JSON.stringify(body) : body}`);
      } else {
        logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
      }
    } catch (e) {
      logger.info(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
    }
    return oldSend.call(this, body);
  };

  next();
});

// Centralized error handler (standardized)
const errorHandler = require(__root + 'middleware/errorHandler');
app.use(errorHandler);

app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'controllers/AuthController');
app.use('/api/auth', AuthController);

// Audit log routes (admin/manager/employee)
const auditRoutes = require(__root + 'routes/auditRoutes');
app.use('/api/admin', auditRoutes.admin);
app.use('/api/manager', auditRoutes.manager);
app.use('/api/employee', auditRoutes.employee);

// Client-Viewer Access Control Middleware
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

const chatRoutes = require(__root + 'routes/chatRoutes');
app.use('/api/projects', chatRoutes);

const documentRoutes = require(__root + 'routes/documentRoutes');
app.use('/api/documents', documentRoutes);

// Workflow routes
const workflowRoutes = require(__root + 'workflow/workflowRoutes');
app.use('/api/workflow', workflowRoutes);

// Reports routes
const reportRoutes = require(__root + 'routes/reportRoutes');
app.use('/api/reports', reportRoutes);

// Backwards-compatible redirect: support callers hitting /projects (legacy)
// Redirect to /api/projects preserving method and query string (307 Temporary Redirect)
app.use('/projects', (req, res) => {
  return res.redirect(307, '/api/projects' + req.url);
});

// Backwards-compatible redirect: support callers hitting /documents (legacy)
// Redirect to /api/documents preserving method and query string (307 Temporary Redirect)
app.use('/documents', (req, res) => {
  return res.redirect(307, '/api/documents' + req.url);
});


module.exports = server;

// Graceful shutdown: close HTTP server and DB pool
function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  try {
    server.close(() => {
      logger.info('HTTP server closed.');
      try {
        const db = require('./db');
        if (db && typeof db.end === 'function') {
          db.end(() => {
            logger.info('DB pool closed. Exiting.');
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      } catch (e) {
        logger.error('Error during shutdown: ' + (e && e.message));
        process.exit(1);
      }
    });
    // Force exit after 10s
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  } catch (e) {
    logger.error('Shutdown failed: ' + (e && e.message));
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
