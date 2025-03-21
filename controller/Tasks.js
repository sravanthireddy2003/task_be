const db = require(__root + "db");
const express = require("express");
const router = express.Router();
const verify = require('./VerifyToken');
const upload = require('../multer');
const { storage } = require('./utils/Firestore');
const cloudinary = require('cloudinary');
const multer = require('multer');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const CryptoJS = require('crypto-js');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const logger =require('winston')
const { google } = require('googleapis');
require('dotenv').config();





// const upload =require('./utils/fileFilter');
// router.post('/createe', upload.array('assets', 10), async (req, res) => {
//   try {
//     const { assigned_to, priority, stage, taskDate, title, time_alloted } = req.body;
//     const files = req.files;
//     console.log('Input:', req.body);

//     let results = [];

//     const assignedToArray = Array.isArray(assigned_to) ? assigned_to : JSON.parse(assigned_to);

//     // Ensure that only images are processed
//     if (files && files.length > 0) {
//       results = await Promise.all(
//         files.map(async (file) => {
//           try {
//             console.log('Before Firebase Upload');

//             const storageRef = ref(storage, `assets/${new Date().getTime()}-${file.originalname}`);
            
//             await uploadBytes(storageRef, file.buffer);
//             const downloadURL = await getDownloadURL(storageRef);

//             console.log('File uploaded to Firebase:', downloadURL);
//             return { url: downloadURL, fileName: file.originalname };
//           } catch (uploadError) {
//             console.error('Error uploading file to Firebase:', uploadError);
//           }
//         })
//       );
//     } else {
//       console.log('No files uploaded.');
//     }

//     const createdAt = new Date().toISOString();
//     const updatedAt = createdAt;

//     // Input validation
//     if (!title || !stage || !Array.isArray(assignedToArray)) {
//       return res.status(400).send('Invalid input');
//     }

//     db.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         return res.status(500).send('Database connection error');
//       }

//       console.log('Database connection established');

//       connection.beginTransaction((err) => {
//         if (err) {
//           connection.release();
//           console.error('Error starting transaction:', err);
//           return res.status(500).send('Error starting transaction');
//         }

//         console.log('Transaction started');

//         const insertTaskQuery = `
//           INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, assets, time_alloted) 
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//         console.log("Before executing insertTaskQuery");

//         connection.query(
//           insertTaskQuery,
//           [title, stage, taskDate, priority, createdAt, updatedAt, JSON.stringify(results), time_alloted],
//           (err, result) => {
//             if (err) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error inserting task:', err);
//                 return res.status(500).send('Error inserting task');
//               });
//             }

//             const taskId = result.insertId;
//             const taskAssignments = assignedToArray.map(userId => [taskId, userId]);

//             const insertTaskAssignmentsQuery = `
//               INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

//             connection.query(
//               insertTaskAssignmentsQuery,
//               [taskAssignments],
//               (err, result) => {
//                 if (err) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error inserting task assignments:', err);
//                     return res.status(500).send('Error inserting task assignments');
//                   });
//                 }

//                 connection.commit((err) => {
//                   if (err) {
//                     return connection.rollback(() => {
//                       connection.release();
//                       console.error('Error committing transaction:', err);
//                       return res.status(500).send('Error committing transaction');
//                     });
//                   }

//                   connection.release();
//                   res.status(201).send('Task created successfully');
//                 });
//               }
//             );
//           }
//         );
//       });
//     });

//   } catch (error) {
//     console.error('Error in /createe route:', error);
//     res.status(500).send('Internal server error');
//   }
// });


// router.post('/createjson', async (req, res) => {
//   try {
//     const { assigned_to, priority, stage, taskDate, title, time_alloted, client_id } = req.body;

//     const createdAt = new Date().toISOString();
//     const updatedAt = createdAt;

//     // Validate input
//     if (!title || !stage || !Array.isArray(assigned_to) || !client_id) {
//       return res.status(400).send('Invalid input');
//     }

//     db.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         return res.status(500).send('Database connection error');
//       }

//       connection.beginTransaction((err) => {
//         if (err) {
//           connection.release();
//           console.error('Error starting transaction:', err);
//           return res.status(500).send('Error starting transaction');
//         }

//         // Insert task with client_id
//         const insertTaskQuery = `
//           INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//         connection.query(
//           insertTaskQuery,
//           [title, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id],
//           (err, result) => {
//             if (err) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error inserting task:', err);
//                 return res.status(500).send('Error inserting task');
//               });
//             }

//             const taskId = result.insertId;
//             const taskAssignments = assigned_to.map(userId => [taskId, userId]);

//             // Insert task assignments
//             const insertTaskAssignmentsQuery = `
//               INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

//             connection.query(
//               insertTaskAssignmentsQuery,
//               [taskAssignments],
//               async (err, result) => {
//                 if (err) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error inserting task assignments:', err);
//                     return res.status(500).send('Error inserting task assignments');
//                   });
//                 }

//                 // Fetch emails of assigned users
//                 const userEmailsQuery = `
//                   SELECT email, name FROM users WHERE _id IN (?)`;

//                 connection.query(userEmailsQuery, [assigned_to], async (err, userResults) => {
//                   if (err) {
//                     return connection.rollback(() => {
//                       connection.release();
//                       console.error('Error fetching user emails:', err);
//                       return res.status(500).send('Error fetching user emails');
//                     });
//                   }

//                   const emails = userResults.map(user => user.email);
//                   const userNames = userResults.map(user => user.name);

//                   // Send email notifications
//                   const transporter = nodemailer.createTransport({
//                     service: 'gmail',
//                     auth: {
//                       user: process.env.EMAIL_USER, // Your email
//                       pass: process.env.EMAIL_PASS, // Your email password
//                     },
//                   });

//                   const mailOptions = {
//                     from: process.env.EMAIL_USER,
//                     to: emails,
//                     subject: `New Task Assigned: ${title}`,
//                     html: `
//                       <div style="font-family: Arial, sans-serif; color: #333;">
//                         <h1 style="color: #1a73e8;">New Task Assigned!</h1>
//                         <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
//                         <p style="font-size: 16px;">
//                           You have been assigned a new task: <strong style="color: #1a73e8;">${title}</strong>.
//                           Please check your dashboard for more details.
//                         </p>

//                         <div style="text-align: center; margin: 20px 0;">
//                           <img 
//                             src="https://img.freepik.com/free-vector/hand-drawn-business-planning-with-task-list_23-2149164275.jpg"
//                             alt="Task Assigned" 
//                             style="width: 100%; max-width: 400px; height: auto;" />
//                         </div>

//                         <p style="font-size: 16px; color: #1a73e8;">
//                           Don't forget to complete the task on time!
//                         </p>
//                       </div>
//                     `,
//                   };

//                   try {
//                     await transporter.sendMail(mailOptions);
//                     console.log('Emails sent successfully');
//                   } catch (mailError) {
//                     console.error('Error sending emails:', mailError);
//                   }

//                   connection.commit((err) => {
//                     if (err) {
//                       return connection.rollback(() => {
//                         connection.release();
//                         console.error('Error committing transaction:', err);
//                         return res.status(500).send('Error committing transaction');
//                       });
//                     }

//                     connection.release();
//                     res.status(201).send('Task created and email notifications sent successfully');
//                   });
//                 });
//               }
//             );
//           }
//         );
//       });
//     });
//   } catch (error) {
//     console.error('Error in task creation process:', error);
//     return res.status(500).send('Error in task creation process');
//   }
// });



// Priority adjustment gold
// router.post('/createjson', async (req, res) => {
//   try {
//     const { assigned_to, priority, stage, taskDate, title, time_alloted, client_id } = req.body;

//     const createdAt = new Date().toISOString();
//     const updatedAt = createdAt;

//     // Validate input
//     if (!title || !stage || !Array.isArray(assigned_to) || !client_id) {
//       return res.status(400).send('Invalid input');
//     }

//     db.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         return res.status(500).send('Database connection error');
//       }

//       connection.beginTransaction((err) => {
//         if (err) {
//           connection.release();
//           console.error('Error starting transaction:', err);
//           return res.status(500).send('Error starting transaction');
//         }

//         // First, check if a HIGH priority task already exists for this client
//         const checkHighPriorityQuery = `
//           SELECT COUNT(*) as highPriorityCount 
//           FROM tasks 
//           WHERE client_id = ? AND priority = 'HIGH'
//         `;

