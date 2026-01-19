// const express = require('express');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// const http = require('http');
// const socketIo = require('socket.io');
// const jwt = require('jsonwebtoken');
// require('dotenv').config()
// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server, {
//   cors: {
//     origin: "*", // Adjust for production
//     methods: ["GET", "POST", "PUT", "DELETE"]
//   }
// });
// const db = require('./db');
// const ChatService = require('./services/chatService');
// const path = require('path');
// const fs = require('fs');

// global.__root = __dirname + '/';

// // Socket.IO authentication and room joining
// io.use((socket, next) => {
//   const token = socket.handshake.auth.token;
//   if (!token) {
//     return next(new Error('Authentication error'));
//   }
//   try {
//     const decoded = jwt.verify(token, process.env.SECRET || 'secret');
//     socket.user = decoded;
//     next();
//   } catch (err) {
//     next(new Error('Authentication error'));
//   }
// });

// io.on('connection', async (socket) => {
//   try {
//     // Get internal user ID from public_id
//     const userResult = await new Promise((resolve, reject) => {
//       db.query('SELECT _id, name, role FROM users WHERE public_id = ? LIMIT 1', [socket.user.id], (err, rows) => {
//         if (err) reject(err);
//         else resolve(rows);
//       });
//     });

//     if (!userResult || userResult.length === 0) {
//       socket.emit('error', { message: 'User not found' });
//       socket.disconnect();
//       return;
//     }

//     const userId = userResult[0]._id; // Internal ID
//     const userName = userResult[0].name || 'Unknown User';
//     const userRole = userResult[0].role || 'Employee';

//   console.log(`User ${userName} (${userId}) connected`);

//   // Join user's personal room for notifications
//   socket.join(`user_${userId}`);

//   // Handle joining project chat room
//   socket.on('join_project_chat', async (projectId) => {
//     try {
//       // Validate user has access to this project
//       const hasAccess = await ChatService.validateProjectAccess(userId, projectId);

//       if (!hasAccess) {
//         socket.emit('error', { message: 'You do not have access to this project chat' });
//         return;
//       }

//       // Create/get project chat room
//       const chatRoom = await ChatService.getOrCreateProjectChat(projectId);
//       const roomName = chatRoom.room_name;

//       // Join the project room
//       socket.join(roomName);

//       // Add user to participants
//       await ChatService.addParticipant(projectId, userId, userName, userRole);

//       // Notify others in the room
//       socket.to(roomName).emit('user_joined', {
//         userId,
//         userName,
//         userRole,
//         timestamp: new Date()
//       });

//       // Send system message
//       await ChatService.emitUserPresence(projectId, userName, 'joined');

//       // Send online participants list
//       const onlineParticipants = await ChatService.getOnlineParticipants(projectId);
//       socket.emit('online_participants', onlineParticipants);

//       console.log(`User ${userName} joined project chat: ${roomName}`);

//     } catch (error) {
//       console.error('Error joining project chat:', error);
//       socket.emit('error', { message: 'Failed to join project chat' });
//     }
//   });

//   // Handle leaving project chat room
//   socket.on('leave_project_chat', async (projectId) => {
//     try {
//       const roomName = `project_${projectId}`;

//       // Leave the room
//       socket.leave(roomName);

//       // Update participant status
//       await ChatService.removeParticipant(projectId, userId);

//       // Notify others
//       socket.to(roomName).emit('user_left', {
//         userId,
//         userName,
//         timestamp: new Date()
//       });

//       // Send system message
//       await ChatService.emitUserPresence(projectId, userName, 'left');

//       console.log(`User ${userName} left project chat: ${roomName}`);

//     } catch (error) {
//       console.error('Error leaving project chat:', error);
//     }
//   });

//   // Handle chat messages
//   socket.on('send_message', async (data) => {
//     try {
//       const { projectId, message } = data;

//       // Validate access
//       const hasAccess = await ChatService.validateProjectAccess(userId, projectId);
//       if (!hasAccess) {
//         socket.emit('error', { message: 'You do not have access to send messages in this project' });
//         return;
//       }

//       let messageType = 'text';
//       let responseMessage = message;

//       // Check if it's a bot command
//       if (message.startsWith('/')) {
//         // Handle bot command - send response as a separate bot message
//         const botResponse = await ChatService.handleChatbotCommand(projectId, message, userName, userId);

