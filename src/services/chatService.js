const db = require('../db');
const NotificationService = require('./notificationService');

class ChatService {
  constructor() {
    this.io = global.io;
  }

  // Helper function for database queries
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  // Create or get project chat room
  async getOrCreateProjectChat(projectId) {
    try {
      // Check if chat room already exists
      let chatRoom = await this.query(
        'SELECT * FROM project_chats WHERE project_id = ?',
        [projectId]
      );

      if (chatRoom && chatRoom.length > 0) {
        return chatRoom[0];
      }

      // Create new chat room
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

  // Validate user can access project chat
  async validateProjectAccess(userId, projectId) {
    try {
      // First, get user role
      const userResult = await this.query(
        'SELECT role FROM users WHERE _id = ?',
        [userId]
      );

      if (!userResult || userResult.length === 0) {
        return false;
      }

      const userRole = userResult[0].role;

      // Get the internal project ID from public_id
      const projectResult = await this.query(
        'SELECT id FROM projects WHERE public_id = ?',
        [projectId]
      );

      if (!projectResult || projectResult.length === 0) {
        return false;
      }

      const internalProjectId = projectResult[0].id;

      // Admin can access all projects
      if (userRole === 'Admin') {
        return true;
      }

      // Check if user is assigned to the project (for Managers and Employees)
      const userInProject = await this.query(`
        SELECT COUNT(*) as count FROM taskassignments ta
        JOIN tasks t ON ta.task_id = t.id
        WHERE ta.user_id = ? AND t.project_id = ?
      `, [userId, internalProjectId]);

      if (userInProject[0].count > 0) {
        return true;
      }

      // Check if user is project manager
      const isManager = await this.query(`
        SELECT COUNT(*) as count FROM projects
        WHERE id = ? AND project_manager_id = ?
      `, [internalProjectId, userId]);

      if (isManager[0].count > 0) {
        return true;
      }

      // Check if user created the project
      const isCreator = await this.query(`
        SELECT COUNT(*) as count FROM projects
        WHERE id = ? AND created_by = ?
      `, [internalProjectId, userId]);

      if (isCreator[0].count > 0) {
        return true;
      }

      // For Managers, check if they have access to the department of this project
      if (userRole === 'Manager') {
        const deptAccess = await this.query(`
          SELECT COUNT(*) as count FROM project_departments pd
          JOIN user_departments ud ON pd.department_id = ud.department_id
          WHERE pd.project_id = ? AND ud.user_id = ?
        `, [internalProjectId, userId]);

        if (deptAccess[0].count > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error validating project access:', error);
      return false;
    }
  }

  // Save message to database
  async saveMessage(projectId, senderId, senderName, message, messageType = 'text') {
    try {
      const result = await this.query(
        'INSERT INTO chat_messages (project_id, sender_id, sender_name, message, message_type) VALUES (?, ?, ?, ?, ?)',
        [projectId, senderId, senderName, message, messageType]
      );

      // Get the public_id for the sender (skip for system/bot messages)
      let senderPublicId = senderId;
      let senderRole = null;
      
      if (senderId !== 0) {
        const userResult = await this.query('SELECT public_id, role FROM users WHERE _id = ?', [senderId]);
        if (userResult.length > 0) {
          senderPublicId = userResult[0].public_id;
          senderRole = userResult[0].role;
        }
      }

      // After saving message, detect mentions and send notifications
      try {
        if (typeof message === 'string' && message.indexOf('@') !== -1) {
          const mentionRegex = /@([A-Za-z0-9_\-\.]+)/g;
          const mentions = [];
          let m;
          while ((m = mentionRegex.exec(message)) !== null) {
            mentions.push(m[1]);
          }

          const notifyUserIds = new Set();

          if (mentions.length > 0) {
            const lowerMentions = mentions.map(s => String(s).toLowerCase());

            // If includes everyone mention
            if (lowerMentions.includes('everyone') || lowerMentions.includes('all')) {
              // Notify all project members (exclude sender)
              const members = await this.getAllProjectMembers(projectId);
              members.forEach(u => {
                if (u.user_id && u.user_id !== senderId) notifyUserIds.add(u.user_id);
              });
            } else {
              // Resolve individual mentions by public_id only
              for (const raw of mentions) {
                const pid = raw.trim();
                if (!pid) continue;
                const rows = await this.query(
                  'SELECT _id FROM users WHERE public_id = ? LIMIT 1',
                  [pid]
                );
                if (rows && rows.length > 0) {
                  if (rows[0]._id !== senderId) notifyUserIds.add(rows[0]._id);
                }
              }
            }

            if (notifyUserIds.size > 0) {
              const userIdArray = Array.from(notifyUserIds);
              const excerpt = message.length > 200 ? message.slice(0, 197) + '...' : message;
              const title = `${senderName} mentioned you`;
              const body = `${senderName} mentioned you in project chat: "${excerpt}"`;
              // Create and send notifications (entity_type chat_message)
              await NotificationService.createAndSend(userIdArray, title, body, 'mention', 'chat_message', result.insertId);
            }
          }
        }
      } catch (notifErr) {
        console.error('Error sending mention notifications:', notifErr);
      }

      return {
        id: result.insertId,
        project_id: projectId,
        sender_id: senderPublicId,
        sender_name: senderName,
        message,
        message_type: messageType,
        sender_role: senderRole,
        created_at: new Date()
      };
    } catch (error) {
      console.error('Error saving message:', error);
      throw error;
    }
  }

  // Get chat messages for a project
  async getProjectMessages(projectId, limit = 50, offset = 0) {
    try {
      const messages = await this.query(`
        SELECT
          cm.id,
          cm.project_id,
          COALESCE(u.public_id, cm.sender_id) as sender_id,
          cm.sender_name,
          cm.message,
          cm.message_type,
          cm.created_at,
          COALESCE(u.role, CASE 
            WHEN cm.sender_id = 0 THEN 'System' 
            ELSE 'Unknown' 
          END) as sender_role
        FROM chat_messages cm
        LEFT JOIN users u ON cm.sender_id = u._id AND cm.sender_id != 0
        WHERE cm.project_id = ?
        ORDER BY cm.created_at DESC
        LIMIT ? OFFSET ?
      `, [projectId, limit, offset]);

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      console.error('Error getting project messages:', error);
      throw error;
    }
  }

  // Add user to chat participants
  async addParticipant(projectId, userId, userName, userRole) {
    try {
      await this.query(`
        INSERT INTO chat_participants (project_id, user_id, user_name, user_role, is_online)
        VALUES (?, ?, ?, ?, true)
        ON DUPLICATE KEY UPDATE
        user_name = VALUES(user_name),
        user_role = VALUES(user_role),
        is_online = true,
        last_seen = CURRENT_TIMESTAMP
      `, [projectId, userId, userName, userRole]);
    } catch (error) {
      console.error('Error adding participant:', error);
      throw error;
    }
  }

  // Remove user from chat participants (set offline)
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

  // Get online participants for a project
  async getOnlineParticipants(projectId) {
    try {
      const participants = await this.query(
        'SELECT user_id, user_name, user_role, last_seen FROM chat_participants WHERE project_id = ? AND is_online = true',
        [projectId]
      );
      return participants;
    } catch (error) {
      console.error('Error getting online participants:', error);
      throw error;
    }
  }

  // Get all project members (users with access to the project)
  async getAllProjectMembers(projectId) {
    try {
      // Get the internal project ID from public_id
      const projectResult = await this.query(
        'SELECT id FROM projects WHERE public_id = ?',
        [projectId]
      );

      if (!projectResult || projectResult.length === 0) {
        return [];
      }

      const internalProjectId = projectResult[0].id;

      // Get all users assigned to tasks in this project
      const taskUsers = await this.query(`
        SELECT DISTINCT
          u._id as user_id,
          u.name as user_name,
          u.role as user_role,
          u.public_id,
          u.is_online,
          u.is_active
        FROM users u
        JOIN taskassignments ta ON u._id = ta.user_id
        JOIN tasks t ON ta.task_id = t.id
        WHERE t.project_id = ?
      `, [internalProjectId]);

      // Get project manager
      const projectManager = await this.query(`
        SELECT
          u._id as user_id,
          u.name as user_name,
          u.role as user_role,
          u.public_id,
          u.is_online,
          u.is_active
        FROM users u
        JOIN projects p ON u._id = p.project_manager_id
        WHERE p.id = ?
      `, [internalProjectId]);

      // Get project creator
      const projectCreator = await this.query(`
        SELECT
          u._id as user_id,
          u.name as user_name,
          u.role as user_role,
          u.public_id,
          u.is_online,
          u.is_active
        FROM users u
        JOIN projects p ON u._id = p.created_by
        WHERE p.id = ?
      `, [internalProjectId]);

      // Combine all users and remove duplicates
      const allUsers = [...taskUsers, ...projectManager, ...projectCreator];
      const uniqueUsers = allUsers.filter((user, index, self) =>
        index === self.findIndex(u => u.user_id === user.user_id)
      );

      return uniqueUsers;
    } catch (error) {
      console.error('Error getting all project members:', error);
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

      // Get total project members instead of just online participants
      const allMembers = await this.getAllProjectMembers(projectId);
      const totalMembers = allMembers.length;

      // Also get online count for reference
      const onlineCount = await this.query(
        'SELECT COUNT(*) as count FROM chat_participants WHERE project_id = ? AND is_online = true',
        [projectId]
      );

      return {
        total_messages: messageStats.total_messages || 0,
        unique_senders: messageStats.unique_senders || 0,
        bot_messages: messageStats.bot_messages || 0,
        total_participants: totalMembers,
        online_participants: onlineCount[0].count || 0,
        last_message_time: messageStats.last_message_time
      };
    } catch (error) {
      console.error('Error getting chat stats:', error);
      throw error;
    }
  }
  // Handle chatbot commands
  async handleChatbotCommand(projectId, command, userName, userId) {
    try {
      // Convert public_id to internal project id
      const projectResult = await this.query(
        'SELECT id FROM projects WHERE public_id = ?',
        [projectId]
      );

      if (!projectResult || projectResult.length === 0) {
        return 'Project not found.';
      }

      const internalProjectId = projectResult[0].id;

      // Convert userId to internal ID if it's a public_id
      let internalUserId = userId;
      let userRole = null;
      if (typeof userId === 'string' && !/^\d+$/.test(userId)) {
        // userId is a public_id string; map to internal id and role
        const userResult = await this.query('SELECT _id, role FROM users WHERE public_id = ?', [userId]);
        console.log('ChatService: userResult for public_id', userId, userResult && userResult.length ? userResult[0] : userResult);
        if (userResult && userResult.length > 0) {
          internalUserId = userResult[0]._id;
          userRole = userResult[0].role;
          console.log('ChatService: mapped internalUserId=', internalUserId, 'userRole=', userRole);
        } else {
          console.warn('ChatService: user not found for public_id', userId);
          return 'User not found.';
        }
      } else {
        // userId appears to be internal numeric id; fetch role
        try {
          const roleRes = await this.query('SELECT role FROM users WHERE _id = ?', [internalUserId]);
          if (roleRes && roleRes.length > 0) {
            userRole = roleRes[0].role;
            console.log('ChatService: resolved role for internal id', internalUserId, 'role=', userRole);
          }
        } catch (e) {
          console.warn('ChatService: failed to resolve role for internal id', internalUserId, e);
        }
      }

      let response = '';

      switch (command.toLowerCase()) {
        case '/help':
          response = `Available commands:
/help - Show this help message
/tasks - List your assigned tasks in this project
/status - Show project status
/members - Show all project members
/online - Show currently online members`;
          break;

        case '/tasks':
          try {
            console.log(`Checking role for /tasks: '${userRole}'`); // Added for debugging
            if (userRole && (userRole.toLowerCase().trim() === 'admin' || userRole.toLowerCase().trim() === 'manager')) {
              // Get all tasks in this project
              const allTasks = await this.query(`
                SELECT title, description, status, priority, taskDate
                FROM tasks
                WHERE project_id = ?
                ORDER BY id DESC
                LIMIT 10
              `, [internalProjectId]);

              if (allTasks.length === 0) {
                response = 'No tasks in this project.';
              } else {
                response = `All tasks in this project (${allTasks.length}):\n` +
                  allTasks.map(task =>
                    `• ${task.title}\n  Description: ${task.description || 'N/A'}\n  Status: ${task.status}, Priority: ${task.priority}\n  Due: ${task.taskDate ? new Date(task.taskDate).toLocaleDateString() : 'N/A'}`
                  ).join('\n\n');
              }
            } else {
              // Get user's assigned tasks for this project using taskassignments table
              const userTasks = await this.query(`
                SELECT t.title, t.status, t.priority
                FROM tasks t
                JOIN taskassignments ta ON t.id = ta.task_id
                WHERE ta.user_id = ?
                AND t.project_id = ?
                ORDER BY t.id DESC
                LIMIT 10
              `, [internalUserId, internalProjectId]);

              if (userTasks.length === 0) {
                response = 'You have no assigned tasks in this project.';
              } else {
                response = `Your assigned tasks (${userTasks.length}):\n` +
                  userTasks.map(task =>
                    `• ${task.title}\n  Status: ${task.status}, Priority: ${task.priority}`
                  ).join('\n\n');
              }
            }
          } catch (queryError) {
            console.error('Database query error in /tasks:', queryError);
            response = 'Sorry, I encountered an error processing your command.';
          }
          break;

        case '/status':
          // Get project status
          const projectInfo = await this.query(`
            SELECT
              COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_tasks,
              COUNT(*) as total_tasks
            FROM tasks
            WHERE project_id = ?
          `, [projectId]);

          const { completed_tasks, total_tasks } = projectInfo[0];
          const completionRate = total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0;

          response = `Project Status:
• Total Tasks: ${total_tasks}
• Completed: ${completed_tasks}
• Completion Rate: ${completionRate}%`;
          break;

        case '/members':
          // Get all project members using the existing method
          const allMembers = await this.getAllProjectMembers(projectId);
          if (allMembers.length === 0) {
            response = 'No members found in this project.';
          } else {
            response = `Project Members (${allMembers.length}):\n` +
              allMembers.map(member => `• ${member.user_name} (${member.user_role})`).join('\n');
          }
          break;

        case '/online':
          // Get online members
          const onlineMembers = await this.getOnlineParticipants(projectId);
          if (onlineMembers.length === 0) {
            response = 'No members are currently online.';
          } else {
            response = 'Online Members:\n' +
              onlineMembers.map(member => `• ${member.user_name} (${member.user_role})`).join('\n');
          }
          break;

        default:
          response = `Unknown command: ${command}. Type /help for available commands.`;
      }

      return response;
    } catch (error) {
      console.error('Error handling chatbot command:', error);
      return 'Sorry, I encountered an error processing your command.';
    }
  }

  // Send system message
  async sendSystemMessage(projectId, message) {
    try {
      const savedMessage = await this.saveMessage(projectId, 0, 'System', message, 'system');

      // Emit to project room
      if (this.io) {
        this.io.to(`project_${projectId}`).emit('chat_message', savedMessage);
      }

      return savedMessage;
    } catch (error) {
      console.error('Error sending system message:', error);
      throw error;
    }
  }

  // Send bot message
  async sendBotMessage(projectId, message) {
    try {
      const savedMessage = await this.saveMessage(projectId, 0, 'ChatBot', message, 'bot');

      // Emit to project room
      if (this.io) {
        this.io.to(`project_${projectId}`).emit('chat_message', savedMessage);
      }

      return savedMessage;
    } catch (error) {
      console.error('Error sending bot message:', error);
      throw error;
    }
  }

  // Emit user joined/left messages
  async emitUserPresence(projectId, userName, action) {
    const message = action === 'joined'
      ? `${userName} joined the project chat`
      : `${userName} left the project chat`;

    await this.sendSystemMessage(projectId, message);
  }
}

module.exports = new ChatService();