//         connection.query(checkHighPriorityQuery, [client_id], (checkErr, checkResults) => {
//           if (checkErr) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error checking high priority tasks:', checkErr);
//               return res.status(500).send('Error checking existing tasks');
//             });
//           }

//           const highPriorityCount = checkResults[0].highPriorityCount;
//           let finalPriority = priority;

//           // If a new HIGH priority task is being added and a HIGH priority task already exists
//           if (priority === 'HIGH' && highPriorityCount > 0) {
//             // Change existing HIGH priority task to MEDIUM
//             const updateExistingTaskQuery = `
//               UPDATE tasks 
//               SET priority = 'MEDIUM', updatedAt = ?
//               WHERE client_id = ? AND priority = 'HIGH'
//             `;

//             connection.query(
//               updateExistingTaskQuery, 
//               [updatedAt, client_id], 
//               (updateErr, updateResult) => {
//                 if (updateErr) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error updating existing high priority task:', updateErr);
//                     return res.status(500).send('Error managing task priorities');
//                   });
//                 }

//                 // Proceed with task insertion with the modified priority logic
//                 continueTaskCreation(connection, req.body, createdAt, updatedAt, 'HIGH', res);
//               }
//             );
//           } else {
//             // No existing high priority task or new task is not high priority
//             continueTaskCreation(connection, req.body, createdAt, updatedAt, priority, res);
//           }
//         });
//       });
//     });
//   } catch (error) {
//     console.error('Error in task creation process:', error);
//     return res.status(500).send('Error in task creation process');
//   }
// });

// // Extracted function to continue task creation process
// function continueTaskCreation(connection, body, createdAt, updatedAt, finalPriority, res) {
//   const { assigned_to, stage, taskDate, title, time_alloted, client_id } = body;

//   // Insert task with client_id and potentially modified priority
//   const insertTaskQuery = `
//     INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//   connection.query(
//     insertTaskQuery,
//     [title, stage, taskDate, finalPriority, createdAt, updatedAt, time_alloted, client_id],
//     (err, result) => {
//       if (err) {
//         return connection.rollback(() => {
//           connection.release();
//           console.error('Error inserting task:', err);
//           return res.status(500).send('Error inserting task');
//         });
//       }

//       const taskId = result.insertId;
//       const taskAssignments = assigned_to.map(userId => [taskId, userId]);

//       // Insert task assignments
//       const insertTaskAssignmentsQuery = `
//         INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

//       connection.query(
//         insertTaskAssignmentsQuery,
//         [taskAssignments],
//         async (err, result) => {
//           if (err) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error inserting task assignments:', err);
//               return res.status(500).send('Error inserting task assignments');
//             });
//           }

//           // Fetch emails of assigned users
//           const userEmailsQuery = `
//             SELECT email, name FROM users WHERE _id IN (?)`;

//           connection.query(userEmailsQuery, [assigned_to], async (err, userResults) => {
//             if (err) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error fetching user emails:', err);
//                 return res.status(500).send('Error fetching user emails');
//               });
//             }

//             const emails = userResults.map(user => user.email);
//             const userNames = userResults.map(user => user.name);

//             // Send email notifications (same as original code)
//             const transporter = nodemailer.createTransport({
//               service: 'gmail',
//               auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS,
//               },
//             });

//             const mailOptions = {
//               from: process.env.EMAIL_USER,
//               to: emails,
//               subject: `New Task Assigned: ${title}`,
//               html: `
//                 <div style="font-family: Arial, sans-serif; color: #333;">
//                   <h1 style="color: #1a73e8;">New Task Assigned!</h1>
//                   <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
//                   <p style="font-size: 16px;">
//                     You have been assigned a new task: <strong style="color: #1a73e8;">${title}</strong>.
//                     ${finalPriority !== body.priority ? `(Priority adjusted to ${finalPriority})` : ''}
//                     Please check your dashboard for more details.
//                   </p>

//                   <div style="text-align: center; margin: 20px 0;">
//                     <img 
//                       src="https://img.freepik.com/free-vector/hand-drawn-business-planning-with-task-list_23-2149164275.jpg"
//                       alt="Task Assigned" 
//                       style="width: 100%; max-width: 400px; height: auto;" />
//                   </div>

//                   <p style="font-size: 16px; color: #1a73e8;">
//                     Don't forget to complete the task on time!
//                   </p>
//                 </div>
//               `,
//             };

//             try {
//               await transporter.sendMail(mailOptions);
//               console.log('Emails sent successfully');
//             } catch (mailError) {
//               console.error('Error sending emails:', mailError);
//             }

//             connection.commit((err) => {
//               if (err) {
//                 return connection.rollback(() => {
//                   connection.release();
//                   console.error('Error committing transaction:', err);
//                   return res.status(500).send('Error committing transaction');
//                 });
//               }

//               connection.release();
//               res.status(201).send('Task created and email notifications sent successfully');
//             });
//           });
//         }
//       );
//     }
//   );
// } 

// priority updated with mail
// router.post('/createjson', async (req, res) => {
//   try {
//     const { assigned_to, priority, stage, taskDate, title, description, time_alloted, client_id } = req.body;

//     const createdAt = new Date().toISOString();
//     const updatedAt = createdAt;

//     // Validate input
//     if (!title || !stage || !Array.isArray(assigned_to) || !client_id) {
//       return res.status(400).send('Invalid input');
//     }

//     db.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         return res.status(500).send('Database connection error');
//       }

//       connection.beginTransaction((err) => {
//         if (err) {
//           connection.release();
//           console.error('Error starting transaction:', err);
//           return res.status(500).send('Error starting transaction');
//         }

//         // First, check if a HIGH priority task already exists for this client
//         const checkHighPriorityQuery = `
//           SELECT COUNT(*) as highPriorityCount 
//           FROM tasks 
//           WHERE client_id = ? AND priority = 'HIGH'
//         `;

//         connection.query(checkHighPriorityQuery, [client_id], (checkErr, checkResults) => {
//           if (checkErr) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error checking high priority tasks:', checkErr);
//               return res.status(500).send('Error checking existing tasks');
//             });
//           }

//           const highPriorityCount = checkResults[0].highPriorityCount;
//           let finalPriority = priority;

//           // If a new HIGH priority task is being added and a HIGH priority task already exists
//           if (priority === 'HIGH' && highPriorityCount > 0) {
//             // Change existing HIGH priority task to MEDIUM
//             const updateExistingTaskQuery = `
//               UPDATE tasks 
//               SET priority = 'MEDIUM', updatedAt = ?
//               WHERE client_id = ? AND priority = 'HIGH'
//             `;

//             connection.query(
//               updateExistingTaskQuery, 
//               [updatedAt, client_id], 
//               (updateErr, updateResult) => {
//                 if (updateErr) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error updating existing high priority task:', updateErr);
//                     return res.status(500).send('Error managing task priorities');
//                   });
//                 }

//                 // Proceed with task insertion with the modified priority logic
//                 continueTaskCreation(connection, req.body, createdAt, updatedAt, 'HIGH', res);
//               }
//             );
//           } else {
//             // No existing high priority task or new task is not high priority
//             continueTaskCreation(connection, req.body, createdAt, updatedAt, priority, res);
//           }
//         });
//       });
//     });
//   } catch (error) {
//     console.error('Error in task creation process:', error);
//     return res.status(500).send('Error in task creation process');
//   }
// });

// // Extracted function to continue task creation process
// function continueTaskCreation(connection, body, createdAt, updatedAt, finalPriority, res) {
//   const { assigned_to, stage, taskDate, title, description, time_alloted, client_id } = body;

//   // Insert task with client_id and potentially modified priority, added description
//   const insertTaskQuery = `
//     INSERT INTO tasks (title, description, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//   connection.query(
//     insertTaskQuery,
//     [title, description, stage, taskDate, finalPriority, createdAt, updatedAt, time_alloted, client_id],
//     (err, result) => {
//       if (err) {
//         return connection.rollback(() => {
//           connection.release();
//           console.error('Error inserting task:', err);
//           return res.status(500).send('Error inserting task');
//         });
//       }

//       const taskId = result.insertId;
//       const taskAssignments = assigned_to.map(userId => [taskId, userId]);