//         // Save the bot response message
//         const botMessage = await ChatService.saveMessage(
//           projectId,
//           0, // System user ID for bot
//           'ChatBot',
//           botResponse,
//           'bot'
//         );

//         // Also save the user's command message for history
//         const userMessage = await ChatService.saveMessage(
//           projectId,
//           userId,
//           userName,
//           message,
//           'text'
//         );

//         // Emit both messages
//         const roomName = `project_${projectId}`;
//         io.to(roomName).emit('chat_message', userMessage);
//         io.to(roomName).emit('chat_message', botMessage);

//         console.log(`Bot command processed in ${roomName}: ${userName}: ${message}`);
//         return; // Don't send the original message
//       }

//       // Save regular message to database
//       const savedMessage = await ChatService.saveMessage(
//         projectId,
//         userId,
//         userName,
//         responseMessage,
//         messageType
//       );

//       // Emit to project room
//       const roomName = `project_${projectId}`;
//       io.to(roomName).emit('chat_message', savedMessage);

//       console.log(`Message sent in ${roomName}: ${userName}: ${message}`);

//     } catch (error) {
//       console.error('Error sending message:', error);
//       socket.emit('error', { message: 'Failed to send message' });
//     }
//   });

//   // Handle typing indicators
//   socket.on('typing_start', (projectId) => {
//     const roomName = `project_${projectId}`;
//     socket.to(roomName).emit('user_typing', {
//       userId,
//       userName,
//       isTyping: true
//     });
//   });

//   socket.on('typing_stop', (projectId) => {
//     const roomName = `project_${projectId}`;
//     socket.to(roomName).emit('user_typing', {
//       userId,
//       userName,
//       isTyping: false
//     });
//   });

//   // Handle disconnect
//   socket.on('disconnect', async () => {
//     console.log(`User ${userName} disconnected`);

//     // Find all project rooms this user was in and update their status
//     const rooms = Array.from(socket.rooms).filter(room => room.startsWith('project_'));

//     for (const roomName of rooms) {
//       const projectId = roomName.replace('project_', '');

//       try {
//         await ChatService.removeParticipant(projectId, userId);

//         // Notify others in the room
//         socket.to(roomName).emit('user_left', {
//           userId,
//           userName,
//           timestamp: new Date()
//         });

//       } catch (error) {
//         console.error('Error updating participant status on disconnect:', error);
//       }
//     }
//   });

//   } catch (error) {
//     console.error('Error in socket connection:', error);
//     socket.emit('error', { message: 'Connection failed' });
//     socket.disconnect();
//   }
// });

// // Make io available globally
// global.io = io;

// app.use(bodyParser.urlencoded({ extended: false }))
// app.use(bodyParser.json())
// app.use(cors());
// // Note: rule engine is applied per-route where needed to avoid protecting public endpoints like /api/auth/login
// // Serve uploads from project root `uploads` directory (not src/uploads)
// app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// // Ensure uploads directory exists so static serving won't 404 for newly saved files
// try {
//   const uploadsDir = path.join(__dirname, '..', 'uploads');
//   if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
//   const profilesDir = path.join(uploadsDir, 'profiles');
//   if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
// } catch (e) {
//   console.warn('Failed to ensure uploads directory exists:', e && e.message);
// }
// // Global response logger: logs outgoing response bodies for each request
// app.use((req, res, next) => {
//   const oldJson = res.json;
//   const oldSend = res.send;

//   res.json = function (body) {
//     try {
//       console.log(`[RESPONSE] ${req.method} ${req.originalUrl} ->`, typeof body === 'object' ? JSON.stringify(body) : body);
//     } catch (e) {
//       console.log(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
//     }
//     return oldJson.call(this, body);
//   };

//   res.send = function (body) {
//     try {
//       console.log(`[RESPONSE] ${req.method} ${req.originalUrl} ->`, typeof body === 'object' ? JSON.stringify(body) : body);
//     } catch (e) {
//       console.log(`[RESPONSE] ${req.method} ${req.originalUrl} -> [unserializable body]`);
//     }
//     return oldSend.call(this, body);
//   };

//   next();
// });

