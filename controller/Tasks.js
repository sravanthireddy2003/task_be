const db = require(__root + "db");
const express = require("express");
const router = express.Router();
const verify=require('./VerifyToken')


router.post("/create", (req, res) => {
    const { 
        assigned_to,
        priority, 
        stage,
        taskDate, 
        title,
    } = req.body;

    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    if (!title || !stage || !Array.isArray(assigned_to)) {
        return res.status(400).send('Invalid input');
    }
    
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting connection:', err);
            return res.status(500).send('Database connection error');
        }

        connection.beginTransaction((err) => {
            if (err) {
                connection.release();
                console.error('Error starting transaction:', err);
                return res.status(500).send('Error starting transaction');
            }

            const insertTaskQuery = `
                INSERT INTO tasks (title, stage, taskDate, priority, createdAt, updatedAt) 
                VALUES (?, ?, ?, ?, ?, ?)`;

            connection.query(
                insertTaskQuery,
                [title, stage, taskDate, priority, createdAt, updatedAt],
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


// router.get("/getsubtasks",(req,res)=>{
//     const {task_id}=req.params;
//     const getsubtasks=`SELECT title, due_date, tag FROM subtasks order by id ASC`;
//     try {
//         db.query(getsubtasks,(err, results) => {
//             if (err) {
//               return res.status(500).send({ auth: false, message: err.message });
//             }
//             res.status(201).json(results);
//           }
//         );
//       } catch (err) {
//         console.error(err.message);
//         res.status(500).json({ error: 'Server error' });
//       }
// })
  


      








module.exports = router;