//       // Insert task assignments
//       const insertTaskAssignmentsQuery = `
//         INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

//       connection.query(
//         insertTaskAssignmentsQuery,
//         [taskAssignments],
//         async (err, result) => {
//           if (err) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error inserting task assignments:', err);
//               return res.status(500).send('Error inserting task assignments');
//             });
//           }

//           // Fetch emails of assigned users
//           const userEmailsQuery = `
//             SELECT email, name FROM users WHERE _id IN (?)`;

//           connection.query(userEmailsQuery, [assigned_to], async (err, userResults) => {
//             if (err) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error fetching user emails:', err);
//                 return res.status(500).send('Error fetching user emails');
//               });
//             }

//             const emails = userResults.map(user => user.email);
//             const userNames = userResults.map(user => user.name);

//             // Send email notifications
//             const transporter = nodemailer.createTransport({
//               service: 'gmail',
//               auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS,
//               },
//             });

//             const mailOptions = {
//               from: process.env.EMAIL_USER,
//               to: emails,
//               subject: `New Task Assigned: ${title}`,
//               html: `
//                 <div style="font-family: Arial, sans-serif; color: #333;">
//                   <h1 style="color: #1a73e8;">New Task Assigned!</h1>
//                   <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
//                   <p style="font-size: 16px;">
//                     You have been assigned a new task: <strong style="color: #1a73e8;">${title}</strong>.
//                     ${finalPriority !== body.priority ? `(Priority adjusted to ${finalPriority})` : ''}
//                     Please check your dashboard for more details.
//                   </p>

//                   ${description ? `
//                   <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0;">
//                     <h3 style="color: #1a73e8;">Task Description:</h3>
//                     <p style="font-size: 16px;">${description}</p>
//                   </div>
//                   ` : ''}

//                   <div style="text-align: center; margin: 20px 0;">
//                     <img 
//                       src="https://img.freepik.com/free-vector/hand-drawn-business-planning-with-task-list_23-2149164275.jpg"
//                       alt="Task Assigned" 
//                       style="width: 100%; max-width: 400px; height: auto;" />
//                   </div>

//                   <p style="font-size: 16px; color: #1a73e8;">
//                     Don't forget to complete the task on time!
//                   </p>
//                 </div>
//               `,
//             };

//             try {
//               await transporter.sendMail(mailOptions);
//               console.log('Emails sent successfully');
//             } catch (mailError) {
//               console.error('Error sending emails:', mailError);
//             }

//             connection.commit((err) => {
//               if (err) {
//                 return connection.rollback(() => {
//                   connection.release();
//                   console.error('Error committing transaction:', err);
//                   return res.status(500).send('Error committing transaction');
//                 });
//               }

//               connection.release();
//               res.status(201).send('Task created and email notifications sent successfully');
//             });
//           });
//         }
//       );
//     }
//   );
// }





// updateing tasktime for old task

router.post('/createjson', async (req, res) => {
  try {
    const { assigned_to, priority, stage, taskDate, title, description, time_alloted, client_id } = req.body;

    // const createdAt = new Date().toISOString();
    const createdAt = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString();   
    const updatedAt = createdAt;

    // Enhanced input validation
    if (!title || !stage || !client_id) {
      return res.status(400).send('Missing required fields: title, stage, or client_id');
    }

    if (!Array.isArray(assigned_to) || assigned_to.length === 0) {
      return res.status(400).send('assigned_to must be a non-empty array of user IDs');
    }

    db.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting database connection:', err);
        return res.status(500).send('Database connection error');
      }
      
      connection.beginTransaction((err) => {
        if (err) {
          connection.release();
          console.error('Error starting transaction:', err);
          return res.status(500).send('Error starting transaction');
        }

        // First, check if a HIGH priority task already exists for this client
        const checkHighPriorityQuery = `
          SELECT COUNT(*) as highPriorityCount, priority as existingPriority, taskDate as existingTaskDate 
          FROM tasks 
          WHERE client_id = ? AND priority = 'HIGH'
        `;

        connection.query(checkHighPriorityQuery, [client_id], (checkErr, checkResults) => {
          if (checkErr) {
            return connection.rollback(() => {
              connection.release();
              console.error('Error checking high priority tasks:', checkErr);
              return res.status(500).send('Error checking existing tasks');
            });
          }

          const highPriorityCount = checkResults[0].highPriorityCount;
          let finalPriority = priority;
          let finalTaskDate = taskDate;

          // Priority adjustment logic with task date calculation
          if (priority === 'HIGH' && highPriorityCount > 0) {
            const existingTaskDate = new Date(checkResults[0].existingTaskDate);
            const currentDate = new Date();
            const daysDifference = Math.ceil((existingTaskDate - currentDate) / (1000 * 60 * 60 * 24));

            let dateAdjustmentDays = 0;
            if (checkResults[0].existingPriority === 'LOW') {
              dateAdjustmentDays = Math.ceil(daysDifference * 1.5);
            } else if (checkResults[0].existingPriority === 'MEDIUM') {
              dateAdjustmentDays = Math.ceil(daysDifference * 1.2);
            }

            finalTaskDate = new Date(existingTaskDate);
            finalTaskDate.setDate(finalTaskDate.getDate() + dateAdjustmentDays);

            const updateExistingTaskQuery = `
              UPDATE tasks 
              SET priority = 'MEDIUM', updatedAt = ?, taskDate = ?
              WHERE client_id = ? AND priority = 'HIGH'
            `;

            connection.query(
              updateExistingTaskQuery, 
              [updatedAt, finalTaskDate.toISOString(), client_id], 
              (updateErr) => {
                if (updateErr) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error('Error updating existing high priority task:', updateErr);
                    return res.status(500).send('Error managing task priorities');
                  });
                }

                continueTaskCreation(
                  connection, 
                  { ...req.body, taskDate: finalTaskDate.toISOString() }, 
                  createdAt, 
                  updatedAt, 
                  'HIGH', 
                  res
                );
              }
            );
          } else {
            continueTaskCreation(connection, req.body, createdAt, updatedAt, priority, res);
          }
        });
      });
    });
  } catch (error) {
    console.error('Error in task creation process:', error);
    return res.status(500).send('Error in task creation process');
  }
});

function continueTaskCreation(connection, body, createdAt, updatedAt, finalPriority, res) {
  const { assigned_to, stage, taskDate, title, description, time_alloted, client_id } = body;

  const insertTaskQuery = `
    INSERT INTO tasks (title, description, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  connection.query(
    insertTaskQuery,
    [title, description, stage, taskDate, finalPriority, createdAt, updatedAt, time_alloted, client_id],
    (err, result) => {
      if (err) {
        return connection.rollback(() => {
          connection.release();
          console.error('Error inserting task:', err);
          return res.status(500).send('Error inserting task');
        });
      }

      const taskId = result.insertId;
      
      // Validate taskAssignments array
      if (!taskId || !Array.isArray(assigned_to) || assigned_to.length === 0) {
        return connection.rollback(() => {
          connection.release();
          console.error('Invalid task ID or assigned_to array');
          return res.status(500).send('Error creating task assignments');
        });
      }

      const taskAssignments = assigned_to.map(userId => [taskId, userId]);
      
      // Add validation to ensure taskAssignments is not empty
      const insertTaskAssignmentsQuery = `
        INSERT INTO TaskAssignments (task_id, user_id) 
        VALUES ${taskAssignments.map(() => '(?, ?)').join(', ')}`;

      // Flatten the taskAssignments array for the query
      const flattenedValues = taskAssignments.flat();

      connection.query(
        insertTaskAssignmentsQuery,
        flattenedValues,
        async (err, result) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              console.error('Error inserting task assignments:', err);
              return res.status(500).send('Error inserting task assignments');
            });
          }

          const userEmailsQuery = `
            SELECT email, name FROM users WHERE _id IN (?)`;

          connection.query(userEmailsQuery, [assigned_to], async (err, userResults) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                console.error('Error fetching user emails:', err);
                return res.status(500).send('Error fetching user emails');
              });
            }

            const emails = userResults.map(user => user.email);
            const userNames = userResults.map(user => user.name);

            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
              },
            });

            const mailOptions = {
              from: process.env.EMAIL_USER,
              to: emails,
              subject: `New Task Assigned: ${title}`,
              html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                  <h1 style="color: #1a73e8;">New Task Assigned!</h1>
                  <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
                  <p style="font-size: 16px;">
                    You have been assigned a new task: <strong style="color: #1a73e8;">${title}</strong>.
                    ${finalPriority !== body.priority ? `(Priority adjusted to ${finalPriority})` : ''}
                    Please check your dashboard for more details.
                  </p>

                  ${description ? `
                  <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <h3 style="color: #1a73e8;">Task Description:</h3>
                    <p style="font-size: 16px;">${description}</p>
                  </div>
                  ` : ''}

                  <p style="font-size: 16px; color: #1a73e8;">
                    Don't forget to complete the task on time!
                  </p>
                </div>
              `,
            };

            try {
              await transporter.sendMail(mailOptions);
              console.log('Emails sent successfully');
            } catch (mailError) {
              console.error('Error sending emails:', mailError);
            }

            connection.commit((err) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  console.error('Error committing transaction:', err);
                  return res.status(500).send('Error committing transaction');
                });
              }

              connection.release();
              res.status(201).send('Task created and email notifications sent successfully');
            });
          });
        }
      );
    }
  );
}



