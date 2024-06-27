
const express = require("express");
const router = express.Router();
const db = require(__root + "db");



router.get("/getusers", (req, res) => {

  const query = "select _id,name ,title,email,role,isActive,createdAt from users ";

  db.query(query,(err, results) => {
    if (err) {
      console.error("Error Fetching user:", err.stack);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    res.status(201).json(results);
  });
});


router.get("/getuserbyid/:id", (req, res) => {
  const{id}=req.params;

  const query = `select name ,title,email,role,isActive from users where _id=${id}`;

  db.query(query,(err, results) => {
    if (err) {  
      console.error("Error Fetching user:", err.stack);
      return res.status(500).json({ error: "Failed to Fetch user" });
    }
    res.status(201).json(results);
  });
});


router.delete('/delete/:user_id', (req, res) => {
  const { user_id } = req.params;

  const sqlDelete = `DELETE FROM users WHERE _id = ${user_id}`;

  db.query(sqlDelete, (err, result) => {
    if (err) {
      return res.status(500).send({ success: false, message: 'Database error', error: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).send({ success: false, message: 'User not found' });
    }

    return res.status(200).send({ success: true, message: 'User deleted successfully' });
  });
});

 

module.exports = router;
