const db = require('../db');

class NotificationService {
  // Create and send notification to specific users
  static async createAndSend(userIds, title, message, type, entityType = null, entityId = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;

    const notifications = userIds.map(userId => ({
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
        if (err) reject(err);
        else resolve(results);
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

    userIds.forEach(userId => {
      if (global.io) {
        global.io.to(`user_${userId}`).emit('notification', payload);
      }
    });
  }

  // Create and send notification to users with specific roles
  static async createAndSendToRoles(roles, title, message, type, entityType = null, entityId = null, tenantId = null) {
    if (!Array.isArray(roles) || roles.length === 0) return;

    // Get user IDs with the specified roles
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

  // Get notifications for user
  static async getForUser(userId, limit = 50, offset = 0) {
    const sql = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [userId, limit, offset], (err, results) => {
        if (err) reject(err);
        else resolve(results);
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

  // Get single notification by ID and user
  static async getById(notificationId, userId) {
    const sql = 'SELECT * FROM notifications WHERE id = ? AND user_id = ?';
    return new Promise((resolve, reject) => {
      db.query(sql, [notificationId, userId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0] || null);
      });
    });
  }
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
}

module.exports = NotificationService;