// // Safe JSON parsing function
// // function safeJSONParse(jsonString, defaultValue = null) {
// //   try {
// //     const trimmedString = typeof jsonString === 'string' ? jsonString.trim() : jsonString;
// //     return trimmedString ? JSON.parse(trimmedString) : defaultValue;
// //   } catch (error) {
// //     console.error('JSON Parsing Error:', {
// //       message: error.message,
// //       inputString: jsonString
// //     });
// //     return defaultValue;
// //   }
// // }

// // Configure Google Service Account
// // let serviceAccountKey;
// // try {
// //   // serviceAccountKey = safeJSONParse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
// //   const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

// //   console.log(serviceAccountKey.client_email);
// //   if (!serviceAccountKey) {
// //     throw new Error('Invalid service account key');
// //   }
// // } catch (error) {
// //   console.error('Service Account Key Configuration Error:', error);
// //   serviceAccountKey = null;
// // }

// // Function to add event to Google Calendar for a specific user
// async function addTaskToGoogleCalendar(userEmail, taskDetails) {
//   // if (!serviceAccountKey) {
//   //   console.warn('Google Service Account not configured');
//   //   return null;
//   // }

//   try {
//     const jwtClient = new google.auth.JWT(
//       // serviceAccountKey.client_email,
//       'task-manager-app@taskmanager-452805.iam.gserviceaccount.com',
//       null,
//       // serviceAccountKey.private_key,
//       '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCyb6cglpe9upRw\n/hTSjcSgBhq7B8hYoIfnhfrZ6/TL8/A+rn7qCavzeQRH6B6cZY2z+0JW2SMBq6wh\n05VqJcgGXnV7zcdQh7/0rAr+2nRfPXiWTqJemsmSB8TLcKedDGCJJqsbbNRSyefF\nlkfD+v5YO3NV/L085r1AJNg4BuvOiZqOnCcBBEDtA4ro+FLb1Jdbnisi5mAf33xL\npP5/+Dm+jpsUc9xIfnuWkga6AQWbCcUO7Q0JJAPFYQs8x4tT7xNxfEeZ+olxurKA\nodBLTirvw17W/vp33zWYieHZzc4rFjdFwuiP0lstNHtoy2MfYAvZVsUzXDAePiyL\npDXk+Hq3AgMBAAECggEABltkTLdrbDF8/1zgo120nxozPULk4toZQr4rC99+/FMn\nqyauqSozYOcIqC0qBgViMS18QA7X/e5pTAKMj1hi523Zvqbmo8T/qY5a4ph9eTUo\nmiZEB53OckWU6nCMMClUOR6nuEA+J5LqOcewV9hAfnvjuzECvEGLhYD/3lh0xzS1\nYJS1HK7K1zR4LIqEz1GjhWza5vjgieRdoGfB/YiFaSnYQT/nnLUdrFb6ZMjus+He\nAUd1gGcoVCJizQxIUdMroJX39qkJ5hGCVqac6ip0uVjsxTedVMIGb01a+s1wSUCU\nWRuRxVS9l5HXT1C1vnb9+e793QL3Sa8oYcyLEnHJwQKBgQD6xquf+fRs/7/oLaNS\nsYiNF6akbhW5AeW7P8WtSzuar5KOUPlzxeEpO8avswELuBIgPUkOb9ppgmH7eX9Y\nwBnUmcgbhwfLJpD/Tlaz2RRht4MZJVdGbeQdojFZaxttKb3Gf0niNqJLeuOhD/Ai\n+LJSiRafxZEObg1RbUQ5A3SqdwKBgQC2JzXyhu9s715GLEfSvFR2sjowta4KbMPh\nYT4iTSZJm4UYZM0vqnacvAzO6YsGKzJaJ1l19hC1ZzEaUGvF8ftHYo6hzI6BEGdn\nMh2xcJhiVzDauInpUlMwhe3a7AwAxZq1jmYkkPC7cBR9K1V1233s9r+Ju/z8mAnj\neX9EylKBwQKBgQDk9CGZKyHnqg/RsGkehIvBFUjFcuRORtcxf+XAc6F1drp9SJyX\nAKCzfqnFm85mnqWd3ZYnoiNslOdUKvcDVk++9K/nwf5xkUJsdV9fT9/13w/IE3l9\nCbNtArm/g7RElAl5gpk3+N1vwEC2udBqfViBVjvbnwrye7OZFgNlciw/vQKBgGeD\nUuH3EnqqcL2aDlrQkYM+d1kU9cmQ06PxufiONTLhQTqCliP/UBZzuyeeilXAGIYp\nFGq3ofkkoj/c8dH0WKLRfFKwR09K/igjz8H1RXOlLusssZq5IPNTOL8PIycRJIEG\nYj9napZp9ArJpHAsgpw2ANUJ0pPM5tmxQsTZ4RdBAoGAKnKb84LMs2w9Sq+Oq3o9\nv3Mmnvwj+dKo6waM5BbZ9ET5/rw06SsPUmlNnuPdUinHyN9ixcRSlGmtHxFEZKHe\nrqbLPlODypc5hx6LD4bahAb1c5nm8ixBa6rxF8ABKxuz5xutYdfn6+EQ7IDBXP6m\noxpjZBdxIg8WtNZrvMRvMaU=\n-----END PRIVATE KEY-----\n"',
  
//       ['https://www.googleapis.com/auth/calendar']
//     );

//     // Authorize the client
//     await jwtClient.authorize();

//     const calendar = google.calendar({ version: 'v3', auth: jwtClient });

//     // Validate and sanitize task details
//     const validatedTaskDetails = {
//       title: taskDetails.title || 'Untitled Task',
//       description: taskDetails.description || 'Task assigned to you',
//       taskDate: taskDetails.taskDate ? new Date(taskDetails.taskDate) : new Date(),
//       time_alloted: parseInt(taskDetails.time_alloted) || 1,
//       priority: taskDetails.priority || 'LOW'
//     };

//     const event = {
//       summary: validatedTaskDetails.title,
//       description: validatedTaskDetails.description,
//       start: {
//         dateTime: validatedTaskDetails.taskDate.toISOString(),
//         timeZone: 'UTC',
//       },
//       end: {
//         dateTime: new Date(
//           validatedTaskDetails.taskDate.getTime() + 
//           (validatedTaskDetails.time_alloted * 60 * 60 * 1000)
//         ).toISOString(),
//         timeZone: 'UTC',
//       },
//       attendees: [{ email: userEmail }],
//       colorId: validatedTaskDetails.priority === 'HIGH' ? '11' :
//                validatedTaskDetails.priority === 'MEDIUM' ? '5' : '10',
//     };

//     const calendarResponse = await calendar.events.insert({
//       calendarId: userEmail,
//       resource: event,
//     });

//     return calendarResponse.data.htmlLink;
//   } catch (error) {
//     console.error('Error adding event to Google Calendar:', error);
//     return null;
//   }
// }

// // Send task assignment emails
// async function sendTaskAssignmentEmails(userResults, title, description, finalPriority, originalPriority, calendarResults) {
//   const emails = userResults.map(user => user.email);
//   const userNames = userResults.map(user => user.name);

