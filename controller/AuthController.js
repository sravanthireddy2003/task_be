const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const jwt = require("jsonwebtoken"); 
const bcrypt = require("bcryptjs");
require('dotenv').config();


router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send({ auth: false, message: "Please provide email and password." });
  }

  const sql = `SELECT * FROM users WHERE email = ?`;

  db.query(sql, [email], (err, result) => {
    if (err) {
      return res.status(500).send({ auth: false, status: "error", message: err.message });
    }
    
    if (!result || result.length === 0) {
      return res.status(404).send({ auth: false, message: "Sorry! No user found." });
    }

    const user = result[0];

    const passwordIsValid = bcrypt.compareSync(password, user.password);

    if (!passwordIsValid) {
      return res.status(401).send({ auth: false, token: null, message: "Invalid password!" });
    }

    const { password: userPassword, ...safeUser } = user;

    // Create a token
    const token = jwt.sign({ id: user.loginId }, process.env.SECRET, { expiresIn: 86400 });

    return res.status(200).send({ auth: true, token: token, user: safeUser });
  });
});

router.post("/register", (req, res) => {
  const { name, title, role, email, password, isAdmin , isGuest } = req.body;
  console.log({ name, title, role, email, password, isAdmin , isGuest })
 
  let hashedPassword = bcrypt.hashSync(password, 8);
 
  const tasks = JSON.stringify([]);  
  const createdAt = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString();   
  const updatedAt = createdAt;
  const __v = 0;
 
  const sqlFind = `SELECT * FROM users WHERE email='${email}'`;
 
  const sql = `
    INSERT INTO users (name, title, role, email, password, isAdmin, tasks, createdAt, updatedAt, __v, isActive , isGuest)
    VALUES ('${name}', '${title}', '${role}', '${email}', '${hashedPassword}', ${isAdmin ? 1 : 0}, '${tasks}', '${createdAt}', '${updatedAt}', ${__v}, true,${isGuest ? 1 : 0})
  `;
 
  db.query(sqlFind, (err, result) => {
    if (err) return res.status(500).send({ auth: false, message: err.message });
    if (result && result.length > 0) {
      return res.status(500).send({ auth: false, status: "error", message: "loginId already exists" });
    }
 
    db.query(sql, (err, result) => {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(501).send({ auth: false, status: 2, message: "Email already exists" });
      }
      if (err) return res.status(500).send({ auth: false, message: err.message });
 
      const sqlGetUser = `SELECT * FROM users WHERE email='${email}'`;
      db.query(sqlGetUser, (err, result) => {
        if (err) return res.status(500).send({ auth: false, message: err.message });
        if (result && result.length > 0) {
          const user = result[0];
          return res.status(200).send({
            user: {
              _id: user._id,
              name: user.name,
              title: user.title,
              role: user.role,
              email: user.email,
              isAdmin: user.isAdmin,
              tasks: JSON.parse(user.tasks),
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
              __v: user.__v,
              isActive: user.isActive,
            }
          });
        }
        return res.status(500).send({ auth: false, message: "User registration failed" });
      });
    });
  });
});

router.post("/changepass", (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const { email } = req.user; // Assuming email is stored in req.user by authentication middleware

  if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).send({ message: "All fields are required" });
  }

  if (newPassword !== confirmPassword) {
      return res.status(400).send({ message: "New password and confirm password do not match" });
  }

  const sqlFind = `SELECT password FROM users WHERE email = ?`;
  
  db.query(sqlFind, [email], async (err, results) => {
      if (err) return res.status(500).send({ message: "Database error", error: err });

      if (results.length === 0) {
          return res.status(404).send({ message: "User not found" });
      }

      const user = results[0];
      const passwordIsValid = await bcrypt.compare(oldPassword, user.password);

      if (!passwordIsValid) {
          return res.status(401).send({ message: "Old password is incorrect" });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 8);

      const sqlUpdate = `UPDATE users SET password = ? WHERE email = ?`;
      
      db.query(sqlUpdate, [hashedNewPassword, email], (err, result) => {
          if (err) return res.status(500).send({ message: "Database error", error: err });

          res.status(200).send({ message: "Password changed successfully" });
      });
  });
});

module.exports = router;
