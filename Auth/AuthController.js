// import { SendEmailCommand } from '@aws-sdk/client-ses';
// import { sesClient } from "./libs/sesClient.js";

const express = require("express");
const router = express.Router();
const db = require(__root + "db");
const jwt = require("jsonwebtoken"); 
const bcrypt = require("bcryptjs");
require('dotenv').config();


// router.post("/login", (req, res) => {
//   const { loginId, password } = req.body;
//   let sql = `SELECT * FROM users WHERE loginId='${loginId}'`;
 
//   db.query(sql, (err, result) => {
//     if (err)
//       return res
//         .status(500)
//         .send({ auth: false, status: "error", message: err });
//     if (!result)
//       return res
//         .status(404)
//         .send({ auth: false, message: "Sorry! No user found." });
//     if (result && result.length > 0) {

//       const user=result[0];

//       const passwordIsValid = bcrypt.compareSync(password, user.password);
//       console.log(user)

//       const { password, ...safeUser } = user;
//       console.log(safeUser)

//       if (!passwordIsValid)
//         return res.status(401).send({ auth: false, token: null });
//       // Create a token
//       const token = jwt.sign({ id: user.loginId }, process.env.SECRET, {
//         expiresIn: 86400, 
//       });

//       return res
//         .status(200)
//         .send({ auth: true, token: token, user: safeUser });
//     } 
//     else {
//       return res
//         .status(404)
//         .send({ auth: false, message: "Sorry! No user found." });
//     }
//   });
// });

router.post("/login", (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.status(400).send({ auth: false, message: "Please provide loginId and password." });
  }

  const sql = `SELECT * FROM users WHERE loginId = ?`;

  db.query(sql, [loginId], (err, result) => {
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

    
    const { password: userPassword, ...safeUser } = user;   // Rename password during destructuring to avoid conflict please check once back

    // Create a token
    const token = jwt.sign({ id: user.loginId }, process.env.SECRET, { expiresIn: 86400 });

    return res.status(200).send({ auth: true, token: token, user: safeUser });
  });
});


router.post("/register", (req, res) => {
  const { name, loginId, email, designation, password } = req.body;
  let hashedPassword = bcrypt.hashSync(password, 8);

  let sqlFind = `SELECT * FROM users WHERE loginId='${loginId}'`;
 
  const sql = `INSERT INTO users (name, loginId, email, designation,password)
  VALUES ("${name}", "${loginId}", "${email}", "${designation}", "${hashedPassword}")`;

  db.query(sqlFind,(err,result)=>{
    if(result && result.length > 0){
      return res.status(500)
      .send({ auth: false, status: "error", message: "loginId already exists" });
    }
    db.query(sql, (err, result) => {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res
          .status(501)
          .send({ auth: false, status: 2, message: "Email already exists" });
      }
      if (err) return res.status(500).send({ auth: false, message: err.message });
     
      return res.status(200).send({ user: result });
    });
  })  
});




router.post("/change_password", (req, res) => {
  const { email, password, oldPassword } = req.body;
  let hashedPassword = bcrypt.hashSync(password, 8);

  const sql1 = `SELECT * FROM users WHERE email="${email}"`;
  db.query(sql1, (err, result) => {
    if (err) return res.status(500).send({ auth: false, message: err.message });
    console.log("sql1:", sql1);
    console.log("result:", result);
    if (result && result.length > 0) {
      // User exists
      const passwordIsValid = bcrypt.compareSync(
        oldPassword,
        result[0].password
      );
      if (passwordIsValid) {
        const sql = `UPDATE users SET password = "${hashedPassword}" WHERE email= "${email}"`;
        db.query(sql, (err1, result1) => {
          if (err)
            return res.status(500).send({ auth: false, message: err1.message });
          res.status(200).send({
            auth: true,
            token: {},
            status: 1,
            message: "Password updated",
          });
        });
      } else {
        res.status(200).send({
          auth: true,
          token: {},
          status: 0,
          message: "Password not match",
        });
      }
    } else {
      // No user found
      res.status(200).send({
        auth: true,
        token: {},
        status: 0,
        message: "Email exists",
      });
    }
  });
});

// router.post('/forgot_password', (req, res) => {
//     const { email, password } = req.body;
//     const run = async () => {
//         const sendEmailCommand = createSendEmailCommand(
//             "recipient@example.com",
//             "sender@example.com",
//         );

//         try {
//             return await sesClient.send(sendEmailCommand);
//         } catch (e) {
//             console.error("Failed to send email.");
//             return e;
//         }
//     };
//     let hashedPassword = bcrypt.hashSync(password, 8);

//     // const sql = `UPDATE USERS SET password = "${hashedPassword}" WHERE email= "${email}"`;
//     db.query(sql, (err, result) => {
//         if (err) return res.status(500).send({ auth: false, message: err.message });
//         res.status(200).send({ auth: true, token: {}, user: result });
//     });
// });

module.exports = router;