//   const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: emails,
//     subject: `New Task Assigned: ${title}`,
//     html: generateEmailHTML(userNames, title, description, finalPriority, originalPriority, calendarResults)
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     console.log('Emails sent successfully');
//   } catch (mailError) {
//     console.error('Error sending emails:', mailError);
//     throw mailError;
//   }
// }

// // Generate email HTML
// function generateEmailHTML(userNames, title, description, finalPriority, originalPriority, calendarResults) {
//   return `
//     <div style="font-family: Arial, sans-serif; color: #333;">
//       <h1 style="color: #1a73e8;">New Task Assigned!</h1>
//       <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
//       <p style="font-size: 16px;">
//         You have been assigned a new task: <strong style="color: #1a73e8;">${title}</strong>.
//         ${finalPriority !== originalPriority ? `(Priority adjusted to ${finalPriority})` : ''}
//         Please check your dashboard for more details.
//       </p>

//       ${description ? `
//       <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0;">
//         <h3 style="color: #1a73e8;">Task Description:</h3>
//         <p style="font-size: 16px;">${description}</p>
//       </div>
//       ` : ''}

//       ${calendarResults.filter(result => result).map(result => 
//         `<p>View in Google Calendar: <a href="${result.calendarLink}">Open Event</a></p>`
//       ).join('')}

//       <p style="font-size: 16px; color: #1a73e8;">
//         Don't forget to complete the task on time!
//       </p>
//     </div>
//   `;
// }

// // Continue task creation process
// function continueTaskCreation(connection, body, createdAt, updatedAt, finalPriority, res) {
//   const { 
//     assigned_to = [], 
//     stage, 
//     taskDate, 
//     title, 
//     description, 
//     time_alloted, 
//     client_id 
//   } = body;

//   // Validate required fields
//   if (!title || !stage || !client_id) {
//     return res.status(400).send('Missing required task fields');
//   }

//   const insertTaskQuery = `
//     INSERT INTO tasks (title, description, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//   connection.query(
//     insertTaskQuery,
//     [title, description, stage, taskDate, finalPriority, createdAt, updatedAt, time_alloted, client_id],
//     (err, result) => {
//       if (err) {
//         return connection.rollback(() => {
//           connection.release();
//           console.error('Error inserting task:', err);
//           return res.status(500).send('Error inserting task');
//         });
//       }

//       const taskId = result.insertId;
      
//       // Validate task assignments
//       if (!taskId || !Array.isArray(assigned_to) || assigned_to.length === 0) {
//         return connection.rollback(() => {
//           connection.release();
//           console.error('Invalid task ID or assigned_to array');
//           return res.status(500).send('Error creating task assignments');
//         });
//       }

//       const taskAssignments = assigned_to.map(userId => [taskId, userId]);
      
//       const insertTaskAssignmentsQuery = `
//         INSERT INTO TaskAssignments (task_id, user_id) 
//         VALUES ${taskAssignments.map(() => '(?, ?)').join(', ')}`;

//       const flattenedValues = taskAssignments.flat();

//       connection.query(
//         insertTaskAssignmentsQuery,
//         flattenedValues,
//         async (err) => {
//           if (err) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error inserting task assignments:', err);
//               return res.status(500).send('Error inserting task assignments');
//             });
//           }

//           const userEmailsQuery = `
//             SELECT _id, email, name FROM users WHERE _id IN (?)`;

//           connection.query(userEmailsQuery, [assigned_to], async (err, userResults) => {
//             if (err) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error fetching user emails:', err);
//                 return res.status(500).send('Error fetching user emails');
//               });
//             }

//             try {
//               // Add Google Calendar events for each assigned user
//               const calendarPromises = userResults.map(async (user) => {
//                 try {
//                   const calendarLink = await addTaskToGoogleCalendar(user.email, {
//                     title,
//                     description,
//                     taskDate,
//                     time_alloted,
//                     priority: finalPriority
//                   });
//                   return { userId: user._id, calendarLink };
//                 } catch (calendarError) {
//                   console.error(`Error adding calendar event for user ${user._id}:`, calendarError);
//                   return null;
//                 }
//               });

//               const calendarResults = await Promise.all(calendarPromises);

//               // Send email notifications
//               await sendTaskAssignmentEmails(
//                 userResults, 
//                 title, 
//                 description, 
//                 finalPriority, 
//                 body.priority, 
//                 calendarResults
//               );

//               // Commit transaction
//               connection.commit((commitErr) => {
//                 if (commitErr) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error committing transaction:', commitErr);
//                     return res.status(500).send('Error committing transaction');
//                   });
//                 }

//                 connection.release();
//                 res.status(201).send('Task created successfully');
//               });
//             } catch (processError) {
//               return connection.rollback(() => {
//                 connection.release();
//                 console.error('Error in task assignment process:', processError);
//                 return res.status(500).send('Error processing task assignment');
//               });
//             }
//           });
//         }
//       );
//     }
//   );
// }

// Main route handler for task creation
// router.post('/createjson', async (req, res) => {
//   try {
//     const { 
//       assigned_to, 
//       priority, 
//       stage, 
//       taskDate, 
//       title, 
//       description, 
//       time_alloted, 
//       client_id 
//     } = req.body;

//     // Use Indian Standard Time (IST)
//     const createdAt = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString();   
//     const updatedAt = createdAt;

//     // Enhanced input validation
//     if (!title || !stage || !client_id) {
//       return res.status(400).send('Missing required fields: title, stage, or client_id');
//     }

//     if (!Array.isArray(assigned_to) || assigned_to.length === 0) {
//       return res.status(400).send('assigned_to must be a non-empty array of user IDs');
//     }

//     // Database connection and transaction
//     db.getConnection((err, connection) => {
//       if (err) {
//         console.error('Error getting database connection:', err);
//         return res.status(500).send('Database connection error');
//       }
      
//       connection.beginTransaction((transactionErr) => {
//         if (transactionErr) {
//           connection.release();
//           console.error('Error starting transaction:', transactionErr);
//           return res.status(500).send('Error starting transaction');
//         }

//         // Check existing high-priority tasks for the client
//         const checkHighPriorityQuery = `
//           SELECT COUNT(*) as highPriorityCount, priority as existingPriority, taskDate as existingTaskDate 
//           FROM tasks 
//           WHERE client_id = ? AND priority = 'HIGH'
//         `;

//         connection.query(checkHighPriorityQuery, [client_id], (checkErr, checkResults) => {
//           if (checkErr) {
//             return connection.rollback(() => {
//               connection.release();
//               console.error('Error checking high priority tasks:', checkErr);
//               return res.status(500).send('Error checking existing tasks');
//             });
//           }

//           const highPriorityCount = checkResults[0].highPriorityCount;
//           let finalPriority = priority;
//           let finalTaskDate = taskDate;

//           // Priority adjustment logic
//           if (priority === 'HIGH' && highPriorityCount > 0) {
//             const existingTaskDate = new Date(checkResults[0].existingTaskDate);
//             const currentDate = new Date();
//             const daysDifference = Math.ceil((existingTaskDate - currentDate) / (1000 * 60 * 60 * 24));

//             let dateAdjustmentDays = 0;
//             if (checkResults[0].existingPriority === 'LOW') {
//               dateAdjustmentDays = Math.ceil(daysDifference * 1.5);
//             } else if (checkResults[0].existingPriority === 'MEDIUM') {
//               dateAdjustmentDays = Math.ceil(daysDifference * 1.2);
//             }

//             finalTaskDate = new Date(existingTaskDate);
//             finalTaskDate.setDate(finalTaskDate.getDate() + dateAdjustmentDays);

//             const updateExistingTaskQuery = `
//               UPDATE tasks 
//               SET priority = 'MEDIUM', updatedAt = ?, taskDate = ?
//               WHERE client_id = ? AND priority = 'HIGH'
//             `;

//             connection.query(
//               updateExistingTaskQuery, 
//               [updatedAt, finalTaskDate.toISOString(), client_id], 
//               (updateErr) => {
//                 if (updateErr) {
//                   return connection.rollback(() => {
//                     connection.release();
//                     console.error('Error updating existing high priority task:', updateErr);
//                     return res.status(500).send('Error managing task priorities');
//                   });
//                 }

