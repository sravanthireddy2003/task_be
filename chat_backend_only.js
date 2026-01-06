const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { requireRole } = require('./middleware/roles');

class ChatService {
  constructor() {
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  // Database query helper
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  // Validate user access to project
  async validateProjectAccess(userId, projectId) {
    try {
      // Check if user is assigned to the project
      const userProjects = await this.query(
        `SELECT DISTINCT p.id, p.project_name
         FROM projects p
         INNER JOIN tasks t ON p.id = t.project_id
         WHERE t.assigned_to = ? OR p.created_by = ?
         UNION
         SELECT p.id, p.project_name
         FROM projects p
         WHERE p.created_by = ?`,
        [userId, userId, userId]
      );

      return userProjects.some(project => project.id === projectId);
    } catch (error) {
      console.error('Error validating project access:', error);
      return false;
    }
  }

  // Create or get project chat room
  async getOrCreateProjectChat(projectId) {
    try {
      let chatRoom = await this.query(
        'SELECT * FROM project_chats WHERE project_id = ?',
        [projectId]
      );

      if (chatRoom && chatRoom.length > 0) {
        return chatRoom[0];
      }

      const roomName = `project_${projectId}`;
      const result = await this.query(
        'INSERT INTO project_chats (project_id, room_name) VALUES (?, ?)',
        [projectId, roomName]
      );

      return {
        id: result.insertId,
        project_id: projectId,
        room_name: roomName,
        created_at: new Date()
      };
    } catch (error) {
      console.error('Error creating/getting project chat:', error);
      throw error;
    }
  }

  // Save message to database
  async saveMessage(projectId, senderId, senderName, message, messageType = 'text') {
    try {
      const result = await this.query(
        'INSERT INTO chat_messages (project_id, sender_id, sender_name, message, message_type) VALUES (?, ?, ?, ?, ?)',
        [projectId, senderId, senderName, message, messageType]
      );

      return {
        id: result.insertId,
        project_id: projectId,
        sender_id: senderId,
        sender_name: senderName,
        message: message,
        message_type: messageType,
        created_at: new Date()
      };
    } catch (error) {
      console.error('Error saving message:', error);
      throw error;
    }
  }

  // Get project messages with pagination
  async getProjectMessages(projectId, limit = 50, offset = 0) {
    try {
      const messages = await this.query(
        'SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [projectId, limit, offset]
      );

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error getting project messages:', error);
      throw error;
    }
  }

  // Add participant to chat
  async addParticipant(projectId, userId, userName, userRole) {
    try {
      await this.query(
        `INSERT INTO chat_participants (project_id, user_id, user_name, user_role, is_online)
         VALUES (?, ?, ?, ?, true)
         ON DUPLICATE KEY UPDATE
         user_name = VALUES(user_name),
         user_role = VALUES(user_role),
         is_online = true,
         last_seen = CURRENT_TIMESTAMP`,
        [projectId, userId, userName, userRole]
      );
    } catch (error) {
      console.error('Error adding participant:', error);
      throw error;
    }
  }

  // Remove participant from chat
  async removeParticipant(projectId, userId) {
    try {
      await this.query(
        'UPDATE chat_participants SET is_online = false, last_seen = CURRENT_TIMESTAMP WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );
    } catch (error) {
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  // Get online participants
  async getOnlineParticipants(projectId) {
    try {
      const participants = await this.query(
        'SELECT * FROM chat_participants WHERE project_id = ? AND is_online = true ORDER BY joined_at ASC',
        [projectId]
      );
      return participants;
    } catch (error) {
      console.error('Error getting online participants:', error);
      throw error;
    }
  }

  // Get chat statistics
  async getChatStats(projectId) {
    try {
      const [messageStats] = await this.query(
        `SELECT
          COUNT(*) as total_messages,
          COUNT(DISTINCT sender_id) as unique_senders,
          COUNT(CASE WHEN message_type = 'bot' THEN 1 END) as bot_messages,
          MAX(created_at) as last_message_time
         FROM chat_messages WHERE project_id = ?`,
        [projectId]
      );

      const onlineCount = await this.query(
        'SELECT COUNT(*) as count FROM chat_participants WHERE project_id = ? AND is_online = true',
        [projectId]
      );

      return {
        total_messages: messageStats.total_messages || 0,
        unique_senders: messageStats.unique_senders || 0,
        bot_messages: messageStats.bot_messages || 0,
        online_participants: onlineCount[0].count || 0,
        last_message_time: messageStats.last_message_time
      };
    } catch (error) {
      console.error('Error getting chat stats:', error);
      throw error;
    }
  }

  // Handle chatbot commands
  async handleChatbotCommand(projectId, command, userName) {
    try {
      let response = '';

      switch (command.toLowerCase()) {
        case '/help':
          response = `🤖 Available commands:
• /help - Show this help message
• /tasks - List your assigned tasks
• /status - Show project status
• /members - Show project members
• /online - Show online members
• /project - Show project details`;
          break;

        case '/tasks':
          // Get user's tasks for this project
          const tasks = await this.query(
            `SELECT t.task_name, t.status, t.priority
             FROM tasks t
             WHERE t.project_id = ? AND t.assigned_to = (SELECT _id FROM users WHERE name = ? LIMIT 1)`,
            [projectId, userName]
          );

          if (tasks.length === 0) {
            response = '🤖 You have no assigned tasks in this project.';
          } else {
            response = `🤖 Your assigned tasks:\n${tasks.map(task =>
              `• ${task.task_name} (${task.status}, ${task.priority} priority)`
            ).join('\n')}`;
          }
          break;

        case '/status':
          const stats = await this.getChatStats(projectId);
          response = `🤖 Project Chat Status:
• Total Messages: ${stats.total_messages}
• Active Participants: ${stats.unique_senders}
• Online Now: ${stats.online_participants}
• Bot Messages: ${stats.bot_messages}`;
          break;

        case '/members':
          const participants = await this.getOnlineParticipants(projectId);
          if (participants.length === 0) {
            response = '🤖 No members currently online.';
          } else {
            response = `🤖 Project Members (${participants.length} online):\n${participants.map(p =>
              `• ${p.user_name} (${p.user_role})`
            ).join('\n')}`;
          }
          break;

        case '/online':
          const online = await this.getOnlineParticipants(projectId);
          if (online.length === 0) {
            response = '🤖 No members currently online.';
          } else {
            response = `🤖 Currently Online (${online.length}):\n${online.map(p =>
              `• ${p.user_name} (${p.user_role})`
            ).join('\n')}`;
          }
          break;

        case '/project':
          const [project] = await this.query(
            'SELECT project_name, description, status FROM projects WHERE id = ?',
            [projectId]
          );
          if (project) {
            response = `🤖 Project Information:
• Name: ${project.project_name}
• Status: ${project.status}
• Description: ${project.description || 'No description available'}`;
          } else {
            response = '🤖 Project information not found.';
          }
          break;

        default:
          response = `🤖 Unknown command: ${command}. Type /help for available commands.`;
      }

      return response;
    } catch (error) {
      console.error('Error handling chatbot command:', error);
      return '🤖 Sorry, I encountered an error processing your command.';
    }
  }
}

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize ChatService
const chatService = new ChatService();
chatService.setSocketIO(io);

// Middleware
app.use(express.json());

// Socket.IO authentication and event handling
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
  const userId = socket.user._id;
  const userName = socket.user.name || 'Unknown User';
  const userRole = socket.user.role || 'Employee';

  console.log(`User ${userName} (${userId}) connected`);

  // Join user-specific room for private messages
  socket.join(`user_${userId}`);

  // Handle joining project chat
  socket.on('join_project_chat', async (projectId) => {
    try {
      const hasAccess = await chatService.validateProjectAccess(userId, projectId);
      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to this project chat' });
        return;
      }

      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      // Add user to participants
      await chatService.addParticipant(projectId, userId, userName, userRole);

      // Join the room
      socket.join(roomName);

      // Notify others in the room
      socket.to(roomName).emit('user_joined', {
        userId,
        userName,
        userRole,
        timestamp: new Date()
      });

      // Send current online participants
      const onlineParticipants = await chatService.getOnlineParticipants(projectId);
      socket.emit('online_participants', onlineParticipants);

      console.log(`User ${userName} joined project chat: ${projectId}`);

    } catch (error) {
      console.error('Error joining project chat:', error);
      socket.emit('error', { message: 'Failed to join project chat' });
    }
  });

  // Handle leaving project chat
  socket.on('leave_project_chat', async (projectId) => {
    try {
      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      // Remove from participants
      await chatService.removeParticipant(projectId, userId);

      // Leave the room
      socket.leave(roomName);

      // Notify others
      socket.to(roomName).emit('user_left', {
        userId,
        userName,
        timestamp: new Date()
      });

      console.log(`User ${userName} left project chat: ${projectId}`);

    } catch (error) {
      console.error('Error leaving project chat:', error);
    }
  });

  // Handle sending messages
  socket.on('send_message', async (data) => {
    try {
      const { projectId, message } = data;

      if (!message || message.trim() === '') {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      const hasAccess = await chatService.validateProjectAccess(userId, projectId);
      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to send messages in this project' });
        return;
      }

      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      // Save message to database
      const savedMessage = await chatService.saveMessage(projectId, userId, userName, message.trim());

      // Broadcast to room
      io.to(roomName).emit('chat_message', savedMessage);

      console.log(`Message sent in ${projectId} by ${userName}: ${message}`);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', async (projectId) => {
    try {
      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      socket.to(roomName).emit('user_typing', {
        userId,
        userName,
        isTyping: true
      });
    } catch (error) {
      console.error('Error handling typing start:', error);
    }
  });

  socket.on('typing_stop', async (projectId) => {
    try {
      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      socket.to(roomName).emit('user_typing', {
        userId,
        userName,
        isTyping: false
      });
    } catch (error) {
      console.error('Error handling typing stop:', error);
    }
  });

  // Handle chatbot commands
  socket.on('chatbot_command', async (data) => {
    try {
      const { projectId, command } = data;

      const hasAccess = await chatService.validateProjectAccess(userId, projectId);
      if (!hasAccess) {
        socket.emit('error', { message: 'You do not have access to this project' });
        return;
      }

      const response = await chatService.handleChatbotCommand(projectId, command, userName);

      const chatRoom = await chatService.getOrCreateProjectChat(projectId);
      const roomName = chatRoom.room_name;

      // Save bot response
      const botMessage = await chatService.saveMessage(projectId, 0, 'ChatBot', response, 'bot');

      // Broadcast bot response
      io.to(roomName).emit('chat_message', botMessage);

    } catch (error) {
      console.error('Error handling chatbot command:', error);
      socket.emit('error', { message: 'Failed to process command' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User ${userName} (${userId}) disconnected`);

    // Update online status for all projects they were in
    try {
      // This is a simplified approach - in production you'd track which projects each socket is in
      await db.query(
        'UPDATE chat_participants SET is_online = false, last_seen = CURRENT_TIMESTAMP WHERE user_id = ?',
        [userId]
      );
    } catch (error) {
      console.error('Error updating participant status on disconnect:', error);
    }
  });
});

// REST API Routes

// Get chat messages
app.get('/api/projects/:projectId/chat/messages', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const hasAccess = await chatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }

    const messages = await chatService.getProjectMessages(projectId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: messages,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Error getting chat messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat messages'
    });
  }
});

// Send message via REST
app.post('/api/projects/:projectId/chat/messages', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }

    const hasAccess = await chatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to send messages in this project'
      });
    }

    const savedMessage = await chatService.saveMessage(
      projectId,
      req.user._id,
      req.user.name,
      message.trim()
    );

    // Broadcast via Socket.IO
    const chatRoom = await chatService.getOrCreateProjectChat(projectId);
    io.to(chatRoom.room_name).emit('chat_message', savedMessage);

    res.status(201).json({
      success: true,
      data: savedMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// Get online participants
app.get('/api/projects/:projectId/chat/participants', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;

    const hasAccess = await chatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }

    const participants = await chatService.getOnlineParticipants(projectId);

    res.json({
      success: true,
      data: participants,
      online_count: participants.length
    });

  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve participants'
    });
  }
});

// Get chat statistics
app.get('/api/projects/:projectId/chat/stats', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;

    const hasAccess = await chatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }

    const stats = await chatService.getChatStats(projectId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting chat stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat statistics'
    });
  }
});

// Delete message (Admin only or message owner)
app.delete('/api/projects/:projectId/chat/messages/:messageId', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId, messageId } = req.params;

    // Check if user owns the message or is admin
    const [message] = await db.query(
      'SELECT sender_id FROM chat_messages WHERE id = ? AND project_id = ?',
      [messageId, projectId]
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    if (message.sender_id !== req.user._id && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own messages or you need admin privileges'
      });
    }

    await db.query('DELETE FROM chat_messages WHERE id = ?', [messageId]);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
});

module.exports = { app, server, chatService };