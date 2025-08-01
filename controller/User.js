const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const logger = require("../logger");

// Route to get all users
router.get("/getusers", (req, res) => {
  // logger.info("GET /api/users/getusers - Fetching all users");
  
  const query = "SELECT _id, name, title, email, role, isActive, createdAt FROM users";
  
  db.query(query, (err, results) => {
    if (err) {
      logger.error(`Error Fetching users: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    // logger.info("Successfully fetched all users");
    res.status(200).json(results);
  });
});

// Route to get user by ID
router.get("/getuserbyid/:id", (req, res) => {
  const { id } = req.params;
  // logger.info(`GET /api/users/getuserbyid/${id} - Fetching user by ID`);

  const query = `SELECT name, title, email, role, isActive FROM users WHERE _id=${id}`;
  
  db.query(query, (err, results) => {
    if (err) {
      logger.error(`Error Fetching user by ID ${id}: ${err.message}`);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    // logger.info(`Successfully fetched user with ID: ${id}`);
    res.status(200).json(results);
  });
});

// Add this route to your existing users.js router
router.put("/update/:id", (req, res) => {
  const { id } = req.params;
  const { name, title, email, role, isActive } = req.body;

  // Validate required fields
  if (!name || !email || !role) {
    return res.status(400).json({ 
      success: false,
      message: "Name, email and role are required" 
    });
  }

  const sql = `
    UPDATE users 
    SET name = ?, title = ?, email = ?, role = ?, isActive = ?
    WHERE _id = ?
  `;
  
  // Convert isActive to boolean if needed
  const activeStatus = isActive === 'true' ? true : Boolean(isActive);
  
  const values = [name, title, email, role, activeStatus, id];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        success: false,
        message: "Database error",
        error: err.message 
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // Return the updated user
    db.query('SELECT * FROM users WHERE _id = ?', [id], (err, user) => {
      if (err || user.length === 0) {
        return res.status(200).json({
          success: true,
          message: "User updated but could not fetch updated data"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: user[0]
      });
    });
  });
});

// Route to delete a user
router.delete("/delete/:user_id", (req, res) => {
  const { user_id } = req.params;
  logger.info(`DELETE /api/users/delete/${user_id} - Deleting user`);

  const sqlDelete = `DELETE FROM users WHERE _id = ${user_id}`;
  
  db.query(sqlDelete, (err, result) => {
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