//                 continueTaskCreation(
//                   connection, 
//                   { ...req.body, taskDate: finalTaskDate.toISOString() }, 
//                   createdAt, 
//                   updatedAt, 
//                   'HIGH', 
//                   res
//                 );
//               }
//             );
//           } else {
//             continueTaskCreation(connection, req.body, createdAt, updatedAt, priority, res);
//           }
//         });
//       });
//     });
//   } catch (error) {
//     console.error('Error in task creation process:', error);
//     return res.status(500).send('Error in task creation process');
//   }
// });






router.get('/taskdropdown', async (req, res) => {
  try {
    const query = 'SELECT id, title FROM tasks';
        db.query(query, (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to fetch tasks' });
      }
      if (!Array.isArray(results)) {  
        console.error('Query result is not an array:', results);
        return res.status(500).json({ error: 'Unexpected query result format' });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});


router.get('/taskdropdownfortaskHrs', async (req, res) => {
  try {
    const userId = req.query.user_id;
    const query = `
      SELECT t.id, t.title 
      FROM tasks t
      JOIN taskassignments ta ON t.id = ta.task_id
      WHERE ta.user_id = ?
    `;

    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to fetch tasks' });
      }
      if (!Array.isArray(results)) {  
        console.error('Query result is not an array:', results);
        return res.status(500).json({ error: 'Unexpected query result format' });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});



// for specific User
// router.get("/gettaskss", (req, res) => {
//   const { userId, isAdmin } = req.query;
//   let query = `
//       SELECT 
//           t.id AS task_id, 
//           t.title, 
//           t.stage, 
//           t.taskDate, 
//           t.priority, 
//           t.createdAt, 
//           t.updatedAt, 
//           u._id AS user_id, 
//           u.name AS user_name, 
//           u.role AS user_role
//       FROM 
//           tasks t
//       LEFT JOIN 
//           TaskAssignments ta ON t.id = ta.task_id
//       LEFT JOIN 
//           users u ON ta.user_id = u._id
//   `;

//   // If the user is not an admin, restrict the query to tasks where the user is assigned
//   // if (parseInt(isAdmin, 10) !== 1) {
//   //     query += ` WHERE t.id IN (
//   //         SELECT task_id FROM TaskAssignments WHERE user_id = ?
//   //     )`;
//   // }

//   // query += ` ORDER BY t.id;`;

//   // const queryParams = parseInt(isAdmin, 10) === 1 ? [] : [userId];


//   if (![1, 2].includes(parseInt(isAdmin, 10))) {
//     query += ` WHERE t.id IN (
//         SELECT task_id FROM TaskAssignments WHERE user_id = ?
//     )`;
// }

// query += ` ORDER BY t.id;`;

// const queryParams = [1, 2].includes(parseInt(isAdmin, 10)) ? [] : [userId];


//   db.query(query, queryParams, (err, results) => {
//       if (err) {
//           console.error('Error fetching tasks:', err);
//           return res.status(500).send('Error fetching tasks');
//       }

//       const tasks = {};
//       results.forEach(row => {
//           if (!tasks[row.task_id]) {
//               tasks[row.task_id] = {
//                   task_id: row.task_id,
//                   title: row.title,
//                   stage: row.stage,
//                   taskDate: row.taskDate,
//                   priority: row.priority,
//                   createdAt: row.createdAt,
//                   updatedAt: row.updatedAt,
//                   assigned_users: []
//               };
//           }

//           if (row.user_id) {
//               tasks[row.task_id].assigned_users.push({
//                   user_id: row.user_id,
//                   user_name: row.user_name,
//                   user_role: row.user_role
//               });
//           }
//       });

//       res.status(200).json(Object.values(tasks));
//   });
// });


// for all tasks Not-in-Use

router.get("/gettaskss", (req, res) => {
  const { userId, isAdmin } = req.query;
  let query = `
      SELECT 
          t.id AS task_id, 
          c.name AS client_name,
          t.title, 
          t.description,
          t.stage, 
          t.taskDate, 
          t.priority, 
          t.createdAt, 
          t.updatedAt, 
          u._id AS user_id, 
          u.name AS user_name, 
          u.role AS user_role
      FROM 
          tasks t
      LEFT JOIN 
          TaskAssignments ta ON t.id = ta.task_id
      LEFT JOIN 
          users u ON ta.user_id = u._id
      LEFT JOIN 
          clientss c ON t.client_id = c.id

  `;

  // User access control
  if (![1, 2].includes(parseInt(isAdmin, 10))) {
    query += ` WHERE t.id IN (
        SELECT task_id FROM TaskAssignments WHERE user_id = ?
    )`;
  }
  query += ` 
  ORDER BY 
    CASE t.priority
      WHEN 'HIGH' THEN 
        CASE t.stage
          WHEN 'TODO' THEN 1
          WHEN 'IN_PROGRESS' THEN 2
          WHEN 'COMPLETED' THEN 3
          ELSE 4
        END
      WHEN 'MEDIUM' THEN 
        CASE t.stage
          WHEN 'TODO' THEN 5
          WHEN 'IN_PROGRESS' THEN 6
          WHEN 'COMPLETED' THEN 7
          ELSE 8
        END
      WHEN 'LOW' THEN 
        CASE t.stage
          WHEN 'TODO' THEN 9
          WHEN 'IN_PROGRESS' THEN 10
          WHEN 'COMPLETED' THEN 11
          ELSE 12
        END
      ELSE 13
    END,
    t.createdAt ASC;
  `;

  const queryParams = [1, 2].includes(parseInt(isAdmin, 10)) ? [] : [userId];

  db.query(query, queryParams, (err, results) => {
      if (err) {
          console.error('Error fetching tasks:', err);
          return res.status(500).send('Error fetching tasks');
      }

      const tasks = {};
      results.forEach(row => {
          if (!tasks[row.task_id]) {
              tasks[row.task_id] = {
                  task_id: row.task_id,
                  client_name:row.client_name,
                  title: row.title,
                  description:row.description,
                  stage: row.stage,
                  taskDate: row.taskDate,
                  priority: row.priority,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                  assigned_users: []
              };
          }

          if (row.user_id) {
              tasks[row.task_id].assigned_users.push({
                  user_id: row.user_id,
                  user_name: row.user_name,
                  user_role: row.user_role
              });
          }
      });

      // Optional: Additional client-side sorting as a fallback
      const sortedTasks = Object.values(tasks).sort((a, b) => {
        const priorityOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
        const stageOrder = { 'TODO': 1, 'IN_PROGRESS': 2, 'COMPLETED': 3 };
        
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        
        if (stageOrder[a.stage] !== stageOrder[b.stage]) {
          return stageOrder[a.stage] - stageOrder[b.stage];
        }
        
        return new Date(a.createdAt) - new Date(b.createdAt);
      });

      res.status(200).json(sortedTasks);
  });
});



  router.get("/gettasks", (req, res) => {
      const query = `
          SELECT 
              t.id AS task_id, 
              c.name AS client_name,
              t.title, 
              t.stage, 
              t.taskDate, 
              t.priority, 
              t.createdAt, 
              t.updatedAt, 
              u._id AS user_id, 
              u.name AS user_name, 
              u.role AS user_role
          FROM 
              tasks t
          LEFT JOIN 
              taskassignments ta ON t.id = ta.task_id
          LEFT JOIN 
              users u ON ta.user_id = u._id
          LEFT JOIN 
            clientss c ON t.client_id = c.id    
          ORDER BY 
              t.createdAt;
      `;

      db.query(query, (err, results) => {
          if (err) {
              console.error('Error fetching tasks:', err);
              return res.status(500).send('Error fetching tasks');
          }

          // Group the results by task
          const tasks = {};
          results.forEach(row => {
              if (!tasks[row.task_id]) {
                  tasks[row.task_id] = {
                      task_id: row.task_id,
                      client_name:row.client_name,
                      title: row.title,
                      stage: row.stage,
                      taskDate: row.taskDate,
                      priority: row.priority,
                      createdAt: row.createdAt,
                      updatedAt: row.updatedAt,
                      assigned_users: []
                  };
              }

              if (row.user_id) {
                  tasks[row.task_id].assigned_users.push({
                      user_id: row.user_id,
                      user_name: row.user_name,
                      user_role: row.user_role
                  });
              }
          });

          res.status(200).json(Object.values(tasks));
      });
  });


router.get("/gettaskbyId/:task_id", (req, res) => {
  const { task_id } = req.params;

  const query = `
      SELECT 
          t.id AS task_id, 
          c.name AS client_name,
          t.title, 
          t.description, 
          t.stage, 
          t.taskDate, 
          t.priority, 
          t.createdAt, 
          t.updatedAt, 
          t.time_alloted, 
          u._id AS user_id, 
          u.name AS user_name, 
          u.role AS user_role
      FROM 
          tasks t
      LEFT JOIN 
          TaskAssignments ta ON t.id = ta.task_id
      LEFT JOIN 
          users u ON ta.user_id = u._id
      LEFT JOIN 
          clientss c ON t.client_id = c.id 
      WHERE 
          t.id = ?
      ORDER BY 
          t.id;
  `;  

  db.query(query, [task_id], (err, results) => {
      if (err) {
          console.error('Error fetching task:', err);
          return res.status(500).send('Error fetching task');
      }

      if (results.length === 0) {
          return res.status(404).send('Task not found');
      }

      // Group the results by task
      const task = {
          task_id: results[0].task_id,
          title: results[0].title,
          client_name: results[0].client_name,
          description: results[0].description,
          stage: results[0].stage,
          taskDate: results[0].taskDate,
          priority: results[0].priority,
          createdAt: results[0].createdAt,
          updatedAt: results[0].updatedAt,
          time_alloted: results[0].time_alloted,  // Include time_alloted in response
          assigned_users: []
      };

      results.forEach(row => {
          if (row.user_id) {
              task.assigned_users.push({
                  user_id: row.user_id,
                  user_name: row.user_name,
                  user_role: row.user_role
              });
          }
      });

      res.status(200).json(task);
  });
});


router.delete('/deltask/:task_id', (req, res) => {
    const { task_id } = req.params;

    const sqlDelete = 'DELETE FROM tasks WHERE id = ?';

    db.query(sqlDelete, [task_id], (err, result) => {
        if (err) {
            logger.error(`Error deleting task with ID ${task_id}: ${err.message}`);
            console.error('Error deleting task:', err);

            return res.status(500).send({
                success: false,
                message: 'Database error',
                error: err.message
            });
        }

        if (result.affectedRows === 0) {
            logger.warn(`Attempt to delete non-existing task with ID ${task_id}`);
            return res.status(404).send({
                success: false,
                message: 'Task not found'
            });
        }

        logger.info(`Task with ID ${task_id} deleted successfully`);
        return res.status(200).send({
            success: true,
            message: 'Task and its assignments deleted successfully'
        });
    });
});

router.post('/createsub/:task_id', (req, res) => {
    const { task_id } = req.params;
    const { title, due_date, tag } = req.body;
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    if (!title || !due_date || !tag) {
        logger.warn(`Invalid input provided for task_id: ${task_id}`);
        return res.status(400).send({ success: false, message: 'Invalid input' });
    }

    const insertSubTaskQuery = `
        INSERT INTO subtasks (task_id, title, due_date, tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`;

    // Execute query
    db.query(insertSubTaskQuery, [task_id, title, due_date, tag, createdAt, updatedAt], (err, results) => {
        if (err) {
            logger.error(`Error inserting subtask for task_id: ${task_id} - ${err.message}`);
            return res.status(500).send({ success: false, message: 'Database error', error: err.message });
        }

        // Success response
        logger.info(`Subtask created successfully for task_id: ${task_id}, subtask_id: ${results.insertId}`);
        return res.status(201).json({
            success: true,
            message: 'Subtask created successfully',
            data: {
                id: results.insertId,
                task_id,
                title,
                due_date,
                tag,
                created_at: createdAt,
                updated_at: updatedAt
            }
        });
    });
});


router.get('/getsubtasks/:task_id',(req,res)=>{
    const {task_id}=req.params;
    const getsubtasks=`SELECT title, due_date, tag FROM subtasks WHERE task_Id = "${task_id}" order by id ASC`;
    try {
        db.query(getsubtasks,(err, results) => {
            if (err) {
              return res.status(500).send({ auth: false, message: err.message });
            }
            res.status(201).json(results);
          }
        );
      } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error' });
      }
})
  
router.get('/total-working-hours/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;

    const query = `
 SELECT SUM(hours) AS total_hours
      FROM task_hours
      WHERE task_id = ?
    `;

    db.query(query, [task_id], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to execute query' });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res.status(404).json({ error: 'No working hours found for this task' });
      }

      const totalWorkingHours = results[0].total_hours;

      res.status(200).json({ total_working_hours: totalWorkingHours });
    });
  } catch (error) {
    console.error('Error calculating total working hours:', error);
    res.status(500).json({ error: 'Failed to calculate total working hours' });
  }
});


