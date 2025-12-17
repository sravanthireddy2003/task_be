const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const emailService = require(__root + 'utils/emailService');
const tenantMiddleware = require(__root + 'middleware/tenant');
const upload = require("../multer");
const { storage } = require("./utils/Firestore");
const cloudinary = require("cloudinary");
const multer = require("multer");
const { ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const CryptoJS = require("crypto-js");
const cron = require("node-cron");
const winston = require("winston");
const { google } = require("googleapis");
const dayjs = require('dayjs');

// enforce tenant + auth for all task routes
router.use(tenantMiddleware);
router.use(requireAuth);

async function createJsonHandler(req, res) {
  try {
    const {
      assigned_to,
      assignedTo,
      priority,
      stage,
      taskDate,
      dueDate,
      title,
      description,
      time_alloted,
      estimatedHours,
      client_id,
      projectId,
      projectPublicId,
    } = req.body;

    // normalize fields to canonical names used downstream
    let finalAssigned = assigned_to;
    if ((!Array.isArray(finalAssigned) || finalAssigned.length === 0) && assignedTo) {
      if (Array.isArray(assignedTo)) finalAssigned = assignedTo;
      else if (typeof assignedTo === 'string') finalAssigned = assignedTo.split(',').map(s => s.trim()).filter(Boolean);
    }

    const finalTaskDate = taskDate || dueDate || null;
    const finalTimeAlloted = time_alloted || estimatedHours || null;

    let finalClientId = client_id || null;

    const createdAt = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).toISOString();
    const updatedAt = createdAt;

    // default stage to TODO when not provided by frontend
    const normalizedStage = stage || 'TODO';
    // normalize priority to uppercase so checks like === 'HIGH' work
    const priorityNorm = priority ? String(priority).toUpperCase() : null;

    if (!title) {
      return res.status(400).send("Missing required field: title");
    }

    if (!Array.isArray(finalAssigned) || finalAssigned.length === 0) {
      return res.status(400).send("assigned_to must be a non-empty array of user IDs (or assignedTo)");
    }

    db.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting database connection:", err);
        return res.status(500).send("Database connection error");
      }

      // resolve client_id and project details from projectId or projectPublicId when missing
      let finalProjectId = projectId || null;
      let finalProjectPublicId = projectPublicId || null;
      
      const resolveClientId = (cb) => {
        if (finalClientId) return cb(null, finalClientId);
        if (!projectId && !projectPublicId) return cb(new Error('missing_client_and_project'));
        const q = `SELECT id, public_id, client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1`;
        connection.query(q, [projectId || null, projectPublicId || null], (qErr, rows) => {
          if (qErr) return cb(qErr);
          if (!rows || rows.length === 0) return cb(new Error('project_not_found'));
          finalProjectId = rows[0].id;
          finalProjectPublicId = rows[0].public_id;
          return cb(null, rows[0].client_id);
        });
      };

      resolveClientId((resolveErr, resolvedCid) => {
        if (resolveErr) {
          connection.release();
          console.error('Error resolving client_id from project identifiers:', resolveErr && resolveErr.message);
          return res.status(400).send('Missing required fields: client_id or valid projectId/projectPublicId');
        }
        finalClientId = resolvedCid;

        connection.beginTransaction((err) => {
          if (err) {
            connection.release();
            console.error("Error starting transaction:", err);
            return res.status(500).send("Error starting transaction");
          }

          const checkHighPriorityQuery = `
            SELECT COUNT(*) as highPriorityCount, priority as existingPriority, taskDate as existingTaskDate 
            FROM tasks 
            WHERE client_id = ? AND priority = 'HIGH'
          `;

          connection.query(checkHighPriorityQuery, [finalClientId], (checkErr, checkResults) => {
            if (checkErr) {
              return connection.rollback(() => {
                connection.release();
                console.error("Error checking high priority tasks:", checkErr);
                return res.status(500).send("Error checking existing tasks");
              });
            }

            const highPriorityCount = checkResults[0].highPriorityCount;
            let finalPriority = priorityNorm;
            let adjustedTaskDate = finalTaskDate;

            if (priorityNorm === "HIGH" && highPriorityCount > 0) {
              const existingTaskDate = new Date(checkResults[0].existingTaskDate);
              const currentDate = new Date();
              const daysDifference = Math.ceil((existingTaskDate - currentDate) / (1000 * 60 * 60 * 24));

              let dateAdjustmentDays = 0;
              if (checkResults[0].existingPriority === "LOW") {
                dateAdjustmentDays = Math.ceil(daysDifference * 1.5);
              } else if (checkResults[0].existingPriority === "MEDIUM") {
                dateAdjustmentDays = Math.ceil(daysDifference * 1.2);
              }

              adjustedTaskDate = new Date(existingTaskDate);
              adjustedTaskDate.setDate(adjustedTaskDate.getDate() + dateAdjustmentDays);

              const updateExistingTaskQuery = `
                UPDATE tasks 
                SET priority = 'MEDIUM', updatedAt = ?, taskDate = ?
                WHERE client_id = ? AND priority = 'HIGH'
              `;

              connection.query(updateExistingTaskQuery, [updatedAt, adjustedTaskDate.toISOString(), finalClientId], (updateErr) => {
                if (updateErr) {
                  return connection.rollback(() => {
                    connection.release();
                    console.error("Error updating existing high priority task:", updateErr);
                    return res.status(500).send("Error managing task priorities");
                  });
                }

                continueTaskCreation(req, connection, { ...req.body, assigned_to: finalAssigned, stage: normalizedStage, taskDate: adjustedTaskDate.toISOString(), time_alloted: finalTimeAlloted, client_id: finalClientId, projectId: finalProjectId, projectPublicId: finalProjectPublicId }, createdAt, updatedAt, "HIGH", res);
              });
            } else {
              continueTaskCreation(req, connection, { ...req.body, assigned_to: finalAssigned, stage: normalizedStage, taskDate: adjustedTaskDate, time_alloted: finalTimeAlloted, client_id: finalClientId, projectId: finalProjectId, projectPublicId: finalProjectPublicId }, createdAt, updatedAt, finalPriority, res);
            }
          });
        });
      });
    });
  } catch (error) {
    console.error("Error in task creation process:", error);
    return res.status(500).send("Error in task creation process");
  }
}

