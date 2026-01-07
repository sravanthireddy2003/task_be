const express = require('express');
const router = express.Router();
const ChatService = require('../services/chatService');
const { requireRole } = require('../middleware/roles');
 
// Helper function for database queries
const q = (sql, params = []) => new Promise((resolve, reject) => {
  const db = require('../db');
  db.query(sql, params, (err, results) => {
    if (err) reject(err);
    else resolve(results);
  });
});
 
// GET /api/projects/:projectId/chat/messages - Get chat messages for a project
router.get('/:projectId/chat/messages', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
 
    // Validate user has access to this project
    const hasAccess = await ChatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }
 
    // Get messages
    const messages = await ChatService.getProjectMessages(projectId, parseInt(limit), parseInt(offset));
 
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
 
// GET /api/projects/:projectId/chat/participants - Get all project members
router.get('/:projectId/chat/participants', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
 
    // Validate user has access to this project
    const hasAccess = await ChatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }
 
    // Get all project members
    const participants = await ChatService.getAllProjectMembers(projectId);
 
    res.json({
      success: true,
      data: participants
    });
 
  } catch (error) {
    console.error('Error getting chat participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat participants'
    });
  }
});
 
// POST /api/projects/:projectId/chat/messages - Send a message (alternative to Socket.IO)
router.post('/:projectId/chat/messages', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { message } = req.body;
 
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty'
      });
    }
 
    // Validate user has access to this project
    const hasAccess = await ChatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to send messages in this project'
      });
    }
 
    let messageType = 'text';
    let responseMessage = message;
 
    // Check if it's a bot command
    if (message.startsWith('/')) {
      // Handle bot command - send response as a separate bot message
      const userId = req.user._id || req.user.id; // Fallback to public_id if _id is not available
      const botResponse = await ChatService.handleChatbotCommand(projectId, message, req.user.name, userId);
 
      // Save the bot response message
      const botMessage = await ChatService.saveMessage(
        projectId,
        0, // System user ID for bot
        'ChatBot',
        botResponse,
        'bot'
      );
 
      // Also save the user's command message for history
      const userMessage = await ChatService.saveMessage(
        projectId,
        req.user._id,
        req.user.name,
        message,
        'text'
      );
 
      // Emit both messages to project room via Socket.IO
      const roomName = `project_${projectId}`;
      if (global.io) {
        global.io.to(roomName).emit('chat_message', userMessage);
        global.io.to(roomName).emit('chat_message', botMessage);
      }
 
      res.json({
        success: true,
        data: {
          userMessage,
          botMessage
        }
      });
      return;
    }
 
    // Save regular message to database
    const savedMessage = await ChatService.saveMessage(
      projectId,
      req.user._id,
      req.user.name,
      responseMessage,
      messageType
    );
 
    // Emit to project room via Socket.IO
    const roomName = `project_${projectId}`;
    if (global.io) {
      global.io.to(roomName).emit('chat_message', savedMessage);
    }
 
    res.json({
      success: true,
      data: savedMessage
    });
 
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});
 
// GET /api/projects/:projectId/chat/stats - Get chat statistics
router.get('/:projectId/chat/stats', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { projectId } = req.params;
 
    // Validate user has access to this project
    const hasAccess = await ChatService.validateProjectAccess(req.user._id, projectId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this project chat'
      });
    }
 
    // Get chat statistics using ChatService
    const stats = await ChatService.getChatStats(projectId);
 
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
 
// DELETE /api/projects/:projectId/chat/messages/:messageId - Delete a message (Admin only)
router.delete('/:projectId/chat/messages/:messageId', requireRole(['Admin']), async (req, res) => {
  try {
    const { projectId, messageId } = req.params;
 
    // Verify message belongs to project and user can delete it
    const [message] = await q(`
      SELECT * FROM chat_messages
      WHERE id = ? AND project_id = ?
    `, [messageId, projectId]);
 
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
 
    // Only allow deletion by message sender or admin
    if (message.sender_id !== req.user._id && req.user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own messages'
      });
    }
 
    // Delete the message
    await q('DELETE FROM chat_messages WHERE id = ?', [messageId]);
 
    // Emit deletion event to project room
    const roomName = `project_${projectId}`;
    if (global.io) {
      global.io.to(roomName).emit('message_deleted', {
        messageId,
        deleted_by: req.user.name
      });
    }
 
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
 
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
});
 
module.exports = router;
 