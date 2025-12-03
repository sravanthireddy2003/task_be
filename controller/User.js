const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const logger = require("../logger");
// tenantMiddleware intentionally not applied here (only Tasks/Projects are tenant-scoped)
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

// all user endpoints require auth (tenant scoping removed — only Tasks/Projects enforce tenant)
router.use(requireAuth);

// Route to get all users
router.get("/getusers", requireRole('Admin'), (req, res) => {
  const query = "SELECT _id, name, title, email, role, isActive, createdAt FROM users";
  db.query(query, [], (err, results) => {
    if (err) {
      logger.error(`Error Fetching users: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    res.status(200).json(results);
  });
});

// Route to get user by ID
router.get("/getuserbyid/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const query = `SELECT name, title, email, role, isActive FROM users WHERE _id = ? LIMIT 1`;
  db.query(query, [id], (err, results) => {
    if (err) {
      logger.error(`Error Fetching user by ID ${id}: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    if (!results || results.length === 0) return res.status(404).json({ error: 'User not found' });
    res.status(200).json(results[0]);
  });
});

// Add this route to your existing users.js router
router.put("/update/:id", requireRole('Admin'), (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ success: false, message: "Name, email and role are required" });
  }

  const sql = `
    UPDATE users 
    SET name = ?, title = ?, email = ?, role = ?, isActive = ?
    WHERE _id = ?
  `;

  const activeStatus = isActive === 'true' ? true : Boolean(isActive);
  const values = [name, title, email, role, activeStatus, id];

  db.query(sql, values, (err, result) => {
    if (err) {
      logger.error(`Database error updating user ${id}: ${err.message}`);
      return res.status(500).json({ success: false, message: "Database error", error: err.message });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    db.query('SELECT * FROM users WHERE _id = ? LIMIT 1', [id], (err, user) => {
      if (err || !user || user.length === 0) {
        return res.status(200).json({ success: true, message: "User updated but could not fetch updated data" });
      }
      res.status(200).json({ success: true, message: "User updated successfully", user: user[0] });
    });
  });
});

// Route to delete a user
router.delete("/delete/:user_id", requireRole('Admin'), (req, res) => {
  const { user_id } = req.params;
  logger.info(`DELETE /api/users/delete/${user_id} - Deleting user`);

  const sqlDelete = `DELETE FROM users WHERE _id = ?`;
  db.query(sqlDelete, [user_id], (err, result) => {
    if (err) {
      logger.error(`Error Deleting user with ID ${user_id}: ${err.message}`);
      return res.status(500).send({ success: false, message: "Database error", error: err.message });
    }
    if (result.affectedRows === 0) {
      logger.warn(`User with ID ${user_id} not found for deletion`);
      return res.status(404).send({ success: false, message: "User not found" });
    }
    logger.info(`Successfully deleted user with ID: ${user_id}`);
    return res.status(200).send({ success: true, message: "User deleted successfully" });
  });
});

module.exports = router;