router.post('/createjson', requireRole(['Admin','Manager']), createJsonHandler);
router.post('/', requireRole(['Admin','Manager']), createJsonHandler);



async function continueTaskCreation(req, connection, body, createdAt, updatedAt, finalPriority, res) {
  const {
    assigned_to,
    stage,
    taskDate,
    title,
    description,
    time_alloted,
    client_id,
    projectId,
    projectPublicId,
    estimated_hours,
    status,
  } = body;

  // Build INSERT dynamically: only include project reference columns if they exist
  const checkColumn = (col) => new Promise((resolve) => {
    connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = ?", [col], (err, rows) => {
      if (err) return resolve(false);
      return resolve(Array.isArray(rows) && rows.length > 0);
    });
  });

  const projectIdColExists = await checkColumn('project_id');
  const projectPublicColExists = await checkColumn('project_public_id');

  const cols = ['title', 'description', 'stage', 'taskDate', 'priority', 'createdAt', 'updatedAt', 'time_alloted', 'estimated_hours', 'status', 'client_id'];
  const placeholders = cols.map(() => '?');
  const values = [title, description, stage, taskDate, finalPriority, createdAt, updatedAt, time_alloted, estimated_hours || time_alloted || null, status || null, client_id];

  if (projectIdColExists) {
    cols.push('project_id');
    placeholders.push('?');
    values.push(projectId || null);
  }
  if (projectPublicColExists) {
    cols.push('project_public_id');
    placeholders.push('?');
    values.push(projectPublicId || null);
  }

  const insertTaskQuery = `INSERT INTO tasks (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;

  connection.query(insertTaskQuery, values, (err, result) => {
      if (err) {
        return connection.rollback(() => {
          connection.release();
          console.error("Error inserting task:", err);
          return res.status(500).json({ error: "Error inserting task" });
        });
      }

      const taskId = result.insertId;

      if (!taskId || !Array.isArray(assigned_to) || assigned_to.length === 0) {
        return connection.rollback(() => {
          connection.release();
          console.error("Invalid task ID or assigned_to array");
          return res.status(500).json({ error: "Invalid task assignment data" });
        });
      }

      // Resolve assigned user identifiers (frontend may send public_id strings)
      const rawAssigned = Array.isArray(assigned_to) ? assigned_to.slice() : [];

      // Separate numeric IDs and non-numeric (assumed public_id)
      const numericIds = rawAssigned.filter(v => String(v).match(/^\d+$/)).map(v => Number(v));
      const publicIds = rawAssigned.filter(v => !String(v).match(/^\d+$/));

      // Build query to fetch internal _id values for provided identifiers
      const resolveQueries = [];
      const resolveParams = [];
      if (publicIds.length > 0) {
        resolveQueries.push(`SELECT _id, public_id FROM users WHERE public_id IN (?)`);
        resolveParams.push([publicIds]);
      }
      if (numericIds.length > 0) {
        resolveQueries.push(`SELECT _id, public_id FROM users WHERE _id IN (?)`);
        resolveParams.push([numericIds]);
      }

      let resolvedUserIds = [];
      if (resolveQueries.length === 0) {
        return connection.rollback(() => {
          connection.release();
          console.error("No assigned users provided or invalid format");
          return res.status(400).json({ error: "No assigned users provided or invalid format" });
        });
      }

      // Run resolve queries sequentially and collect internal IDs
      const runResolveQuery = (idx) => {
        if (idx >= resolveQueries.length) {
          // dedupe
          resolvedUserIds = Array.from(new Set(resolvedUserIds));
          if (resolvedUserIds.length === 0) {
            return connection.rollback(() => {
              connection.release();
              console.error("Assigned users not found in users table");
              return res.status(400).json({ error: "Assigned users not found" });
            });
          }

          const taskAssignments = resolvedUserIds.map((userId) => [taskId, userId]);
          const insertTaskAssignmentsQuery = `INSERT INTO taskassignments (task_id, user_id) VALUES ${taskAssignments.map(() => "(?, ?)").join(", ")}`;
          const flattenedValues = taskAssignments.flat();

          connection.query(
            insertTaskAssignmentsQuery,
            flattenedValues,
            (err, result) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  console.error("Error inserting task assignments:", err);
                  return res.status(500).json({ error: "Error inserting task assignments" });
                });
              }

              const userEmailsQuery = `SELECT email, name FROM users WHERE _id IN (?)`;

              connection.query(
                userEmailsQuery,
                [resolvedUserIds],
                async (err, userResults) => {
                  if (err) {
                    return connection.rollback(() => {
                      connection.release();
                      console.error("Error fetching user emails:", err);
                      return res.status(500).json({ error: "Error fetching user emails" });
                    });
                  }

                  const emails = userResults.map((user) => user.email);
                  const userNames = userResults.map((user) => user.name);

                  try {
                    const emailService = require(__root + 'utils/emailService');
                    const assignedBy = (req.user && req.user.name) || 'System';
                    const link = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/tasks/${taskId}`;
                    const tpl = emailService.taskAssignedTemplate({ taskTitle: title, assignedBy, link, assignedTo: emails.join(', ') });
                    await emailService.sendEmail({ to: emails, subject: tpl.subject, text: tpl.text, html: tpl.html });
                    console.log('Emails (task assigned) sent (or logged)');
                  } catch (mailError) {
                    console.error('Error sending emails:', mailError && mailError.message);
                  }

                  connection.commit((err) => {
                    if (err) {
                      return connection.rollback(() => {
                        connection.release();
                        console.error("Error committing transaction:", err);
                        return res.status(500).json({ error: "Error committing transaction" });
                      });
                    }

                    connection.release();
                    return res.status(201).json({
                      message: "Task created and email notifications sent successfully",
                      taskId,
                      assignedUsers: assigned_to,
                    });
                  });
                }
              );
            }
          );
          return;
        }

        connection.query(resolveQueries[idx], resolveParams[idx], (err, rows) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              console.error("Error resolving assigned users:", err);
              return res.status(500).json({ error: "Error resolving assigned users" });
            });
          }
          if (Array.isArray(rows) && rows.length > 0) {
            for (const r of rows) resolvedUserIds.push(r._id);
          }
          runResolveQuery(idx + 1);
        });
      };

      runResolveQuery(0);
    }
  );
}