router.post('/working-hours', async (req, res) => {
  try {
    const { task_id, date, start_time, end_time } = req.body;

    // Input validation   
    if (!task_id || !date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert date to ISO format
    const workingDate = new Date(date).toISOString().split('T')[0];
    
    // SQL query to insert working hours
    const query = `
      INSERT INTO WorkingHours (task_id, working_date, start_time, end_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [task_id, workingDate, start_time, end_time];
    
    // Execute the query
    await db.query(query, values);

    res.status(201).json({ message: 'Working hours added successfully' });
  } catch (error) {
    console.error('Error adding working hours:', error);
    res.status(500).json({ error: 'Failed to add working hours' });
  }
});

// router.get('/report', async (req, res) => {
//   try {
//     const { task_name, start_date, end_date } = req.query;

//     // Validate query parameters
//     if (!task_name || !start_date || !end_date) {
//       return res.status(400).json({ error: 'Missing required query parameters' });
//     }    
//     const query = `
//       SELECT 
//         t.id,
//         t.title AS task_title, 
//         w.working_date, 
//         w.start_time, 
//         w.end_time, 
//         TIMESTAMPDIFF(MINUTE, w.start_time, w.end_time)/60 AS duration_hours
//       FROM 
//         WorkingHours w
//       JOIN 
//         tasks t ON w.task_id = t.id
//       WHERE 
//         t.title = ? 
//         AND w.working_date BETWEEN ? AND ?
//       ORDER BY 
//         w.working_date;
//     `;


//     db.query(query, [task_name, start_date, end_date], (err, results) => {
//       if (err) {
//         console.error('Error executing query:', err);
//         return res.status(500).json({ error: 'Failed to execute query' });
//       }

//       if (!Array.isArray(results) || results.length === 0) {
//         return res.status(404).json({ message: 'No records found for the given parameters' });
//       }
//       res.status(200).json(results);

//     });
//   }catch (error) {
//     console.error('Error fetching report:', error);AES

//     res.status(500).json({ error: 'Failed to fetch report' });
//   }
// });

router.get('/report', async (req, res) => {
  try {
    const { task_name, start_date, end_date } = req.query;

    if (!task_name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const query = `
      SELECT 
        t.id,
        t.title AS task_title, 
        th.date, 
        th.hours
      FROM 
        task_hours th
      JOIN 
        tasks t ON t.id = th.task_id 
      WHERE 
        t.title = ? 
        AND th.date BETWEEN ? AND ?
      ORDER BY 
        th.date;
    `;

    db.query(query, [task_name, start_date, end_date], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to execute query' });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res.status(404).json({ message: 'No records found for the given parameters' });
      }

      res.status(200).json(results);
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});



// router.post('/taskhours', async (req, res) => {
//   const { taskId, userId, date, hours } = req.body;

//   if (!taskId || !userId || !date || !hours) {
//     return res.status(400).json({ error: 'Missing required fields' });
//   }

//   try {
//     const query = `
//       INSERT INTO task_hours (task_id, user_id, date, hours)
//       VALUES (?, ?, ?, ?)
//       ON DUPLICATE KEY UPDATE hours = VALUES(hours), updated_at = CURRENT_TIMESTAMP
//     `;  

//     db.query(query, [taskId, userId, date, hours], (err, results) => {
//       if (err) {
//         console.error('Error executing query:', err);
//         return res.status(500).json({ error: 'Failed to save hours' });
//       }
//       res.status(200).json({ message: 'Hours saved successfully' });
//     });
//   } catch (error) {
//     console.error('Error saving hours:', error);
//     res.status(500).json({ error: 'Failed to save hours' });
//   }
// });

router.post('/taskhours', async (req, res) => {
  const { encryptedData } = req.body;

  // Check for missing encrypted data
  if (!encryptedData) {
    return res.status(400).json({ error: 'Missing encrypted data' });
  }

  try {
    const secret="secretKeysecretK";
    const bytes = CryptoJS.AES.decrypt(encryptedData, secret);
    const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    if (!decryptedData) {
      return res.status(400).json({ error: 'Decryption failed' });
    }

    // Parse the decrypted data
    const { taskId, userId, date, hours } = decryptedData;

    // Check for missing required fields
    if (!taskId || !userId || !date || !hours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // SQL query for inserting/updating task hours
    const query = `
      INSERT INTO task_hours (task_id, user_id, date, hours)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE hours = VALUES(hours), updated_at = CURRENT_TIMESTAMP
    `;

    // Execute the SQL query
    db.query(query, [taskId, userId, date, hours], (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to save hours' });
      }

      // Successful response message
      const response = { message: 'Hours saved successfully' };

      // Optionally encrypt the response (uncomment if needed)
      // const encryptedResponse = CryptoJS.AES.encrypt(JSON.stringify(response), process.env.AES_SECRET).toString();
      // return res.status(200).json({ encryptedResponse });

      // Send the plain response (if encryption is not needed)
      res.status(200).json(response);
    });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});
  

router.put('/updatetask/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const { stage } = req.body;

  logger.info(`Received PUT request to update task: taskId=${taskId}, newStage=${stage}`);

  try {
    const updateStatusQuery = `UPDATE tasks SET stage = ?, updatedAt = ? WHERE id = ?`;

    db.query(
      updateStatusQuery,
      [stage, new Date(), taskId],
      (err, result) => {
        if (err) {
          logger.error(`Error updating task status: taskId=${taskId}, error=${err.message}`);
          return res.status(500).json({
            success: false,
            error: 'Error updating task status',
            details: err.message,
          });
        }

        if (result.affectedRows === 0) {
          logger.warn(`Task not found: taskId=${taskId}`);
          return res.status(404).json({
            success: false,
            error: 'Task not found',
          });
        }

        logger.info(`Task status updated successfully: taskId=${taskId}, newStage=${stage}`);

        const assignedUsersQuery = `
          SELECT u.email, u.name 
          FROM users u
          JOIN TaskAssignments ta ON u._id = ta.user_id
          WHERE ta.task_id = ?
        `;

        db.query(assignedUsersQuery, [taskId], async (err, userResults) => {
          if (err) {
            logger.error(`Error fetching assigned user emails: taskId=${taskId}, error=${err.message}`);
            return res.status(500).json({
              success: false,
              error: 'Error fetching assigned user emails',
              details: err.message,
            });
          }

          const emails = userResults.map((user) => user.email);
          const userNames = userResults.map((user) => user.name);

          if (emails.length === 0) {
            logger.info(`No users assigned for taskId=${taskId}`);
            return res.status(200).json({
              success: true,
              message: 'Task status updated successfully',
              data: {
                taskId,
                newStage: stage,
              },
            });
          }

          logger.info(`Sending email notifications for taskId=${taskId} to users: ${emails.join(', ')}`);

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: emails,
            subject: `Task #${taskId} Status Updated`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h1 style="color: #1a73e8;">Task Status Updated!</h1>
                <p style="font-size: 18px;">Dear ${userNames.join(', ')},</p>
                <p style="font-size: 16px;">
                  The task with ID <strong style="color: #1a73e8;">${taskId}</strong> has been updated to: <strong>${stage}</strong>.
                  Please check your dashboard for more details.
                </p>
                <p style="font-size: 16px; color: #1a73e8;">Stay on track with your task deadlines!</p>
              </div>
            `,
          };

          try {
            await transporter.sendMail(mailOptions);
            logger.info(`Email notifications sent successfully for taskId=${taskId}`);
            res.status(200).json({
              success: true,
              message: 'Task status updated successfully and notifications sent',
              data: {
                taskId,
                newStage: stage,
                notifiedUsers: userNames,
              },
            });
          } catch (mailError) {
            logger.error(`Error sending email notifications: taskId=${taskId}, error=${mailError.message}`);
            res.status(200).json({
              success: true,
              message: 'Task status updated, but email notifications failed',
              data: {
                taskId,
                newStage: stage,
              },
              error: mailError.message,
            });
          }
        });
      }
    );
  } catch (error) {
    logger.error(`Unexpected error updating task status: taskId=${taskId}, error=${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Unexpected server error',
      details: error.message,
    });
  }
});







router.get('/fetchtaskhours', async (req, res) => {
  const { user_id} = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  try {
    const query = `
      SELECT t.id AS task_id, t.title AS task_title, th.date, th.hours
      FROM tasks t
      LEFT JOIN task_hours th ON t.id = th.task_id
      WHERE th.user_id = ?
      ORDER BY th.date;
    `;

    // WHERE th.user_id = ? AND th.date BETWEEN ? AND ?

    db.query(query, [user_id] ,(err, results) => {  
    // db.query(query, [user_id, start_date, end_date] ,(err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to execute query' });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res.status(404).json({ message: 'No records found for the given parameters' });
      }
      res.status(200).json(results);

    });
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Failed to fetch task hours' });  
  }
});




router.post('/tasks/:id/complete', async (req, res) => {
  const { id } = req.params;
  const taskQuery = `SELECT * FROM tasks WHERE id = ?`;
  const [tasks] = await db.execute(taskQuery, [id]);
  
  if (tasks.length === 0) return res.status(404).json({ message: 'Task not found' });

  const task = tasks[0];
  
  if (task.recurrence_type !== 'none') {
    let nextDueDate;
    switch (task.recurrence_type) {
      case 'daily':
        nextDueDate = dayjs(task.due_date).add(task.recurrence_interval, 'day');
        break;
      case 'weekly':
        nextDueDate = dayjs(task.due_date).add(task.recurrence_interval, 'week');
        break;
      case 'monthly':
        nextDueDate = dayjs(task.due_date).add(task.recurrence_interval, 'month');
        break;
    }
    
    if (!task.recurrence_end || dayjs(nextDueDate).isBefore(dayjs(task.recurrence_end))) {
      const insertQuery = `INSERT INTO tasks (title, description, due_date, recurrence_type, recurrence_interval, recurrence_end)
                           VALUES (?, ?, ?, ?, ?, ?)`;
      await db.execute(insertQuery, [task.title, task.description, nextDueDate.format('YYYY-MM-DD HH:mm:ss'), task.recurrence_type, task.recurrence_interval, task.recurrence_end]);
    }
  }
  
  res.json({ message: 'Task completed, recurrence handled if applicable' });
});


router.post('/taskdetail/Postactivity', (req, res) => {
  const { task_id, user_id, type, activity } = req.body;

  logger.info(`Received POST request to add task activity: task_id=${task_id}, user_id=${user_id}`);

  const sql = `
    INSERT INTO task_activities (task_id, user_id, type, activity)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [task_id, user_id, type, activity], (err, result) => {
    if (err) {
      logger.error(`Error inserting task activity: task_id=${task_id}, user_id=${user_id}, error=${err.message}`);
      return res.status(500).json({ error: 'Failed to add task activity.' });
    }

    logger.info(`Task activity added successfully: task_id=${task_id}, user_id=${user_id}, activity_id=${result.insertId}`);
    res.status(201).json({ message: 'Task activity added successfully.', id: result.insertId });
  });
});



router.get('/taskdetail/getactivity/:id', async (req, res) => {
  try {
    const { id } = req.params; // Extract the task_id from the URL params

    const sql = `
      SELECT 
        ta.type, 
        ta.activity, 
        ta.createdAt, 
        u.name AS user_name
      FROM task_activities ta
      INNER JOIN users u ON ta.user_id = u._id
      WHERE ta.task_id = ?
      ORDER BY ta.createdAt DESC
    `;

    // Execute the SQL query
    db.query(sql, [id], (err, result) => {
      if (err) {
        console.error('Error retrieving task activities:', err);
        return res.status(500).json({ error: 'Failed to fetch task activities.' });
      }

      // Send the retrieved activities as the response
      res.status(200).json(result);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});



// cron.schedule('* * * * *', () => {
//   console.log('Running task scheduler at per min...');
//   scheduleRecurringTasks();
// }, {
//   timezone: "Asia/Kolkata"
// });


module.exports = router;














