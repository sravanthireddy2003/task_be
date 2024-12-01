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


router.post('/createjson', async (req, res) => {
  try {
    const { assigned_to, priority, stage, taskDate, title, time_alloted, client_id } = req.body;

    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    // Validate input
    if (!title || !stage || !Array.isArray(assigned_to) || !client_id) {
      return res.status(400).send('Invalid input');
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

        // Insert task with client_id
        const insertTaskQuery = `
          INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(
          insertTaskQuery,
          [title, stage, taskDate, priority, createdAt, updatedAt, time_alloted, client_id],
          (err, result) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                console.error('Error inserting task:', err);
                return res.status(500).send('Error inserting task');
              });
            }

            const taskId = result.insertId;
            const taskAssignments = assigned_to.map(userId => [taskId, userId]);

            // Insert task assignments
            const insertTaskAssignmentsQuery = `
              INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

            connection.query(
              insertTaskAssignmentsQuery,
              [taskAssignments],
              async (err, result) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error('Error inserting task assignments:', err);
                    return res.status(500).send('Error inserting task assignments');
                  });
                }

                // Fetch emails of assigned users
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

                  // Send email notifications
                  const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                      user: process.env.EMAIL_USER, // Your email
                      pass: process.env.EMAIL_PASS, // Your email password
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
                          Please check your dashboard for more details.
                        </p>

                        <div style="text-align: center; margin: 20px 0;">
                          <img 
                            src="https://img.freepik.com/free-vector/hand-drawn-business-planning-with-task-list_23-2149164275.jpg"
                            alt="Task Assigned" 
                            style="width: 100%; max-width: 400px; height: auto;" />
                        </div>

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
      });
    });
  } catch (error) {
    console.error('Error in task creation process:', error);
    return res.status(500).send('Error in task creation process');
  }
});




// NO client
// router.post('/createjson', async (req, res) => {
//   try {
//     const { assigned_to, priority, stage, taskDate, title, time_alloted } = req.body;

//     const createdAt = new Date().toISOString();
//     const updatedAt = createdAt;

//     if (!title || !stage || !Array.isArray(assigned_to)) {
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

//         const insertTaskQuery = `
//           INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, time_alloted) 
//           VALUES (?, ?, ?, ?, ?, ?, ?)`;

//         connection.query(
//           insertTaskQuery,
//           [title, stage, taskDate, priority, createdAt, updatedAt, time_alloted],
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

//                 // **Fetch emails of assigned users**
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

