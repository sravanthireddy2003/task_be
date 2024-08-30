const db = require(__root + "db");
const express = require("express");
const router = express.Router();
const verify = require('./VerifyToken');
// const upload = require('../multer');
const cloudinary = require('cloudinary');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });    

cloudinary.config({
  cloud_name: 'dp420iv8q',
  api_key: '718878522412418',
  api_secret: 'oL0lbwEOJiSrRjJk7WKZpNPD2YI'
});

router.post('/create', upload.array('assets', 10), async (req, res) => {
  try {
    const { assigned_to, priority, stage, taskDate, title, time_alloted } = req.body;
    const files = req.files;

    console.log('Request Body:', req.body);
    console.log('Uploaded Files:', files);

    let results = [];

    if (files && files.length > 0) {

      results = await Promise.all(
        files.map(async (file) => {
          try {
            console.log('Before Cloudinary Upload');
            const result = await cloudinary.uploader.upload(file.path);
            console.log('File uploaded to Cloudinary:', result);
            return { url: result.secure_url, public_id: result.public_id };
          } catch (uploadError) {
            console.error('Error uploading file to Cloudinary:', uploadError);
          }
        })
      );
    } else {
      console.log('No files uploaded.');
    }

    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    if (!title || !stage || !Array.isArray(assigned_to)) {
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

        const insertTaskQuery = `
          INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt, assets, time_alloted) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(
          insertTaskQuery,
          [title, stage, taskDate, priority, createdAt, updatedAt, JSON.stringify(results), time_alloted],
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

            const insertTaskAssignmentsQuery = `
              INSERT INTO TaskAssignments (task_id, user_id) VALUES ?`;

            connection.query(
              insertTaskAssignmentsQuery,
              [taskAssignments],
              (err, result) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error('Error inserting task assignments:', err);
                    return res.status(500).send('Error inserting task assignments');
                  });
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
                  res.status(201).send('Task created successfully');
                });
              }
            );
          }
        );
      });
    });

  } catch (error) {
    console.error('Error in file upload process:', error);
    return res.status(500).send('Error in file upload process');
  }
});

router.get('/taskdropdown', async (req, res) => {
  try {
    const query = 'SELECT id, title FROM tasks';
    
    // Execute the query
    db.query(query, (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to fetch tasks' });
      }

      // Check if results is an array
      if (!Array.isArray(results)) {  
        console.error('Query result is not an array:', results);
        return res.status(500).json({ error: 'Unexpected query result format' });
      }

      // Send results as response
      res.status(200).json(results);
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});


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
      SELECT SEC_TO_TIME(SUM(TIMESTAMPDIFF(SECOND, start_time, end_time))) as total_time 
      FROM WorkingHours 
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

      const totalWorkingHours = results[0].total_time;

      res.status(200).json({ total_working_hours: totalWorkingHours });
    });
  } catch (error) {
    console.error('Error calculating total working hours:', error);
    res.status(500).json({ error: 'Failed to calculate total working hours' });
  }
});


// SELECT 
//     task_id,
//     SEC_TO_TIME(SUM(TIME_TO_SEC(TIMEDIFF(end_time, start_time)))) AS total_time_spent
// FROM 
//     WorkingHours
// WHERE 
//     task_id = ?
// GROUP BY 
//     task_id;


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





router.get('/report', async (req, res) => {
  try {
    const { task_name, start_date, end_date } = req.query;

    // Validate query parameters
    if (!task_name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }    
    const query = `
      SELECT 
        t.id,
        t.title AS task_title, 
        w.working_date, 
        w.start_time, 
        w.end_time, 
        TIMESTAMPDIFF(MINUTE, w.start_time, w.end_time)/60 AS duration_hours
      FROM 
        WorkingHours w
      JOIN 
        tasks t ON w.task_id = t.id
      WHERE 
        t.title = ? 
        AND w.working_date BETWEEN ? AND ?
      ORDER BY 
        w.working_date;
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
  }catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});


module.exports = router;













