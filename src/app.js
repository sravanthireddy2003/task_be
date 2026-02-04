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

app.disable('x-powered-by');
app.use(helmet());
app.use(xss());
app.use(hpp());

const isDevelopment = process.env.NODE_ENV !== 'production';
const globalRateLimitConfig = isDevelopment
  ? { windowMs: 15 * 60 * 1000, max: 1000 } // More permissive for development
  : { windowMs: 15 * 60 * 1000, max: 200 }; // Stricter for production

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 10, // Allow more login attempts
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authRateLimit);
app.use(rateLimit(globalRateLimitConfig));

app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

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

  socket.on('join_project_chat', async (projectId) => {
    try {

      const hasAccess = await ChatService.validateProjectAccess(userId, projectId);

      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to this project chat' });
        return;
      }

      const chatRoom = await ChatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      socket.join(roomName);

      await ChatService.addParticipant(projectId, userId, userName, userRole);

      socket.to(roomName).emit('user_joined', {
        userId,
        userName,
        userRole,
        timestamp: new Date()
      });

      await ChatService.emitUserPresence(projectId, userName, 'joined');

      const onlineParticipants = await ChatService.getOnlineParticipants(projectId);
      socket.emit('online_participants', onlineParticipants);

      logger.info(`User ${userName} joined project chat: ${roomName}`);

    } catch (error) {
      logger.error('Error joining project chat:', error);
      socket.emit('error', { message: 'Failed to join project chat' });
    }
  });

  socket.on('leave_project_chat', async (projectId) => {
    try {
      const roomName = `project_${projectId}`;

      socket.leave(roomName);

      await ChatService.removeParticipant(projectId, userId);

      socket.to(roomName).emit('user_left', {
        userId,
        userName,
        timestamp: new Date()
      });

      await ChatService.emitUserPresence(projectId, userName, 'left');

      logger.info(`User ${userName} left project chat: ${roomName}`);

    } catch (error) {
      logger.error('Error leaving project chat:', error);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      const { projectId, message } = data;

      const hasAccess = await ChatService.validateProjectAccess(userId, projectId);
      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to send messages in this project' });
        return;
      }

      let messageType = 'text';
      let responseMessage = message;

      if (message.startsWith('/')) {

        const botResponse = await ChatService.handleChatbotCommand(projectId, message, userName, userId);

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

        const roomName = `project_${projectId}`;
        io.to(roomName).emit('chat_message', userMessage);
        io.to(roomName).emit('chat_message', botMessage);

        logger.info(`Bot command processed in ${roomName}: ${userName}`);
        return; // Don't send the original message
      }

      const savedMessage = await ChatService.saveMessage(
        projectId,
        userId,
        userName,
        responseMessage,
        messageType
      );

      const roomName = `project_${projectId}`;
      io.to(roomName).emit('chat_message', savedMessage);

      logger.info(`Message sent in ${roomName}: ${userName}`);

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

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

  socket.on('disconnect', async () => {
    logger.info(`User ${userName} disconnected`);

    const rooms = Array.from(socket.rooms).filter(room => room.startsWith('project_'));

    for (const roomName of rooms) {
      const projectId = roomName.replace('project_', '');

      try {
        await ChatService.removeParticipant(projectId, userId);

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

global.io = io;

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use((req, res, next) => {
  try {
    const ct = req.headers['content-type'] || '';
    if (ct.indexOf('text/x-vite-ping') === 0) {
      return res.status(200).send('pong');
    }
  } catch (e) {  }
  return next();
});
app.use(cors());




app.use('/uploads', async (req, res, next) => {
  try {
    // normalize double-encoded percent sequences
    if (req.url && req.url.indexOf('%25') !== -1) {
      let u = req.url;
      while (u.indexOf('%25') !== -1) u = u.replace(/%25/g, '%');
      req.url = u;
    }

    // Try to serve file directly by decoded path
    const candidateUploads = path.join(__dirname, '..', 'uploads');
    const decoded = decodeURIComponent(req.path || req.url || '');
    const rel = decoded.replace(/^\/+/, '');
    const physical = path.join(candidateUploads, rel);
    if (fs.existsSync(physical)) {
      return res.sendFile(physical);
    }

    // If file not present at that path, attempt to find a document record
    // matching either the original fileName or a filePath that ends with the requested name.
    try {
      const basename = path.basename(rel);
      const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
      // search by exact fileName
      let rows = await q('SELECT filePath FROM documents WHERE fileName = ? OR filePath LIKE ? LIMIT 1', [basename, '%'+basename]);
      if (rows && rows.length) {
        let p = rows[0].filePath || '';
        if (String(p).startsWith('/uploads/')) {
          const rel2 = p.replace(/^\/+uploads\/+/, '');
          const physical2 = path.join(candidateUploads, rel2);
          if (fs.existsSync(physical2)) return res.sendFile(physical2);
        }
      }
    } catch (e) {
      // ignore DB errors and fallthrough to static
    }
  } catch (e) {
    // swallow and let static handler try
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

const errorHandler = require(__root + 'middleware/errorHandler');
app.use(errorHandler);

app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'controllers/AuthController');
app.use('/api/auth', AuthController);

const auditRoutes = require(__root + 'routes/auditRoutes');
app.use('/api/admin', auditRoutes.admin);
app.use('/api/manager', auditRoutes.manager);
app.use('/api/employee', auditRoutes.employee);

const clientViewerAccessControl = require(__root + 'middleware/clientViewerAccess');

const StaffUser = require(__root + 'controllers/User');
app.use('/api/users', clientViewerAccessControl, StaffUser);

const tasksCRUD=require(__root + 'controllers/Tasks');
app.use('/api/tasks', clientViewerAccessControl, tasksCRUD);


const uploadCRUD=require(__root + 'controllers/Uploads');
app.use('/api/uploads',uploadCRUD);

const clientRoutes = require(__root + 'routes/clientRoutes');
app.use('/api/clients', clientRoutes);

const adminRoutes = require(__root + 'routes/adminRoutes');
app.use('/api/admin', adminRoutes);

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

const workflowRoutes = require(__root + 'workflow/workflowRoutes');
app.use('/api/workflow', workflowRoutes);

const reportRoutes = require(__root + 'routes/reportRoutes');
app.use('/api/reports', reportRoutes);


app.use('/projects', (req, res) => {
  return res.redirect(307, '/api/projects' + req.url);
});


app.use('/documents', (req, res) => {
  return res.redirect(307, '/api/documents' + req.url);
});


module.exports = server;

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