//                   // **Send email notifications**
//                   const transporter = nodemailer.createTransport({
//                     service: 'gmail',
//                     auth: {
//                       user: process.env.EMAIL_USER, // Your email
//                       pass: process.env.EMAIL_PASS, // Your email passwor
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
router.get("/gettaskss", (req, res) => {
  const { userId, isAdmin } = req.query;
  let query = `
      SELECT 
          t.id AS task_id, 
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
          TaskAssignments ta ON t.id = ta.task_id
      LEFT JOIN 
          users u ON ta.user_id = u._id
  `;

  // If the user is not an admin, restrict the query to tasks where the user is assigned
  // if (parseInt(isAdmin, 10) !== 1) {
  //     query += ` WHERE t.id IN (
  //         SELECT task_id FROM TaskAssignments WHERE user_id = ?
  //     )`;
  // }

  // query += ` ORDER BY t.id;`;

  // const queryParams = parseInt(isAdmin, 10) === 1 ? [] : [userId];


  if (![1, 2].includes(parseInt(isAdmin, 10))) {
    query += ` WHERE t.id IN (
        SELECT task_id FROM TaskAssignments WHERE user_id = ?
    )`;
}

query += ` ORDER BY t.id;`;

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


// for all tasks Not-in-Use
router.get("/gettasks", (req, res) => {
    const query = `
        SELECT 
            t.id AS task_id, 
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
            TaskAssignments ta ON t.id = ta.task_id
        LEFT JOIN 
            users u ON ta.user_id = u._id
        ORDER BY 
            t.id;
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
          t.title, 
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
            console.error('Error deleting task:', err);
            return res.status(500).send({ success: false, message: 'Database error', error: err.message });
          }
      
          if (result.affectedRows === 0) {
            return res.status(404).send({ success: false, message: 'Task not found' });
          }
      
          return res.status(200).send({ success: true, message: 'Task and its assignments deleted successfully' });
        });
});

router.post('/createsub/:task_id', async (req, res) => {
    const { task_id } = req.params;
    const { title, due_date, tag } = req.body;
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;
  
    if (!title || !due_date || !tag) {
      return res.status(400).send('Invalid input');
    }
  
    const insertsubTaskQuery = `
      INSERT INTO subtasks (task_id, title, due_date, tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`;
    
    
    try {
      db.query(
        insertsubTaskQuery,
        [task_id, title, due_date, tag, createdAt, updatedAt],
        (err, results) => {
          if (err) {
            return res.status(500).send({ auth: false, message: err.message });
          }
          res.status(201).json({ id: results.insertId, task_id, title, due_date, tag, created_at: createdAt, updated_at: updatedAt });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error' });
    }
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
  console.log('Updating task stage:', stage);

  try {
    const updateStatusQuery = `UPDATE tasks SET stage = ?, updatedAt = ? WHERE id = ?`;

    db.query(
      updateStatusQuery,
      [stage, new Date(), taskId],
      (err, result) => {
        if (err) {
          console.error('Error updating task status:', err);
          return res.status(500).json({ 
            success: false,
            error: 'Error updating task status',
            details: err.message 
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ 
            success: false,
            error: 'Task not found' 
          });
        }

        const assignedUsersQuery = `
          SELECT u.email, u.name 
          FROM users u
          JOIN TaskAssignments ta ON u._id = ta.user_id
          WHERE ta.task_id = ?
        `;

        db.query(assignedUsersQuery, [taskId], async (err, userResults) => {
          if (err) {
            console.error('Error fetching assigned user emails:', err);
            return res.status(500).json({ 
              success: false,
              error: 'Error fetching assigned user emails',
              details: err.message 
            });
          }

          const emails = userResults.map(user => user.email);
          const userNames = userResults.map(user => user.name);

          // If no users assigned, just return task update success
          if (emails.length === 0) {
            return res.status(200).json({ 
              success: true,
              message: 'Task status updated successfully',
              data: { 
                taskId, 
                newStage: stage 
              }
            });
          }

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
            console.log('Email notifications sent successfully');
            
            // Send success response with task and email notification details
            res.status(200).json({ 
              success: true,
              message: 'Task status updated successfully and notifications sent',
              data: { 
                taskId, 
                newStage: stage,
                notifiedUsers: userNames
              }
            });
          } catch (mailError) {
            console.error('Error sending email notifications:', mailError);
            
            // Even if email fails, return task update success
            res.status(200).json({ 
              success: true,
              message: 'Task status updated, but email notifications failed',
              data: { 
                taskId, 
                newStage: stage 
              },
              error: mailError.message
            });
          }
        });
      }
    );
  } catch (error) {
    console.error('Unexpected error updating task status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unexpected server error',
      details: error.message 
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





async function scheduleRecurringTasks() {
  try {
    const now = new Date();

    const fetchTasksQuery = `
      SELECT * FROM tasks 
      WHERE recurrence_type IS NOT NULL 
      AND recurrence_end > ?`; 

    db.query(fetchTasksQuery, [now], (err, tasks) => {
      if (err) {
        console.error('Error fetching tasks for recurrence:', err);
        return;
      }

      tasks.forEach(task => {
        const { id, title, stage, taskDate, priority, time_alloted, recurrence_type, recurrence_interval, recurrence_end } = task;

        // Calculate next task date based on recurrence
        let nextTaskDate;
        if (recurrence_type === 'daily') {
          nextTaskDate = new Date(taskDate);
          nextTaskDate.setDate(nextTaskDate.getDate() + recurrence_interval);
        }
         else if (recurrence_type === 'weekly') {
          nextTaskDate = new Date(taskDate);
          nextTaskDate.setDate(nextTaskDate.getDate() + 7 * recurrence_interval);
        } 
        else if (recurrence_type === 'monthly') {
          nextTaskDate = new Date(taskDate);
          nextTaskDate.setMonth(nextTaskDate.getMonth() + recurrence_interval);
        }

        if (nextTaskDate > new Date(recurrence_end)) {
          return;
        }

        const insertTaskQuery = `
          INSERT INTO tasks (title, stage, taskDate, priority, createdAt, recurrence_type, recurrence_interval, recurrence_end, updatedAt, time_alloted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.query(insertTaskQuery, [
          title, stage, nextTaskDate, priority, new Date(), recurrence_type, recurrence_interval, recurrence_end, new Date(), time_alloted
        ], (err, result) => {
          if (err) {
            console.error('Error inserting new recurring task:', err);
            return;
          }

          const taskId = result.insertId;

          // Fetch and copy the task assignments to the new task
          const fetchAssignmentsQuery = `SELECT user_id FROM TaskAssignments WHERE task_id = ?`;
          db.query(fetchAssignmentsQuery, [id], (err, assignments) => {
            console.log(assignments);
            if (err) {
              console.error('Error fetching task assignments:', err);
              return;
            }

            const taskAssignments = assignments.map(assignment => [taskId, assignment.user_id]);

            const insertTaskAssignmentsQuery = `INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

            db.query(insertTaskAssignmentsQuery, [taskAssignments], (err) => {
              if (err) {
                console.error('Error inserting task assignments for recurring task:', err);
              }
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Error scheduling recurring tasks:', error);
  }
}


// cron.schedule('* * * * *', () => {
//   console.log('Running task scheduler at per min...');
//   scheduleRecurringTasks();
// }, {
//   timezone: "Asia/Kolkata"
// });


module.exports = router;