router.get("/taskdropdown", async (req, res) => {
  try {
    const query = "SELECT id, title FROM tasks";
    db.query(query, (err, results) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to fetch tasks" });
      }
      if (!Array.isArray(results)) {
        console.error("Query result is not an array:", results);
        return res
          .status(500)
          .json({ error: "Unexpected query result format" });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

// GET /api/projects/tasks?project_id=123 or ?projectPublicId=abc
// Returns tasks for the specified project (uses auth user from middleware)
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const projectParam = req.query.project_id || req.query.projectId || req.query.projectPublicId || req.body && (req.body.project_id || req.body.project_public_id || req.body.projectPublicId);
    if (!projectParam) return res.status(400).json({ success: false, error: 'project_id or projectPublicId query parameter required' });

    // helper: check if a column exists in the current database
    const hasColumn = (table, column) => new Promise((resolve) => {
      db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column], (err, rows) => {
        if (err) return resolve(false);
        return resolve(Array.isArray(rows) && rows.length > 0);
      });
    });

    const tasksHasProjectId = await hasColumn('tasks', 'project_id');
    const tasksHasProjectPublicId = await hasColumn('tasks', 'project_public_id');

    // If caller passed a public id (non-numeric), resolve it to internal project id first
    let resolvedProjectId = projectParam;
    if (!/^\d+$/.test(String(projectParam))) {
      try {
        const projRows = await new Promise((resolve, reject) => db.query('SELECT id, public_id FROM projects WHERE public_id = ? LIMIT 1', [projectParam], (err, r) => err ? reject(err) : resolve(r)));
        if (!projRows || projRows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
        resolvedProjectId = projRows[0].id;
      } catch (err) {
        logger.error('Error resolving project public_id: ' + (err && err.message));
        return res.status(500).json({ success: false, error: 'Failed resolving project id' });
      }
    }

    // Build SQL depending on which project link column exists on tasks
    let sql;
    let params = [];

    if (tasksHasProjectId) {
      sql = `
        SELECT
          t.id AS task_internal_id,
          t.public_id AS task_id,
          t.title,
          t.description,
          t.stage,
          t.taskDate,
          t.priority,
          t.time_alloted,
          t.estimated_hours,
          t.status,
          t.createdAt,
          t.updatedAt,
          c.id AS client_id,
          c.name AS client_name,
          GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
          GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
          GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
        FROM tasks t
        LEFT JOIN clientss c ON t.client_id = c.id
        LEFT JOIN taskassignments ta ON ta.task_id = t.id
        LEFT JOIN users u ON u._id = ta.user_id
        WHERE t.project_id = ?
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `;
      params = [resolvedProjectId];
    } else if (tasksHasProjectPublicId) {
      // If tasks stores project_public_id, determine the public id to search for
      let projectPublicIdToUse = projectParam;
      if (/^\d+$/.test(String(projectParam))) {
        // caller passed numeric project id; fetch its public_id
        try {
          const r = await new Promise((resolve, reject) => db.query('SELECT public_id FROM projects WHERE id = ? LIMIT 1', [projectParam], (err, rr) => err ? reject(err) : resolve(rr)));
          if (!r || r.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
          projectPublicIdToUse = r[0].public_id;
        } catch (err) {
          logger.error('Error resolving project id->public_id: ' + (err && err.message));
          return res.status(500).json({ success: false, error: 'Failed resolving project public id' });
        }
      }

      sql = `
        SELECT
          t.id AS task_internal_id,
          t.public_id AS task_id,
          t.title,
          t.description,
          t.stage,
          t.taskDate,
          t.priority,
          t.time_alloted,
          t.estimated_hours,
          t.status,
          t.createdAt,
          t.updatedAt,
          c.id AS client_id,
          c.name AS client_name,
          GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
          GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
          GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
        FROM tasks t
        LEFT JOIN clientss c ON t.client_id = c.id
        LEFT JOIN taskassignments ta ON ta.task_id = t.id
        LEFT JOIN users u ON u._id = ta.user_id
        WHERE t.project_public_id = ?
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `;
      params = [projectPublicIdToUse];
    } else {
      // No project link on tasks table — cannot filter by project
      return res.status(500).json({ success: false, error: 'Cannot filter tasks by project: tasks table has no project_id or project_public_id column' });
    }

    db.query(sql, params, (err, rows) => {
      if (err) {
        logger.error('Fetch project tasks error: ' + err.message);
        return res.status(500).json({ success: false, error: err.message });
      }

      const tasks = (rows || []).map(r => {
        const assignedIds = r.assigned_user_ids ? String(r.assigned_user_ids).split(',') : [];
        const assignedPublic = r.assigned_user_public_ids ? String(r.assigned_user_public_ids).split(',') : [];
        const assignedNames = r.assigned_user_names ? String(r.assigned_user_names).split(',') : [];

        const assignedUsers = assignedIds.map((uid, i) => ({
          id: assignedPublic[i] || uid,
          internalId: String(uid),
          name: assignedNames[i] || null
        }));

        return {
          id: r.task_id ? String(r.task_id) : String(r.task_internal_id),
          title: r.title || null,
          description: r.description || null,
          stage: r.stage || null,
          taskDate: r.taskDate ? new Date(r.taskDate).toISOString() : null,
          priority: r.priority || null,
          timeAlloted: r.time_alloted != null ? Number(r.time_alloted) : null,
          estimatedHours: r.estimated_hours != null ? Number(r.estimated_hours) : (r.time_alloted != null ? Number(r.time_alloted) : null),
          status: r.status || null,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
          client: r.client_id ? { id: r.client_id, name: r.client_name } : null,
          assignedUsers
        };
      });

      return res.json({ success: true, data: tasks, meta: { count: tasks.length } });
    });
  } catch (e) {
    logger.error('Error in project tasks endpoint: ' + (e && e.message));
    return res.status(500).json({ success: false, error: e.message });
  }
});

router.get("/taskdropdownfortaskHrs", async (req, res) => {
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
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to fetch tasks" });
      }
      if (!Array.isArray(results)) {
        console.error("Query result is not an array:", results);
        return res
          .status(500)
          .json({ error: "Unexpected query result format" });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get("/gettaskss", (req, res) => {
  // Use authenticated user for access control
  const user = req.user;
  const role = user && user.role;

  // optional filter: ?userId=<public_id|internal_id>
  const filterUserParam = req.query.userId;

  const buildAndRun = (resolvedUserId) => {
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
          taskassignments ta ON t.id = ta.task_id
      LEFT JOIN 
          users u ON ta.user_id = u._id
      LEFT JOIN 
          clientss c ON t.client_id = c.id
    `;

    // User access control: Employee sees assigned tasks only
    if (role === 'Employee') {
      query += ` WHERE t.id IN (
          SELECT task_id FROM taskassignments WHERE user_id = ?
      )`;
    }

    // If a filter user id provided (admin/manager usage), apply it
    if (resolvedUserId && role !== 'Employee') {
      // if query already has WHERE, append AND to filter assigned user
      if (query.includes('WHERE')) {
        query = query.replace(/ORDER BY[\s\S]*$/m, '');
        query += ` AND t.id IN (SELECT task_id FROM taskassignments WHERE user_id = ?)`;
      } else {
        query += ` WHERE t.id IN (SELECT task_id FROM taskassignments WHERE user_id = ?)`;
      }
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

    const queryParams = role === 'Employee' ? [resolvedUserId] : (resolvedUserId ? [resolvedUserId] : []);

    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error("Error fetching tasks:", err);
        return res.status(500).send("Error fetching tasks");
      }

      const tasks = {};
      results.forEach((row) => {
        if (!tasks[row.task_id]) {
          tasks[row.task_id] = {
            task_id: row.task_id,
            client_name: row.client_name,
            title: row.title,
            description: row.description,
            stage: row.stage,
            taskDate: row.taskDate,
            priority: row.priority,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            assigned_users: [],
          };
        }

        if (row.user_id) {
          tasks[row.task_id].assigned_users.push({
            user_id: row.user_id,
            user_name: row.user_name,
            user_role: row.user_role,
          });
        }
      });
  
      // map assigned user internal ids to external public_id when available
      try {
        const userIds = new Set();
        Object.values(tasks).forEach(t => t.assigned_users.forEach(u => { if (u.user_id) userIds.add(u.user_id); }));
        if (userIds.size > 0) {
          const idsArr = Array.from(userIds);
          db.query('SELECT _id, public_id FROM users WHERE _id IN (?)', [idsArr], (errU, rowsU) => {
                if (!errU && Array.isArray(rowsU)) {
                  const map = {};
                  rowsU.forEach(r => { if (r && r._id) map[r._id] = r.public_id || r._id; });
                  Object.values(tasks).forEach(t => {
                    t.assigned_users = t.assigned_users.map(u => ({ user_id: map[u.user_id] || u.user_id, user_name: u.user_name, user_role: u.user_role }));
                  });
                }
            // continue sorting and response regardless of mapping errors
            const sortedTasks = Object.values(tasks).sort((a, b) => {
              const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
              const stageOrder = { TODO: 1, IN_PROGRESS: 2, COMPLETED: 3 };

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
          return;
        }
      } catch (e) {
        // ignore mapping errors and fall back to original data
      }

      // Optional: Additional client-side sorting as a fallback
      const sortedTasks = Object.values(tasks).sort((a, b) => {
        const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
        const stageOrder = { TODO: 1, IN_PROGRESS: 2, COMPLETED: 3 };

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
  };

  // If a filter user id is provided and it's a public_id, resolve to internal _id first
  if (filterUserParam) {
    const isNumeric = /^\d+$/.test(String(filterUserParam));
    if (isNumeric) {
      buildAndRun(filterUserParam);
      return;
    }
    // resolve public_id -> _id
    db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error resolving userId', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found for provided userId' });
      const resolved = rows[0]._id;
      buildAndRun(resolved);
    });
    return;
  }

  // No filter param, run with current authenticated user context
  const currentUserInternal = user && user._id;
  buildAndRun(currentUserInternal);
});

router.get("/gettasks", (req, res) => {
  const authUser = req.user;
  const role = authUser && authUser.role;

  // optional filter param: userId (can be public_id or numeric _id)
  const filterUserParam = req.query.userId;

  const buildAndRun = (resolvedUserId) => {
    let query = `
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
    `;

    // If employee, restrict to assigned tasks
    if (role === 'Employee') {
      query = `
      SELECT 
         t.id AS task_id, c.name AS client_name, t.title, t.stage, t.taskDate, t.priority, t.createdAt, t.updatedAt, u._id AS user_id, u.name AS user_name, u.role AS user_role
      FROM tasks t
      JOIN taskassignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u._id
      LEFT JOIN clientss c ON t.client_id = c.id
      WHERE ta.user_id = ?
      ORDER BY t.createdAt
    `;
    }

    // If filter provided and caller is not Employee, apply assigned-user filter
    if (resolvedUserId && role !== 'Employee') {
      // replace trailing ORDER BY to append filter
      query = query.replace(/ORDER BY[\s\S]*$/m, '');
      query += ` WHERE t.id IN (SELECT task_id FROM taskassignments WHERE user_id = ?)`;
      query += ` ORDER BY t.createdAt`;
    }

    const params = role === 'Employee' ? [resolvedUserId] : (resolvedUserId ? [resolvedUserId] : []);

    db.query(query, params, (err, results) => {
      if (err) {
        console.error("Error fetching tasks:", err);
        return res.status(500).send("Error fetching tasks");
      }

      // Group the results by task
      const tasks = {};
      results.forEach((row) => {
        if (!tasks[row.task_id]) {
          tasks[row.task_id] = {
            task_id: row.task_id,
            client_name: row.client_name,
            title: row.title,
            stage: row.stage,
            taskDate: row.taskDate,
            priority: row.priority,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            assigned_users: [],
          };
        }

        if (row.user_id) {
          tasks[row.task_id].assigned_users.push({
            user_id: row.user_id,
            user_name: row.user_name,
            user_role: row.user_role,
          });
        }
      });

      // Map assigned internal ids to public_id where available
      try {
        const userIds = new Set();
        Object.values(tasks).forEach(t => t.assigned_users.forEach(u => { if (u.user_id) userIds.add(u.user_id); }));
        if (userIds.size > 0) {
          const idsArr = Array.from(userIds);
          db.query('SELECT _id, public_id FROM users WHERE _id IN (?)', [idsArr], (errU, rowsU) => {
            if (!errU && Array.isArray(rowsU)) {
              const map = {};
              rowsU.forEach(r => { if (r && r._id) map[r._id] = r.public_id || r._id; });
              Object.values(tasks).forEach(t => {
                t.assigned_users = t.assigned_users.map(u => ({ user_id: map[u.user_id] || u.user_id, user_name: u.user_name, user_role: u.user_role }));
              });
            }
            return res.status(200).json(Object.values(tasks));
          });
          return;
        }
      } catch (e) {
        // ignore mapping errors
      }

      res.status(200).json(Object.values(tasks));
    });
  };

  // If filter param provided, resolve public_id -> _id if needed
  if (filterUserParam) {
    const isNumeric = /^\d+$/.test(String(filterUserParam));
    if (isNumeric) { buildAndRun(filterUserParam); return; }
    db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error resolving userId', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found for provided userId' });
      buildAndRun(rows[0]._id);
    });
    return;
  }

  // Default: use authenticated user internal id for employee filtering
  const currentUserInternal = authUser && authUser._id;
  buildAndRun(currentUserInternal);
});

router.get("/gettaskbyId/:task_id", (req, res) => {
  const { task_id } = req.params;
  const user = req.user;
  const role = user && user.role;
  const userId = user && (user._id || user.loginId);

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
          taskassignments ta ON t.id = ta.task_id
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
      console.error("Error fetching task:", err);
      return res.status(500).send("Error fetching task");
    }

    if (results.length === 0) {
      return res.status(404).send("Task not found");
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
      time_alloted: results[0].time_alloted, // Include time_alloted in response
      assigned_users: [],
    };

    results.forEach((row) => {
      if (row.user_id) {
        task.assigned_users.push({
          user_id: row.user_id,
          user_name: row.user_name,
          user_role: row.user_role,
        });
      }
    });

    // If employee, ensure the task is assigned to them
    if (role === 'Employee') {
      const assigned = task.assigned_users.some(u => String(u.user_id) === String(userId));
      if (!assigned) return res.status(403).json({ message: 'Forbidden' });
    }

    res.status(200).json(task);
  });
});

router.delete("/deltask/:task_id", requireRole(['Admin','Manager']), (req, res) => {
  const { task_id } = req.params;

  db.getConnection((err, connection) => {
    if (err) {
      console.error('DB connection error on delete:', err);
      return res.status(500).json({ success: false, message: 'DB connection error' });
    }

    connection.beginTransaction((err) => {
      if (err) {
        connection.release();
        console.error('Error starting transaction for delete:', err);
        return res.status(500).json({ success: false, message: 'Transaction error' });
      }

      const tasksToRun = [
        { sql: 'DELETE FROM taskassignments WHERE task_id = ?', params: [task_id] },
        { sql: 'DELETE FROM task_assignments WHERE task_id = ?', params: [task_id] },
        { sql: 'DELETE FROM subtasks WHERE task_id = ?', params: [task_id] },
        { sql: 'DELETE FROM task_hours WHERE task_id = ?', params: [task_id] },
        { sql: 'DELETE FROM task_activities WHERE task_id = ?', params: [task_id] },
        { sql: 'DELETE FROM tasks WHERE id = ?', params: [task_id] },
      ];

      const runStep = (idx) => {
        if (idx >= tasksToRun.length) {
          connection.commit((err) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                console.error('Error committing delete transaction:', err);
                return res.status(500).json({ success: false, message: 'Commit error' });
              });
            }
            connection.release();
            return res.status(200).json({ success: true, message: 'Task and related data deleted successfully' });
          });
          return;
        }

        const step = tasksToRun[idx];
        connection.query(step.sql, step.params, (qErr, qRes) => {
          if (qErr) {
            return connection.rollback(() => {
              connection.release();
              console.error('Error during delete step:', qErr);
              return res.status(500).json({ success: false, message: 'Delete failed', error: qErr.message });
            });
          }
          runStep(idx + 1);
        });
      };

      runStep(0);
    });
  });
});

router.post("/createsub/:task_id", requireRole(['Admin','Manager','Employee']), (req, res) => {
  const { task_id } = req.params;
  const { title, due_date, tag } = req.body;
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;

  if (!title || !due_date || !tag) {
    logger.warn(`Invalid input provided for task_id: ${task_id}`);
    return res.status(400).send({ success: false, message: "Invalid input" });
  }

  const insertSubTaskQuery = `
        INSERT INTO subtasks (task_id, title, due_date, tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`;

  // Execute query
  db.query(
    insertSubTaskQuery,
    [task_id, title, due_date, tag, createdAt, updatedAt],
    (err, results) => {
      if (err) {
        logger.error(
          `Error inserting subtask for task_id: ${task_id} - ${err.message}`
        );
        return res
          .status(500)
          .send({
            success: false,
            message: "Database error",
            error: err.message,
          });
      }

      // Success response
      logger.info(
        `Subtask created successfully for task_id: ${task_id}, subtask_id: ${results.insertId}`
      );
      return res.status(201).json({
        success: true,
        message: "Subtask created successfully",
        data: {
          id: results.insertId,
          task_id,
          title,
          due_date,
          tag,
          created_at: createdAt,
          updated_at: updatedAt,
        },
      });
    }
  );
});

router.get("/getsubtasks/:task_id", (req, res) => {
  const { task_id } = req.params;
  const getsubtasks = `SELECT title, due_date, tag FROM subtasks WHERE task_Id = "${task_id}" order by id ASC`;
  try {
    db.query(getsubtasks, (err, results) => {
      if (err) {
        return res.status(500).send({ auth: false, message: err.message });
      }
      res.status(201).json(results);
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/total-working-hours/:task_id", async (req, res) => {
  try {
    const { task_id } = req.params;

    const query = `
 SELECT SUM(hours) AS total_hours
      FROM task_hours
      WHERE task_id = ?
    `;

    db.query(query, [task_id], (err, results) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to execute query" });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res
          .status(404)
          .json({ error: "No working hours found for this task" });
      }

      const totalWorkingHours = results[0].total_hours;

      res.status(200).json({ total_working_hours: totalWorkingHours });
    });
  } catch (error) {
    console.error("Error calculating total working hours:", error);
    res.status(500).json({ error: "Failed to calculate total working hours" });
  }
});

router.post("/working-hours", requireRole(['Admin','Manager','Employee']), async (req, res) => {
  try {
    const { task_id, date, start_time, end_time } = req.body;

    // Input validation
    if (!task_id || !date || !start_time || !end_time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Convert date to ISO format
    const workingDate = new Date(date).toISOString().split("T")[0];

    // SQL query to insert working hours
    const query = `
      INSERT INTO WorkingHours (task_id, working_date, start_time, end_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [task_id, workingDate, start_time, end_time];

    // Execute the query
    await db.query(query, values);

    res.status(201).json({ message: "Working hours added successfully" });
  } catch (error) {
    console.error("Error adding working hours:", error);
    res.status(500).json({ error: "Failed to add working hours" });
  }
});

router.get("/report", async (req, res) => {
  try {
    const { task_name, start_date, end_date } = req.query;

    if (!task_name || !start_date || !end_date) {
      return res
        .status(400)
        .json({ error: "Missing required query parameters" });
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
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to execute query" });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res
          .status(404)
          .json({ message: "No records found for the given parameters" });
      }

      res.status(200).json(results);
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.post("/taskhours", requireRole(['Admin','Manager','Employee']), async (req, res) => {
  const { encryptedData } = req.body;

  // Check for missing encrypted data
  if (!encryptedData) {
    return res.status(400).json({ error: "Missing encrypted data" });
  }

  try {
    const secret = "secretKeysecretK";
    const bytes = CryptoJS.AES.decrypt(encryptedData, secret);
    const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    if (!decryptedData) {
      return res.status(400).json({ error: "Decryption failed" });
    }

    // Parse the decrypted data
    const { taskId, userId, date, hours } = decryptedData;

    // Check for missing required fields
    if (!taskId || !userId || !date || !hours) {
      return res.status(400).json({ error: "Missing required fields" });
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
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to save hours" });
      }

      // Successful response message
      const response = { message: "Hours saved successfully" };
      res.status(200).json(response);
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

router.put("/updatetask/:id", requireRole(['Admin','Manager']), async (req, res) => {
  const { id: taskId } = req.params;
  const {
    stage,
    title,
    priority,
    description,
    client_id,
    taskDate,
    time_alloted,
    assigned_to,
  } = req.body;

  logger.info(`Updating task: taskId=${taskId}`);

  try {
    const updateTaskQuery = `
      UPDATE tasks
      SET
        stage = ?,
        title = ?,
        priority = ?,
        description = ?,
        client_id = ?,
        taskDate = ?,
        time_alloted = ?,
        updatedAt = ?
      WHERE id = ?
    `;

    db.query(
      updateTaskQuery,
      [stage, title, priority, description, client_id, taskDate, time_alloted, new Date(), taskId],
      (err, result) => {
        if (err) {
          logger.error(`Error updating task: ${err.message}`);
          return res.status(500).json({ success: false, error: 'Database update error' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, error: 'Task not found' });
        }

        // Update assigned users if provided
        if (Array.isArray(assigned_to)) {
          const deleteQuery = `DELETE FROM taskassignments WHERE task_id = ?`;
          db.query(deleteQuery, [taskId], (delErr) => {
            if (delErr) {
              logger.error(`Error clearing task assignments: ${delErr.message}`);
            } else if (assigned_to.length > 0) {
              const insertQuery = `INSERT INTO taskassignments (task_id, user_id) VALUES ?`;
              const values = assigned_to.map((userId) => [taskId, userId]);
              db.query(insertQuery, [values], (insErr) => {
                if (insErr) {
                  logger.error(`Error assigning users: ${insErr.message}`);
                }
              });
            }
          });
        }

        logger.info(`Task status updated successfully: taskId=${taskId}, newStage=${stage}`);

        const assignedUsersQuery = `
          SELECT u.email, u.name 
          FROM users u
          JOIN taskassignments ta ON u._id = ta.user_id
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

          try {
            const emailService = require(__root + 'utils/emailService');
            const tpl = emailService.taskStatusTemplate({ taskId, stage, userNames });
            await emailService.sendEmail({ to: emails, subject: tpl.subject, text: tpl.text, html: tpl.html });
            logger.info(`Email notifications (status update) sent (or logged) for taskId=${taskId}`);
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
            logger.error(`Error sending email notifications: taskId=${taskId}, error=${mailError && mailError.message}`);
            res.status(200).json({
              success: true,
              message: 'Task status updated, but email notifications failed',
              data: {
                taskId,
                newStage: stage,
                notifiedUsers: userNames,
              },
              error: mailError && mailError.message,
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

router.get("/fetchtaskhours", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const query = `
      SELECT t.id AS task_id, t.title AS task_title, th.date, th.hours
      FROM tasks t
      LEFT JOIN task_hours th ON t.id = th.task_id
      WHERE th.user_id = ?
      ORDER BY th.date;
    `;

    db.query(query, [user_id], (err, results) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).json({ error: "Failed to execute query" });
      }

      if (!Array.isArray(results) || results.length === 0) {
        return res
          .status(404)
          .json({ message: "No records found for the given parameters" });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Failed to fetch task hours" });
  }
});

router.post("/tasks/:id/complete", async (req, res) => {
  const { id } = req.params;
  const taskQuery = `SELECT * FROM tasks WHERE id = ?`;
  const [tasks] = await db.execute(taskQuery, [id]);

  if (tasks.length === 0)
    return res.status(404).json({ message: "Task not found" });

  const task = tasks[0];

  if (task.recurrence_type !== "none") {
    let nextDueDate;
    switch (task.recurrence_type) {
      case "daily":
        nextDueDate = dayjs(task.due_date).add(task.recurrence_interval, "day");
        break;
      case "weekly":
        nextDueDate = dayjs(task.due_date).add(
          task.recurrence_interval,
          "week"
        );
        break;
      case "monthly":
        nextDueDate = dayjs(task.due_date).add(
          task.recurrence_interval,
          "month"
        );
        break;
    }

    if (
      !task.recurrence_end ||
      dayjs(nextDueDate).isBefore(dayjs(task.recurrence_end))
    ) {
      const insertQuery = `INSERT INTO tasks (title, description, due_date, recurrence_type, recurrence_interval, recurrence_end)
                           VALUES (?, ?, ?, ?, ?, ?)`;
      await db.execute(insertQuery, [
        task.title,
        task.description,
        nextDueDate.format("YYYY-MM-DD HH:mm:ss"),
        task.recurrence_type,
        task.recurrence_interval,
        task.recurrence_end,
      ]);
    }
  }

  res.json({ message: "Task completed, recurrence handled if applicable" });
});

router.post("/taskdetail/Postactivity", (req, res) => {
  const { task_id, user_id, type, activity } = req.body;

  logger.info(
    `Received POST request to add task activity: task_id=${task_id}, user_id=${user_id}`
  );

  const sql = `
    INSERT INTO task_activities (task_id, user_id, type, activity)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [task_id, user_id, type, activity], (err, result) => {
    if (err) {
      logger.error(
        `Error inserting task activity: task_id=${task_id}, user_id=${user_id}, error=${err.message}`
      );
      return res.status(500).json({ error: "Failed to add task activity." });
    }

    logger.info(
      `Task activity added successfully: task_id=${task_id}, user_id=${user_id}, activity_id=${result.insertId}`
    );
    res
      .status(201)
      .json({
        message: "Task activity added successfully.",
        id: result.insertId,
      });
  });
});

router.get("/taskdetail/getactivity/:id", async (req, res) => {
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
        console.error("Error retrieving task activities:", err);
        return res
          .status(500)
          .json({ error: "Failed to fetch task activities." });
      }

      // Send the retrieved activities as the response
      res.status(200).json(result);
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

module.exports = router;