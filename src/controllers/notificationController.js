const NotificationService = require('../services/notificationService');
const { requireAuth } = require('../middleware/roles');

module.exports = {
  // GET /api/notifications
  getNotifications: [
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.user._id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const notifications = await NotificationService.getForUser(userId, limit, offset);
        res.json({ success: true, data: notifications, userId });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ],

  // PATCH /api/notifications/:id/read
  markAsRead: [
    requireAuth,
    async (req, res) => {
      try {
        const notificationId = req.params.id;
        const userId = req.user._id;
        await NotificationService.markAsRead(notificationId, userId);
        const updatedNotification = await NotificationService.getById(notificationId, userId);
        if (!updatedNotification) {
          return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.json({ success: true, data: updatedNotification });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ],

  // PATCH /api/notifications/read-all
  markAllAsRead: [
    requireAuth,
    async (req, res) => {
      try {
        const userId = req.user._id;
        await NotificationService.markAllAsRead(userId);
        res.json({ success: true, message: 'All notifications marked as read' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ],

  // DELETE /api/notifications/:id
  deleteNotification: [
    requireAuth,
    async (req, res) => {
      try {
        const notificationId = req.params.id;
        const userId = req.user._id;
        await NotificationService.delete(notificationId, userId);
        res.json({ success: true, message: 'Notification deleted' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ]
};