// // Error handler: log uncaught errors and forward a 500 response
// app.use((err, req, res, next) => {
//   try {
//     console.error('[UNCAUGHT ERROR]', err && err.stack ? err.stack : err);
//   } catch (e) {
//     console.error('[UNCAUGHT ERROR] (failed to print stack)', err);
//   }
//   if (!res.headersSent) {
//     res.status(500).json({ error: 'Internal server error' });
//   } else {
//     next(err);
//   }
// });

// app.get('/api', function (req, res) {
//   res.status(200).send('API working...');
// });

// const AuthController = require(__root + 'controllers/AuthController');
// app.use('/api/auth', AuthController);

// // Client-Viewer Access Control Middleware
// // Enforces read-only access and endpoint restrictions for Client-Viewer users
// const clientViewerAccessControl = require(__root + 'middleware/clientViewerAccess');

// const StaffUser = require(__root + 'controllers/User');
// app.use('/api/users', clientViewerAccessControl, StaffUser);

// const tasksCRUD=require(__root + 'controllers/Tasks');
// app.use('/api/tasks', clientViewerAccessControl, tasksCRUD);


// const uploadCRUD=require(__root + 'controllers/Uploads');
// app.use('/api/uploads',uploadCRUD);

// const clientRoutes = require(__root + 'routes/clientRoutes');
// app.use('/api/clients', clientRoutes);

// // Admin routes (modules, departments, projects, tasks overview)
// const adminRoutes = require(__root + 'routes/adminRoutes');
// app.use('/api/admin', adminRoutes);

// // Project Management Routes (department-wise projects, tasks, subtasks)
// const projectRoutes = require(__root + 'routes/projectRoutes');
// app.use('/api/projects', projectRoutes);

// const managerRoutes = require(__root + 'routes/managerRoutes');
// app.use('/api/manager', managerRoutes);

// const employeeRoutes = require(__root + 'routes/employeeRoutes');
// app.use('/api/employee', employeeRoutes);

// const notificationRoutes = require(__root + 'routes/notificationRoutes');
// app.use('/api/notifications', notificationRoutes);

// const chatRoutes = require(__root + 'routes/chatRoutes');
// app.use('/api/projects', chatRoutes);

// const documentRoutes = require(__root + 'routes/documentRoutes');
// app.use('/api/documents', documentRoutes);


// module.exports = server;


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
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});
const db = require('./db');
const ChatService = require('./services/chatService');
const path = require('path');
const fs = require('fs');

global.__root = __dirname + '/';

// Socket.IO authentication and room joining (UNCHANGED)
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

// ... (keep all your existing socket.io code unchanged until middleware section) ...

// ✅ FIXED: MIDDLEWARE SECTION - REPLACE LINES ~113-121
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
<<<<<<< HEAD

// ✅ FIXED: Static files from src/uploads/
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ FIXED: Create src/uploads/ directory
try {
  const uploadsDir = path.join(__dirname, 'uploads');
=======
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

// Ensure uploads directory exists so static serving won't 404 for newly saved files
try {
  const uploadsDir = path.join(__dirname, '..', 'uploads');

>>>>>>> origin/feature/doc-upload-memory-storage
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const profilesDir = path.join(uploadsDir, 'profiles');
  if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
  console.log('✅ Uploads directory ready:', uploadsDir);
} catch (e) {
  console.warn('Failed to ensure uploads directory exists:', e && e.message);
}

// Global response logger (KEEP EXISTING)
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

// Error handler (KEEP EXISTING)
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

// Routes (KEEP ALL EXISTING)
app.get('/api', function (req, res) {
  res.status(200).send('API working...');
});

const AuthController = require(__root + 'controllers/AuthController');
app.use('/api/auth', AuthController);

<<<<<<< HEAD
=======
// Audit log routes (admin/manager/employee)
const auditRoutes = require(__root + 'routes/auditRoutes');
app.use('/api/admin', auditRoutes.admin);
app.use('/api/manager', auditRoutes.manager);
app.use('/api/employee', auditRoutes.employee);

// Client-Viewer Access Control Middleware
// Enforces read-only access and endpoint restrictions for Client-Viewer users
>>>>>>> origin/feature/doc-upload-memory-storage
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

<<<<<<< HEAD
=======
// Reports routes
const reportRoutes = require(__root + 'routes/reportRoutes');
app.use('/api/reports', reportRoutes);


>>>>>>> origin/feature/doc-upload-memory-storage
module.exports = server;
