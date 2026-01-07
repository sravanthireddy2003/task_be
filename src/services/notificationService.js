const db = require('../db');
 
class NotificationService {
  // HELPER: Validate user exists before creating notification
  static async validateUsers(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
   
    const placeholders = userIds.map(() => '?').join(',');
    const sql = `SELECT _id FROM users WHERE _id IN (${placeholders})`;
   
    const validUsers = await new Promise((resolve, reject) => {
      db.query(sql, userIds, (err, results) => {
        if (err) reject(err);
        else resolve(results.map(u => u._id));
      });
    });
   
    return validUsers;
  }
 
  // Create and send notification to specific users
  static async createAndSend(userIds, title, message, type, entityType = null, entityId = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
 
    // ✅ Validate users exist FIRST
    const validUserIds = await this.validateUsers(userIds);
    if (validUserIds.length === 0) {
      console.warn('No valid users found for notification');
      return;
    }
 
    const notifications = validUserIds.map(userId => ({
      user_id: userId,
      title,
      message,
      type,
      entity_type: entityType,
      entity_id: entityId
    }));
 
    // Insert into DB
    const values = notifications.map(n => [n.user_id, n.title, n.message, n.type, n.entity_type, n.entity_id]);
    const sql = 'INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id) VALUES ?';
   
    await new Promise((resolve, reject) => {
      db.query(sql, [values], (err, results) => {
        if (err) {
          console.error('Notification insert error:', err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
 
    // Emit to sockets
    const payload = {
      title,
      message,
      type,
      entityId: entityId,
      createdAt: new Date().toISOString()
    };
 
    validUserIds.forEach(userId => {
      if (global.io) {
        global.io.to(`user_${userId}`).emit('notification', payload);
      }
    });
  }
 
  // Create and send to roles
  static async createAndSendToRoles(roles, title, message, type, entityType = null, entityId = null, tenantId = null) {
    if (!Array.isArray(roles) || roles.length === 0) return;
 
    const placeholders = roles.map(() => '?').join(',');
    const sql = `SELECT _id FROM users WHERE role IN (${placeholders}) ${tenantId ? 'AND tenant_id = ?' : ''}`;
    const params = [...roles];
    if (tenantId) params.push(tenantId);
 
    const users = await new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
 
    const userIds = users.map(u => u._id);
    if (userIds.length === 0) return;
 
    await this.createAndSend(userIds, title, message, type, entityType, entityId);
  }
 
  // ✅ ADDED: Get notifications for user
  static async getForUser(userId, limit = 50, offset = 0) {
    const userExists = await new Promise((resolve, reject) => {
      db.query('SELECT _id FROM users WHERE _id = ?', [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results.length > 0);
      });
    });
 
    if (!userExists) return [];
 
    const sql = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, limit, offset], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }
 
  // ✅ ADDED: Get single notification by ID and user (MISSING METHOD)
  static async getById(notificationId, userId) {
    const sql = 'SELECT * FROM notifications WHERE id = ? AND user_id = ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [notificationId, userId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || null);
      });
    });
  }
 
  // Mark as read
  static async markAsRead(notificationId, userId) {
    const sql = 'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [notificationId, userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }
 
  // Mark all as read
  static async markAllAsRead(userId) {
    const sql = 'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE';
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }
 
  // Delete notification
  static async delete(notificationId, userId) {
    const sql = 'DELETE FROM notifications WHERE id = ? AND user_id = ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [notificationId, userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }
 
  // Clean up notifications for deleted user
  static async cleanupForUser(userId) {
    const sql = 'DELETE FROM notifications WHERE user_id = ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }
 
  // ✅ BONUS: Get unread count
  static async getUnreadCount(userId) {
    const sql = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE';
    return new Promise((resolve, reject) => {
      db.query(sql, [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0].count);
      });
    });
  }
}
 
module.exports = NotificationService;
 
 