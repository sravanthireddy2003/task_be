
const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const crypto = require('crypto');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const ruleEngine = require(__root + 'middleware/ruleEngine');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const emailService = require(__root + 'utils/emailService');
const tenantMiddleware = require(__root + 'middleware/tenant');
const upload = require("../multer");
const multer = require("multer");
const CryptoJS = require("crypto-js");
const dayjs = require('dayjs');
// Convert various JS Date/ISO inputs to MySQL DATETIME format `YYYY-MM-DD HH:MM:SS`
const toMySQLDate = (d) => {
  if (d === null || d === undefined) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};
const NotificationService = require(__root + 'services/notificationService');
const workflowService = require(__root + 'workflow/workflowService');
const { check } = require('express-validator');
const validateRequest = require(__root + 'middleware/validateRequest');
router.use(requireAuth);        // ✅ Sets req.user from JWT
router.use(tenantMiddleware); 

const hasColumn = (table, column) => new Promise((resolve) => {
  db.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column],
    (err, rows) => {
      if (err) return resolve(false);
      return resolve(Array.isArray(rows) && rows.length > 0);
    }
  );
});

async function ensureProjectOpen(projectId) {
  if (!projectId) return;
  try {
    const rows = await q('SELECT status FROM projects WHERE id = ? LIMIT 1', [projectId]);
    if (!rows || rows.length === 0) return; // no project found - upstream validations will handle
    const st = rows[0].status;
    const statusUpper = st ? String(st).toUpperCase() : '';
    if (statusUpper === 'CLOSED' || statusUpper === 'PENDING_FINAL_APPROVAL') {
      const err = new Error('Project is closed or pending final approval. Tasks are locked and cannot be modified.');
      err.status = 403;
      throw err;
    }
  } catch (e) {
    throw e;
  }
}

async function assigneeHasActiveTask(userId) {
  if (!userId) return false;
  const rows = await q(
    `SELECT COUNT(*) as cnt FROM taskassignments ta JOIN tasks t ON ta.task_Id = t.id WHERE ta.user_Id = ? AND (t.status IS NULL OR UPPER(t.status) != 'COMPLETED') AND (ta.is_read_only IS NULL OR ta.is_read_only != 1)`,
    [userId]
  );
  return (rows && rows[0] && Number(rows[0].cnt || 0) > 0);
}

const q = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, results) => {
    if (err) reject(err);
    else resolve(results);
  });
});

// Safe email send: validate, ensure recipient exists in users table, send and log failures.
async function safeSendEmailForTask(taskId, recipientEmail, emailPayload) {
  try {
    if (!recipientEmail || typeof recipientEmail !== 'string') return false;
    const email = recipientEmail.trim();
    // basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // ensure email belongs to a user in DB
    const rows = await q('SELECT _id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows || rows.length === 0) {
      logger.warn(`Skipping email for task=${taskId}, recipient=${email} (not found in users table)`);
      return false;
    }

    // attempt send
    try {
      await emailService.sendEmail(Object.assign({ to: email }, emailPayload));
      return true;
    } catch (sendErr) {
      logger.error(`Email send failed for task=${taskId}, recipient=${email}: ${sendErr && sendErr.message}`);
      return false;
    }
  } catch (err) {
    logger.error(`Email validation/send error for task=${taskId}, recipient=${recipientEmail}: ${err && err.message}`);
    return false;
  }
}

async function ensureTaskTimeLogsTable() {
  try {
    const tableExists = await q(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'task_time_logs'
    `);
    
    if (tableExists[0].count === 0) {
      await q(`
        CREATE TABLE task_time_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          task_id INT NOT NULL,
          user_id INT NOT NULL,
          action ENUM('start', 'pause', 'resume', 'complete', 'reassign') NOT NULL,
          timestamp DATETIME NOT NULL,
          duration INT NULL,
          INDEX idx_task_time_logs_task_id (task_id),
          INDEX idx_task_time_logs_timestamp (timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      logger.info('Created task_time_logs table');
    }
  } catch (e) {
    logger.warn('Failed to ensure task_time_logs table: ' + e.message);
  }
}

async function canEditTask(taskId, user) {

  if (user.role === 'Admin' || user.role === 'Manager') return true;

  const hasReadOnlyColumn = await hasColumn('taskassignments', 'is_read_only');
  const selectColumns = hasReadOnlyColumn ? 'user_Id, is_read_only' : 'user_Id';
  const [assignment] = await q(`SELECT ${selectColumns} FROM taskassignments WHERE task_Id = ? AND user_Id = ?`, [taskId, user._id]);
  if (!assignment) return false;

  if (hasReadOnlyColumn && assignment.is_read_only) return false;

  const [task] = await q('SELECT is_locked FROM tasks WHERE id = ?', [taskId]);
  if (!task) return false;
  if (!task.is_locked) return true;

  return assignment.user_id === user._id;
}

const getLastAction = async (taskId, userId) => {
  const rows = await q('SELECT action FROM task_time_logs WHERE task_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 1', [taskId, userId]);
  return rows.length > 0 ? rows[0].action : null;
};

router.use(tenantMiddleware);



router.post('/selected-details', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const taskIds = req.body.taskIds || req.body.task_ids || [];
    if (!Array.isArray(taskIds) || taskIds.length === 0) return res.status(400).json({ success: false, error: 'taskIds (array) required' });

    const numericIds = taskIds.filter(id => /^\d+$/.test(String(id))).map(Number);
    const publicIds = taskIds.filter(id => !/^\d+$/.test(String(id)));
    const allIds = [...numericIds, ...publicIds];
    if (allIds.length === 0) return res.status(400).json({ success: false, error: 'No valid task IDs provided' });
    const subtaskCreatorColumnExists = await hasColumn('subtasks', 'created_by');

    let internalIds = numericIds;
    if (publicIds.length > 0) {
      const publicToInternal = await new Promise((resolve, reject) => db.query('SELECT id FROM tasks WHERE public_id IN (?)', [publicIds], (e, r) => e ? reject(e) : resolve(r)));
      internalIds = [...internalIds, ...publicToInternal.map(row => row.id)];
    }
    const whereClause = 'WHERE t.id IN (?)';
    const queryParams = [internalIds];

    let optionalSelect = '';
    try {
      const cols = [];
      if (await hasColumn('tasks', 'started_at')) cols.push('t.started_at');
      if (await hasColumn('tasks', 'live_timer')) cols.push('t.live_timer');
      if (await hasColumn('tasks', 'total_duration')) cols.push('t.total_duration');
      if (await hasColumn('tasks', 'completed_at')) cols.push('t.completed_at');
      if (await hasColumn('tasks', 'approved_by')) cols.push('t.approved_by');
      if (await hasColumn('tasks', 'approved_at')) cols.push('t.approved_at');
      if (await hasColumn('tasks', 'rejection_reason')) cols.push('t.rejection_reason');
      if (await hasColumn('tasks', 'rejected_by')) cols.push('t.rejected_by');
      if (await hasColumn('tasks', 'rejected_at')) cols.push('t.rejected_at');
      if (cols.length) optionalSelect = ', ' + cols.join(', ');
    } catch (e) {  }

    const sql = `
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
        t.updatedAt${optionalSelect},
        MIN(c.id) AS client_id,
        MIN(c.name) AS client_name,
        MIN(ap.name) AS approved_by_name,
        MIN(ap.public_id) AS approved_by_public_id,
        MIN(rj.name) AS rejected_by_name,
        MIN(rj.public_id) AS rejected_by_public_id,
        GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
        GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
        GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names,
        GROUP_CONCAT(DISTINCT COALESCE(ta.is_read_only, 0)) AS assigned_user_read_only
      FROM tasks t
      LEFT JOIN clientss c ON t.client_id = c.id
      LEFT JOIN users ap ON t.approved_by = ap._id
      LEFT JOIN users rj ON t.rejected_by = rj._id
      LEFT JOIN taskassignments ta ON ta.task_Id = t.id
      LEFT JOIN users u ON u._id = ta.user_Id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.createdAt DESC
    `;

    db.query(sql, queryParams, async (err, rows) => {
      if (err) {
        logger.error('selected-details fetch error: ' + (err && err.message));
        return res.status(500).json({ success: false, error: err.message });
      }

      const creatorSelect = subtaskCreatorColumnExists
        ? ', creator._id AS creator_internal_id, creator.public_id AS creator_public_id, creator.name AS creator_name'
        : '';
      const creatorJoin = subtaskCreatorColumnExists ? 'LEFT JOIN users creator ON creator._id = s.created_by' : '';
      const subtaskQuery = `
        SELECT s.*${creatorSelect}
        FROM subtasks s
        ${creatorJoin}
        WHERE s.task_id IN (?)
        ORDER BY s.created_at ASC
      `;
      const subtasks = await new Promise((resolve, reject) => db.query(
        subtaskQuery,
        [internalIds], (e, r) => e ? reject(e) : resolve(r)
      ));

      const activities = await new Promise((resolve, reject) => db.query(
        `SELECT ta.task_id, ta.type, ta.activity, ta.createdAt, u._id AS user_id, u.public_id AS user_public_id, u.name AS user_name
         FROM task_activities ta
         LEFT JOIN users u ON ta.user_id = u._id
         WHERE ta.task_id IN (?)
         ORDER BY ta.createdAt DESC`,
        [internalIds], (e, r) => e ? reject(e) : resolve(r)
      ));

      const hours = await new Promise((resolve, reject) => db.query(
        'SELECT task_id, SUM(hours) AS total_hours FROM task_hours WHERE task_id IN (?) GROUP BY task_id',
        [internalIds], (e, r) => e ? reject(e) : resolve(r)
      ));

      let files = [];
      try {
        files = await new Promise((resolve, reject) => db.query(
          `SELECT id, task_id, file_url, file_name, file_type, uploaded_at FROM task_documents WHERE task_id IN (?) AND is_active = 1 ORDER BY uploaded_at DESC`,
          [internalIds], (e, r) => e ? reject(e) : resolve(r)
        ));
      } catch (fileErr) {

        files = [];
      }

      const filesMap = {};
      (files || []).forEach(f => {
        if (!f || f.task_id === undefined || f.task_id === null) return;
        const k = String(f.task_id);
        if (!filesMap[k]) filesMap[k] = [];
        filesMap[k].push({ id: f.id != null ? String(f.id) : null, url: f.file_url || null, name: f.file_name || null, type: f.file_type || null, uploadedAt: f.uploaded_at ? new Date(f.uploaded_at).toISOString() : null });
      });

      const checklistMap = {};
      (subtasks || []).forEach((s) => {
        if (!s) return;
        const rawTaskId = (s.task_id !== undefined && s.task_id !== null) ? s.task_id
          : (s.task_Id !== undefined && s.task_Id !== null) ? s.task_Id
          : (s.taskId !== undefined && s.taskId !== null) ? s.taskId
          : (s.task !== undefined && s.task !== null) ? s.task
          : null;
        if (rawTaskId === null) return;
        const key = String(rawTaskId);
        if (!checklistMap[key]) checklistMap[key] = [];
        const checklistItem = {
          id: s.id != null ? String(s.id) : null,
          title: s.title || null,
          description: s.description || null,
          status: s.status || null,
          tag: s.tag || null,
          dueDate: (s.due_date || s.dueDate) ? new Date(s.due_date || s.dueDate).toISOString() : null,
          estimatedHours: (s.estimated_hours != null) ? Number(s.estimated_hours) : (s.estimatedHours != null ? Number(s.estimatedHours) : null),
          completedAt: (s.completed_at || s.completedAt) ? new Date(s.completed_at || s.completedAt).toISOString() : null,
          createdAt: (s.created_at || s.createdAt) ? new Date(s.created_at || s.createdAt).toISOString() : null,
          updatedAt: (s.updated_at || s.updatedAt) ? new Date(s.updated_at || s.updatedAt).toISOString() : null
        };
        if (subtaskCreatorColumnExists) {
          const creatorInternalId = s.creator_internal_id != null ? String(s.creator_internal_id) : (s.created_by != null ? String(s.created_by) : null);
          const creatorPublicId = s.creator_public_id || null;
          const creatorName = s.creator_name || null;
          if (creatorInternalId || creatorPublicId || creatorName) {
            checklistItem.user = {
              id: creatorPublicId || creatorInternalId || null,
              internalId: creatorInternalId,
              name: creatorName
            };
          } else {
            checklistItem.user = null;
          }
        }
        checklistMap[key].push(checklistItem);
      });

      const activitiesMap = {};
      (activities || []).forEach(activity => {
        if (!activity || activity.task_id === undefined || activity.task_id === null) return;
        const key = String(activity.task_id);
        if (!activitiesMap[key]) activitiesMap[key] = [];
        const userInfo = activity.user_id
          ? {
              id: activity.user_public_id || String(activity.user_id),
              internalId: String(activity.user_id),
              name: activity.user_name || null
            }
          : null;
        activitiesMap[key].push({
          type: activity.type || null,
          activity: activity.activity || null,
          createdAt: activity.createdAt ? new Date(activity.createdAt).toISOString() : null,
          user: userInfo
        });
      });

      const hoursMap = {};
      (hours || []).forEach(h => { hoursMap[String(h.task_id)] = Number(h.total_hours || 0); });

      const tasks = (rows || []).map(r => {
        const assignedIds = r.assigned_user_ids ? String(r.assigned_user_ids).split(',') : [];
        const assignedPublic = r.assigned_user_public_ids ? String(r.assigned_user_public_ids).split(',') : [];
        const assignedNames = r.assigned_user_names ? String(r.assigned_user_names).split(',') : [];
        const assignedReadOnly = r.assigned_user_read_only ? String(r.assigned_user_read_only).split(',') : [];

        const assignedUsers = assignedIds.map((uid, i) => ({
          id: assignedPublic[i] || uid,
          internalId: String(uid),
          name: assignedNames[i] || null,
          readOnly: assignedReadOnly[i] === '1' || assignedReadOnly[i] === 'true'
        }));
        const key = String(r.task_internal_id || r.task_id);
        return {
          id: String(r.task_internal_id),
          title: r.title || null,
          description: r.description || null,
          stage: r.stage || null,
          taskDate: r.taskDate ? new Date(r.taskDate).toISOString() : null,
          day: r.taskDate ? (new Date(r.taskDate).toISOString().split('T')[0]) : null,
          dayName: r.taskDate ? dayjs(r.taskDate).format('ddd') : null,
          priority: r.priority || null,
          timeAlloted: r.time_alloted != null ? Number(r.time_alloted) : null,
          estimatedHours: r.estimated_hours != null ? Number(r.estimated_hours) : (r.time_alloted != null ? Number(r.time_alloted) : null),
          status: r.status || null,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
          client: r.client_id ? { id: String(r.client_id), name: r.client_name } : null,
          assignedUsers,
          checklist: checklistMap[key] || checklistMap[String(r.task_id)] || checklistMap[String(r.task_internal_id)] || [],
          activities: activitiesMap[key] || activitiesMap[String(r.task_id)] || activitiesMap[String(r.task_internal_id)] || [],
          files: filesMap[key] || filesMap[String(r.task_id)] || filesMap[String(r.task_internal_id)] || [],
          totalHours: hoursMap[key] != null ? hoursMap[key] : 0,
          started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
          live_timer: r.live_timer ? new Date(r.live_timer).toISOString() : null,
          total_time_seconds: (r.total_duration != null) ? Number(r.total_duration) : (hoursMap[key] != null ? Number(hoursMap[key]) * 3600 : 0),
          total_time_hours: Number(((r.total_duration != null ? Number(r.total_duration) : (hoursMap[key] != null ? Number(hoursMap[key]) * 3600 : 0)) / 3600).toFixed(2)),
          total_time_hhmmss: (() => {
            try {
              const total = (r.total_duration != null) ? Number(r.total_duration) : (hoursMap[key] != null ? Number(hoursMap[key]) * 3600 : 0);
              const hh = String(Math.floor(total / 3600)).padStart(2, '0');
              const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
              const ss = String(total % 60).padStart(2, '0');
              return `${hh}:${mm}:${ss}`;
            } catch (e) { return '00:00:00'; }
          })(),
          completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
          approved_by: r.approved_by_name ? {
            id: r.approved_by_public_id,
            name: r.approved_by_name
          } : null,
          approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
          rejection: r.rejection_reason ? {
            reason: r.rejection_reason,
            rejected_by: r.rejected_by_name ? {
              id: r.rejected_by_public_id,
              name: r.rejected_by_name
            } : null,
            rejected_at: r.rejected_at ? new Date(r.rejected_at).toISOString() : null
          } : null,
          summary: (() => {
            try {
              const now = new Date();
              const est = r.taskDate ? new Date(r.taskDate) : null;
              if (!est) return {};
              return { dueStatus: est < now ? 'Overdue' : 'On Time', dueDate: est.toISOString() };
            } catch (e) { return {}; }
          })()
        };
      });

      return res.json({ success: true, data: tasks, meta: { count: tasks.length } });
    });
  } catch (e) {
    logger.error('Error in selected-details endpoint: ' + (e && e.message));
    return res.status(500).json({ success: false, error: e && e.message });
  }
});

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

    const normalizedStage = stage || 'TODO';

    const priorityNorm = priority ? String(priority).toUpperCase() : 'MEDIUM';

    if (!title) {
      return res.status(400).send("Missing required field: title");
    }

    if (!finalAssigned || (Array.isArray(finalAssigned) && finalAssigned.length !== 1) || (!Array.isArray(finalAssigned) && !finalAssigned)) {
      return res.status(400).send("assigned_to must contain exactly one user ID (single-user ownership required)");
    }

    if (!Array.isArray(finalAssigned)) {
      finalAssigned = [finalAssigned];
    }

    db.getConnection((err, connection) => {
      if (err) {
        logger.error('Database connection error:', err);
        return res.status(500).send("Database connection error");
      }

      let finalProjectId = null;
      let finalProjectPublicId = null;
      if (projectId) {
        if (/^\d+$/.test(String(projectId))) {
          finalProjectId = Number(projectId);
        } else {
          finalProjectPublicId = projectId;
        }
      }
      if (projectPublicId) {
        finalProjectPublicId = projectPublicId;
      }

      const resolveProjectAndClient = (cb) => {
        if (finalClientId && !finalProjectId && !finalProjectPublicId) return cb(null, finalClientId);
        if (!finalProjectId && !finalProjectPublicId) return cb(new Error('missing_client_and_project'));
        
        logger.info('Resolving project details:', { finalProjectId, finalProjectPublicId });
        
        const q = `SELECT id, public_id, client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1`;
        connection.query(q, [finalProjectId || null, finalProjectPublicId || null], (qErr, rows) => {
          if (qErr) {
            logger.error('Error resolving project:', qErr);
            return cb(qErr);
          }
          logger.debug('Project resolution result:', rows);
          if (!rows || rows.length === 0) return cb(new Error('project_not_found'));
          finalProjectId = rows[0].id;
          finalProjectPublicId = rows[0].public_id;
          finalClientId = finalClientId || rows[0].client_id;
          return cb(null, finalClientId);
        });
      };

      resolveProjectAndClient((resolveErr, resolvedCid) => {
        if (resolveErr) {
          connection.release();
          logger.error('Client resolution error:', resolveErr);
          return res.status(400).send('Missing required fields: client_id or valid projectId/projectPublicId');
        }
        finalClientId = resolvedCid;

        logger.debug('Resolved values:', {
          finalClientId,
          finalProjectId,
          finalProjectPublicId,
          finalAssigned,
          title,
          normalizedStage,
          priorityNorm,
          finalTaskDate,
          finalTimeAlloted
        });

        connection.beginTransaction((err) => {
          if (err) {
            connection.release();
            logger.error('Transaction error:', err);
            return res.status(500).send("Error starting transaction");
          }

          const checkHighPriorityQuery = `
            SELECT COUNT(*) as highPriorityCount FROM tasks 
            WHERE client_id = ? AND priority = 'HIGH'
          `;

          connection.query(checkHighPriorityQuery, [finalClientId], (checkErr, checkResults) => {
            if (checkErr) {
              logger.error('Error checking high priority tasks:', checkErr);
              return connection.rollback(() => {
                connection.release();
                return res.status(500).send("Error checking existing tasks");
              });
            }

            const highPriorityCount = checkResults[0]?.highPriorityCount || 0;
            let finalPriority = priorityNorm;
            let adjustedTaskDate = finalTaskDate;

            logger.debug('High priority check:', { highPriorityCount, finalPriority, finalTaskDate });

            if (priorityNorm === "HIGH" && highPriorityCount > 0) {

              const getExistingQuery = `
                SELECT priority as existingPriority, taskDate as existingTaskDate 
                FROM tasks 
                WHERE client_id = ? AND priority = 'HIGH' LIMIT 1
              `;
              connection.query(getExistingQuery, [finalClientId], (getErr, getResults) => {
                if (getErr) {
                  logger.error('Error getting existing task details:', getErr);
                  return connection.rollback(() => {
                    connection.release();
                    return res.status(500).send("Error checking existing tasks");
                  });
                }

                if (getResults.length > 0) {
                  const existingTaskDate = new Date(getResults[0].existingTaskDate);
                  const currentDate = new Date();
                  const daysDifference = Math.ceil((existingTaskDate - currentDate) / (1000 * 60 * 60 * 24));

                  let dateAdjustmentDays = 0;
                  if (getResults[0].existingPriority === "LOW") {
                    dateAdjustmentDays = Math.ceil(daysDifference * 1.5);
                  } else if (getResults[0].existingPriority === "MEDIUM") {
                    dateAdjustmentDays = Math.ceil(daysDifference * 1.2);
                  }

                  adjustedTaskDate = new Date(existingTaskDate);
                  adjustedTaskDate.setDate(adjustedTaskDate.getDate() + dateAdjustmentDays);

                  const updateExistingTaskQuery = `
                    UPDATE tasks 
                    SET priority = 'MEDIUM', updatedAt = ?, taskDate = ?
                    WHERE client_id = ? AND priority = 'HIGH'
                  `;

                  connection.query(updateExistingTaskQuery, [toMySQLDate(updatedAt), toMySQLDate(adjustedTaskDate), finalClientId], (updateErr) => {
                    if (updateErr) {
                      logger.error('Error updating existing tasks:', updateErr);
                      return connection.rollback(() => {
                        connection.release();
                        return res.status(500).send("Error managing task priorities");
                      });
                    }

                    logger.info('Continuing task creation with adjusted date');
                    continueTaskCreation(req, connection, { 
                  ...req.body, 
                  assigned_to: finalAssigned, 
                  stage: normalizedStage, 
                  taskDate: adjustedTaskDate.toISOString(), 
                  time_alloted: finalTimeAlloted, 
                  client_id: finalClientId, 
                  projectId: finalProjectId, 
                  projectPublicId: finalProjectPublicId 
                }, createdAt, updatedAt, "HIGH", res);
              });
            } });
            } else {
                logger.info('Continuing task creation without priority adjustment');
              continueTaskCreation(req, connection, { 
                ...req.body, 
                assigned_to: finalAssigned, 
                stage: normalizedStage, 
                taskDate: adjustedTaskDate, 
                time_alloted: finalTimeAlloted, 
                client_id: finalClientId, 
                projectId: finalProjectId, 
                projectPublicId: finalProjectPublicId 
              }, createdAt, updatedAt, finalPriority, res);
            }
          });
        });
      });
    });
  } catch (error) {
    logger.error('Error in task creation process:', error);
    return res.status(500).send("Error in task creation process");
  }
}

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

  const checkColumn = (col) => new Promise((resolve) => {
    connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = ?", [col], (err, rows) => {
      if (err) {
        logger.error(`Error checking column ${col}:`, err);
        return resolve(false);
      }
      const exists = Array.isArray(rows) && rows.length > 0;
      return resolve(exists);
    });
  });

  try {

    const publicId = crypto.randomBytes(8).toString('hex');

    const cols = ['title', 'description', 'stage', 'taskDate', 'priority', 'createdAt', 'updatedAt', 'time_alloted', 'estimated_hours', 'status', 'client_id', 'public_id', 'project_id', 'project_public_id'];
    const placeholders = cols.map(() => '?');
    const mysqlTaskDate = toMySQLDate(taskDate);
    const mysqlCreatedAt = toMySQLDate(createdAt);
    const mysqlUpdatedAt = toMySQLDate(updatedAt);
    const values = [title, description, stage, mysqlTaskDate, finalPriority, mysqlCreatedAt, mysqlUpdatedAt, time_alloted, estimated_hours || time_alloted || null, 'Pending', client_id, publicId, projectId ? projectId : null, projectPublicId ? projectPublicId : null];

    logger.debug('Final INSERT columns:', cols);
    logger.debug('Final INSERT values:', values);

    const insertTaskQuery = `INSERT INTO tasks (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;

    const executeTaskCreation = async (resolve, reject) => {
      let resolvedUserIds = []; // Declare at function scope
      let resolvedPublicIds = []; // Declare at function scope

      connection.query(insertTaskQuery, values, async (err, result) => {
        if (err) {
          logger.error('Error inserting task:', err);
          return connection.rollback(() => {
            connection.release();
            reject(new Error("Error inserting task: " + err.message));
          });
        }

        const taskId = result.insertId;
        logger.info('Task inserted with ID:', taskId);

        try {
          const dayStr = taskDate ? (new Date(taskDate).toISOString().split('T')[0]) : null;
          if (dayStr) {
            if (await checkColumn('task_day')) {
              await new Promise((res2, rej2) => connection.query('UPDATE tasks SET task_day = ? WHERE id = ?', [dayStr, taskId], (e) => e ? rej2(e) : res2()));
            } else if (await checkColumn('day')) {
              await new Promise((res2, rej2) => connection.query('UPDATE tasks SET day = ? WHERE id = ?', [dayStr, taskId], (e) => e ? rej2(e) : res2()));
            }
          }
        } catch (e) {
          logger.error('Failed to persist day column for task:', e && e.message);
        }

        if (!taskId || !Array.isArray(assigned_to) || assigned_to.length === 0) {
          return connection.rollback(() => {
            connection.release();
            reject(new Error("Invalid task assignment data"));
          });
        }

        const rawAssigned = Array.isArray(assigned_to) ? assigned_to.slice() : [];
        const numericIds = rawAssigned.filter(v => String(v).match(/^\d+$/)).map(v => Number(v));
        const publicIds = rawAssigned.filter(v => !String(v).match(/^\d+$/));

        logger.debug('Resolving user assignments:', { numericIds, publicIds, rawAssigned });

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

        if (resolveQueries.length === 0) {
          return connection.rollback(() => {
            connection.release();
            reject(new Error("No assigned users provided or invalid format"));
          });
        }

        const runResolveQuery = async (idx) => {
          if (idx >= resolveQueries.length) {

            resolvedUserIds = Array.from(new Set(resolvedUserIds));

            logger.debug('Resolved user IDs:', resolvedUserIds);

            if (resolvedUserIds.length === 0) {
              return connection.rollback(() => {
                connection.release();
                reject(new Error("Assigned users not found"));
              });
            }

            for (const uId of resolvedUserIds) {
              const hasActive = await assigneeHasActiveTask(uId);
              if (hasActive) {
                return connection.rollback(() => {
                  connection.release();
                  reject(new Error(`User ${uId} already has an active task and cannot be assigned another until it is completed`));
                });
              }
            }

            const taskAssignments = resolvedUserIds.map((userId) => [taskId, userId]);
            const insertTaskAssignmentsQuery = `INSERT INTO taskassignments (task_Id, user_Id) VALUES ${taskAssignments.map(() => "(?, ?)").join(", ")}`;
            const flattenedValues = taskAssignments.flat();

            logger.debug('Inserting task assignments:', { taskAssignments });

            connection.query(insertTaskAssignmentsQuery, flattenedValues, (err) => {
              if (err) {
                logger.error('Error inserting task assignments:', err);
                return connection.rollback(() => {
                  connection.release();
                  reject(new Error("Error inserting task assignments: " + err.message));
                });
              }

              const assignedBy = (req.user && req.user.name) || 'System';
              const link = `${(process.env.FRONTEND_URL || process.env.BASE_URL || '')}/tasks/${taskId}`;
              const projectName = null;
              const priority = finalPriority;
              const taskDateVal = taskDate || null;
              const descriptionVal = description || null;

              logger.info('Preparing to send emails to users:', resolvedPublicIds);

              const sendEmails = emailService.sendTaskAssignmentEmails;

              sendEmails({
                finalAssigned: resolvedPublicIds,
                taskTitle: title,
                taskId,
                priority,
                taskDate: taskDateVal,
                description: descriptionVal,
                projectName,
                projectPublicId: projectPublicId || null,
                assignedBy,
                taskLink: link,
                connection
              }).catch(emailError => {
                logger.error('Email sending failed:', emailError);
              });

              connection.commit((err) => {
                if (err) {
                  logger.error('Commit error:', err);
                  return connection.rollback(() => {
                    connection.release();
                    reject(new Error("Error committing transaction: " + err.message));
                  });
                }

                connection.release();
                logger.info('Transaction committed successfully');
                resolve({
                  taskId,
                  publicId,
                  message: "Task created and assignments completed successfully",
                  assignedUsers: rawAssigned,
                  projectId: projectId,
                  projectPublicId: projectPublicId
                });
              });
            });
            return;
          }

          logger.debug(`Running resolve query ${idx}:`, resolveQueries[idx], resolveParams[idx]);
          
          connection.query(resolveQueries[idx], resolveParams[idx], (err, rows) => {
            if (err) {
              logger.error('Error resolving users:', err);
              return connection.rollback(() => {
                connection.release();
                reject(new Error("Error resolving assigned users: " + err.message));
              });
            }
            logger.debug(`Resolved ${rows?.length} users`);
            if (Array.isArray(rows) && rows.length > 0) {
              for (const r of rows) {
                resolvedUserIds.push(r._id);
                resolvedPublicIds.push(r.public_id);
              }
            }
            runResolveQuery(idx + 1).catch((err) => {
              logger.error('runResolveQuery failed:', err);
              return connection.rollback(() => {
                connection.release();
                reject(err);
              });
            });
          });
        };

        runResolveQuery(0).catch((err) => {
          logger.error('runResolveQuery failed:', err);
          return connection.rollback(() => {
            connection.release();
            reject(err);
          });
        });
      });
    };

    return new Promise((resolve, reject) => {
      executeTaskCreation(resolve, reject);
    })
      .then(async (result) => {
        logger.info('Task creation successful:', result);

        if (result.assignedUsers && result.assignedUsers.length > 0) {
          await NotificationService.createAndSend(
            result.assignedUsers.map(u => typeof u === 'object' ? u.internalId || u.id : u),
            'Task Assigned',
            `You have been assigned a new task: ${body.title}`,
            'TASK_ASSIGNED',
            'task',
            result.publicId
          );
        }

        await NotificationService.createAndSendToRoles(['Manager', 'Admin'], 
          'New Task Created', 
          `A new task "${body.title}" has been created`, 
          'TASK_CREATED', 
          'task', 
          result.publicId, 
          req.user.tenant_id
        );

        if (projectId) {
          try {

            const updateProjectStatus = () => {
              return new Promise((resolve, reject) => {
                const checkStatusQuery = 'SELECT status FROM projects WHERE id = ?';
                db.query(checkStatusQuery, [projectId], (err, rows) => {
                  if (err) {
                    logger.error('Error checking project status:', err);
                    return resolve(); // Don't fail the task creation
                  }
                  
                  if (rows && rows.length > 0 && rows[0].status === 'Planning') {
                    const updateQuery = 'UPDATE projects SET status = ? WHERE id = ?';
                    db.query(updateQuery, ['ACTIVE', projectId], (updateErr) => {
                      if (updateErr) {
                        logger.error('Error updating project status to ACTIVE:', updateErr);
                      } else {
                        logger.info(`Project ${projectId} status updated from Planning to ACTIVE`);
                      }
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                });
              });
            };
            
            await updateProjectStatus();
          } catch (e) {
            logger.error('Failed to update project status:', e && e.message);

          }
        }

        let summary = {};
        try {
          const now = new Date();
          let estDate = null;
          let estHours = null;
          if (body.taskDate) estDate = new Date(body.taskDate);
          if (body.estimated_hours != null) estHours = Number(body.estimated_hours);
          else if (body.time_alloted != null) estHours = Number(body.time_alloted);

          if (estDate) {
            summary.dueStatus = estDate < now ? 'Overdue' : 'On Time';
            summary.dueDate = estDate.toISOString();
          }
          if (estHours != null) {
            summary.estimatedHours = estHours;
          }
        } catch (e) {
          summary.error = 'Could not calculate summary';
        }
        try {
          if (req.user && req.user.tenant_id) {
            const templates = await workflowService.listTemplates(req.user.tenant_id);
            const tpl = (templates || []).find(t => String(t.trigger_event).toUpperCase() === 'TASK_CREATED');
            if (tpl) {
              await workflowService.createInstance({ tenant_id: req.user.tenant_id, template_id: tpl.id, entity_type: 'TASK', entity_id: String(result.taskId), created_by: (req.user && req.user._id) || null });
            }
          }
        } catch (e) {
          logger.error('Workflow trigger failed (non-fatal):', e && e.message);
        }

        res.status(201).json({
          message: "Task created and assignments completed successfully",
          ...result,
          summary
        });
      })
      .catch((error) => {
        logger.error('Task creation failed:', error);
        return res.status(500).json({ success: false, error: error.message });
      });

  } catch (error) {
    logger.error('Error in continueTaskCreation:', error);
    return connection.rollback(() => {
      connection.release();
      res.status(500).json({ error: "Error in task creation process: " + error.message });
    });
  }
}

router.post('/createjson', [
  check('title').notEmpty().withMessage('title is required'),
  check('taskDate').optional().isISO8601().withMessage('taskDate must be ISO8601'),
  check('assigned_to').optional(),
  validateRequest,
  ruleEngine('task_creation'),
  requireRole(['Admin', 'Manager'])
], createJsonHandler);
router.post('/', [
  check('title').notEmpty().withMessage('title is required'),
  check('taskDate').optional().isISO8601().withMessage('taskDate must be ISO8601'),
  validateRequest,
  ruleEngine('task_creation'),
  requireRole(['Admin', 'Manager'])
], createJsonHandler);

router.get("/taskdropdown", async (req, res) => {
  try {
    const query = "SELECT id, title FROM tasks";
    db.query(query, (err, results) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch tasks" });
      }
      if (!Array.isArray(results)) {
        return res
          .status(500)
          .json({ error: "Unexpected query result format" });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = req.user;
    const projectParam = req.query.project_id || req.query.projectId || req.query.projectPublicId || req.body && (req.body.project_id || req.body.project_public_id || req.body.projectPublicId);
    if (!projectParam) return res.status(400).json({ success: false, error: 'project_id or projectPublicId query parameter required' });

    const tasksHasProjectId = await hasColumn('tasks', 'project_id');
    const tasksHasProjectPublicId = await hasColumn('tasks', 'project_public_id');
    const hasIsDeleted = await hasColumn('tasks', 'isDeleted');
    const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';

    let optionalSelect = '';
    try {
      const cols = [];
      if (await hasColumn('tasks', 'started_at')) cols.push('t.started_at');
      if (await hasColumn('tasks', 'live_timer')) cols.push('t.live_timer');
      if (await hasColumn('tasks', 'total_duration')) cols.push('t.total_duration');
      if (await hasColumn('tasks', 'completed_at')) cols.push('t.completed_at');
      if (await hasColumn('tasks', 'approved_by')) cols.push('t.approved_by');
      if (await hasColumn('tasks', 'approved_at')) cols.push('t.approved_at');
      if (await hasColumn('tasks', 'rejection_reason')) cols.push('t.rejection_reason');
      if (await hasColumn('tasks', 'rejected_by')) cols.push('t.rejected_by');
      if (await hasColumn('tasks', 'rejected_at')) cols.push('t.rejected_at');
      if (cols.length) optionalSelect = ', ' + cols.join(', ');
    } catch (e) {  }

    let resolvedProjectId = projectParam;
    let projectPublicIdToUse = null;

    if (!/^\d+$/.test(String(projectParam))) {

      projectPublicIdToUse = projectParam;
      try {
        const projRows = await new Promise((resolve, reject) => db.query('SELECT id, public_id FROM projects WHERE public_id = ? LIMIT 1', [projectParam], (err, r) => err ? reject(err) : resolve(r)));
        if (!projRows || projRows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
        resolvedProjectId = projRows[0].id;
      } catch (err) {
        logger.error('Error resolving project public_id: ' + (err && err.message));
        return res.status(500).json({ success: false, error: 'Failed resolving project id' });
      }
    } else {
      resolvedProjectId = Number(projectParam);
    }

      try {
        await ensureProjectOpen(resolvedProjectId);
      } catch (err) {
        return res.status(err.status || 403).json({ success: false, message: err.message });
      }

    let sql;
    let params = [];

    if (tasksHasProjectId) {

      if (tasksHasProjectPublicId) {
        if (!projectPublicIdToUse) {
          try {
            const r = await new Promise((resolve, reject) => db.query('SELECT public_id FROM projects WHERE id = ? LIMIT 1', [resolvedProjectId], (err, rr) => err ? reject(err) : resolve(rr)));
            if (r && r.length > 0) projectPublicIdToUse = r[0].public_id;
          } catch (err) {
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
          t.updatedAt${optionalSelect},
          MIN(c.id) AS client_id,
          MIN(c.name) AS client_name,
          MIN(ap.name) AS approved_by_name,
          MIN(ap.public_id) AS approved_by_public_id,
          MIN(rj.name) AS rejected_by_name,
          MIN(rj.public_id) AS rejected_by_public_id,
          GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
          GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
          GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
        FROM tasks t
        LEFT JOIN clientss c ON t.client_id = c.id
        LEFT JOIN users ap ON t.approved_by = ap._id
        LEFT JOIN users rj ON t.rejected_by = rj._id
        LEFT JOIN taskassignments ta ON ta.task_Id = t.id
        LEFT JOIN users u ON u._id = ta.user_Id
        WHERE (t.project_id = ?${projectPublicIdToUse ? ' OR t.project_public_id = ?' : ''}) ${hasIsDeleted && !includeDeleted ? 'AND t.isDeleted != 1' : ''}
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `;
        params = projectPublicIdToUse ? [resolvedProjectId, projectPublicIdToUse] : [resolvedProjectId];
      } else {
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
          t.updatedAt${optionalSelect},
          c.id AS client_id,
          c.name AS client_name,
          ap.name AS approved_by_name,
          ap.public_id AS approved_by_public_id,
          rj.name AS rejected_by_name,
          rj.public_id AS rejected_by_public_id,
          GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
          GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
          GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
        FROM tasks t
        LEFT JOIN clientss c ON t.client_id = c.id
        LEFT JOIN users ap ON t.approved_by = ap._id
        LEFT JOIN users rj ON t.rejected_by = rj._id
        LEFT JOIN taskassignments ta ON ta.task_Id = t.id
        LEFT JOIN users u ON u._id = ta.user_Id
        WHERE t.project_id = ? ${hasIsDeleted && !includeDeleted ? 'AND t.isDeleted != 1' : ''}
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `;
        params = [resolvedProjectId];
      }
    } else if (tasksHasProjectPublicId) {
      let projectPublicIdToUse = projectParam;
      if (/^\d+$/.test(String(projectParam))) {
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
          t.updatedAt${optionalSelect},
          MIN(c.id) AS client_id,
          MIN(c.name) AS client_name,
          MIN(ap.name) AS approved_by_name,
          MIN(ap.public_id) AS approved_by_public_id,
          MIN(rj.name) AS rejected_by_name,
          MIN(rj.public_id) AS rejected_by_public_id,
          GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
          GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
          GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names
        FROM tasks t
        LEFT JOIN clientss c ON t.client_id = c.id
        LEFT JOIN users ap ON t.approved_by = ap._id
        LEFT JOIN users rj ON t.rejected_by = rj._id
        LEFT JOIN taskassignments ta ON ta.task_Id = t.id
        LEFT JOIN users u ON u._id = ta.user_Id
        WHERE t.project_public_id = ? ${hasIsDeleted && !includeDeleted ? 'AND t.isDeleted != 1' : ''}
        GROUP BY t.id
        ORDER BY t.createdAt DESC
      `;
      params = [projectPublicIdToUse];
    } else {

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

        const totalSecs = r.total_duration != null ? Number(r.total_duration) : 0;
        const hh = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
        const mm = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
        const ss = String(totalSecs % 60).padStart(2, '0');
        const humanDuration = `${hh}:${mm}:${ss}`;

        return {
          id: r.task_id ? String(r.task_id) : String(r.task_internal_id),
          title: r.title || null,
          description: r.description || null,
          stage: r.stage || null,
          taskDate: r.taskDate ? new Date(r.taskDate).toISOString() : null,
          day: r.taskDate ? (new Date(r.taskDate).toISOString().split('T')[0]) : null,
          dayName: r.taskDate ? dayjs(r.taskDate).format('ddd') : null,
          priority: r.priority || null,
          timeAlloted: r.time_alloted != null ? Number(r.time_alloted) : null,
          estimatedHours: r.estimated_hours != null ? Number(r.estimated_hours) : (r.time_alloted != null ? Number(r.time_alloted) : null),
          status: r.status || null,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
          client: r.client_id ? { id: r.client_id, name: r.client_name } : null,
          assignedUsers,
          started_at: r.started_at ? new Date(r.started_at).toISOString() : null,
          live_timer: r.live_timer ? new Date(r.live_timer).toISOString() : null,
          total_time_seconds: totalSecs,
          total_time_hours: Number((totalSecs / 3600).toFixed(2)),
          total_time_hhmmss: humanDuration,
          completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
          approved_by: r.approved_by_name ? {
            id: r.approved_by_public_id,
            name: r.approved_by_name
          } : null,
          approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
          rejection: r.rejection_reason ? {
            reason: r.rejection_reason,
            rejected_by: r.rejected_by_name ? {
              id: r.rejected_by_public_id,
              name: r.rejected_by_name
            } : null,
            rejected_at: r.rejected_at ? new Date(r.rejected_at).toISOString() : null
          } : null,
          summary: (() => {
            try {
              const now = new Date();
              const est = r.taskDate ? new Date(r.taskDate) : null;
              if (!est) return {};
              return { dueStatus: est < now ? 'Overdue' : 'On Time', dueDate: est.toISOString() };
            } catch (e) { return {}; }
          })()
        };
      });

      return res.json({ success: true, data: tasks, meta: { count: tasks.length } });
    });
  } catch (e) {
    logger.error('Error in project tasks endpoint: ' + (e && e.message));
    return res.status(500).json({ success: false, error: e.message });
  }
});


router.put('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
  const { id: taskId } = req.params;
  const {
    stage, title, priority, description, client_id, projectId, projectPublicId,
    taskDate, time_alloted, assigned_to, handleResignationRequestId
  } = req.body;

  logger.info(`[PUT /tasks/:id] Updating task: taskId=${taskId}`);

  try {
    const taskRow = await q('SELECT id FROM tasks WHERE public_id = ? OR id = ?', [taskId, taskId]);
    if (taskRow.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const internalTaskId = taskRow[0].id;

    try {
      const projRows = await q('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [internalTaskId]);
      const projId = projRows && projRows[0] ? projRows[0].project_id : null;
      await ensureProjectOpen(projId);
    } catch (err) {
      return res.status(err.status || 403).json({ success: false, error: err.message });
    }

    db.getConnection((err, connection) => {
      if (err) {
        logger.error(`DB connection error: ${err}`);
        return res.status(500).json({ success: false, error: 'Database connection error' });
      }

      (async () => {
        try {
          let reassignmentRequest = null;
          let oldAssigneeEmail = null;
          let oldAssigneeName = 'Previous Assignee';

          if (handleResignationRequestId) {

            const requestRows = await new Promise((resolve, reject) =>
              connection.query(
                'SELECT requested_by FROM task_resign_requests WHERE id = ? AND status = "APPROVED"',
                [handleResignationRequestId],
                (e, r) => e ? reject(e) : resolve(r)
              )
            );

            if (requestRows.length > 0) {
              const requestedById = requestRows[0].requested_by;

              const userRows = await new Promise((resolve, reject) =>
                connection.query(
                  'SELECT _id, name, email FROM users WHERE _id = ?',
                  [requestedById],
                  (e, r) => e ? reject(e) : resolve(r)
                )
              );

              if (userRows.length > 0) {
                reassignmentRequest = userRows[0];
                oldAssigneeEmail = userRows[0].email;
                oldAssigneeName = userRows[0].name || 'Previous Assignee';
              }
            }
          }

          const updates = [];
          const values = [];

          if (stage !== undefined) { updates.push('stage = ?'); values.push(stage); }
          if (title !== undefined) { updates.push('title = ?'); values.push(title); }
          if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
          if (description !== undefined) { updates.push('description = ?'); values.push(description); }
          if (client_id !== undefined) { updates.push('client_id = ?'); values.push(client_id); }
          if (taskDate !== undefined) { updates.push('taskDate = ?'); values.push(toMySQLDate(taskDate)); }
          if (time_alloted !== undefined) { updates.push('time_alloted = ?'); values.push(time_alloted); }
          if (projectId !== undefined) { updates.push('project_id = ?'); values.push(projectId); }
          if (projectPublicId !== undefined) { updates.push('project_public_id = ?'); values.push(projectPublicId); }

          updates.push('updatedAt = ?');
          values.push(toMySQLDate(new Date()));
          values.push(internalTaskId);

          if (updates.length === 1) {
            connection.release();
            return res.status(400).json({ success: false, error: 'No fields to update' });
          }

          const updateTaskQuery = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
          connection.query(updateTaskQuery, values, async (err, result) => {
            if (err) {
              connection.release();
              logger.error(`Error updating task: ${err.message}`);
              return res.status(500).json({ success: false, error: 'Database update error' });
            }

            if (result.affectedRows === 0) {
              connection.release();
              return res.status(404).json({ success: false, message: 'Task not found' });
            }

            let reassigned = false;
            let finalAssignedUserIds = [];
            let emailStatus = null;

            try {
              if (Array.isArray(assigned_to) && assigned_to.length > 0) {

                if (assigned_to.length !== 1) {
                  connection.release();
                  return res.status(400).json({ success: false, error: 'Tasks must have exactly one assignee (single-user ownership)' });
                }

                const currentAssignees = await new Promise((resolve, reject) =>
                  connection.query('SELECT user_Id FROM taskassignments WHERE task_Id = ?',
                    [internalTaskId], (e, r) => e ? reject(e) : resolve(r))
                );
                const currentUserIds = currentAssignees.map(r => String(r.user_Id));

                const numericIds = assigned_to.filter(v => /^\d+$/.test(String(v))).map(String);
                const publicIds = assigned_to.filter(v => !/^\d+$/.test(String(v))).map(String);
                let newUserIds = [...numericIds];

                if (publicIds.length > 0) {
                  const rows = await new Promise((resolve, reject) =>
                    connection.query('SELECT _id FROM users WHERE public_id IN (?)',
                      [publicIds], (e, r) => e ? reject(e) : resolve(r))
                  );
                  rows.forEach(r => { if (r && r._id) newUserIds.push(String(r._id)); });
                }
                newUserIds = Array.from(new Set(newUserIds));

                if (newUserIds.length !== 1) {
                  connection.release();
                  return res.status(400).json({ success: false, error: 'Invalid assignee data' });
                }

                const newAssigneeId = newUserIds[0];
                const hasActiveForNew = await assigneeHasActiveTask(newAssigneeId);
                if (hasActiveForNew) {
                  connection.release();
                  return res.status(400).json({ success: false, error: 'The selected assignee already has an active task and cannot be reassigned another until it is completed.' });
                }

                await new Promise((resolve, reject) =>
                  connection.query('DELETE FROM taskassignments WHERE task_Id = ?', [internalTaskId], (e) => e ? reject(e) : resolve())
                );

                await new Promise((resolve, reject) =>
                  connection.query(
                    'INSERT INTO taskassignments (task_Id, user_Id) VALUES (?, ?)',
                    [internalTaskId, newAssigneeId], (e) => e ? reject(e) : resolve()
                  )
                );

                const previousAssignees = currentUserIds.filter(id => id !== newAssigneeId);
                if (previousAssignees.length > 0) {
                  for (const prevId of previousAssignees) {
                    await new Promise((resolve, reject) =>
                      connection.query(
                        'INSERT INTO taskassignments (task_Id, user_Id, is_read_only) VALUES (?, ?, 1)',
                        [internalTaskId, prevId], (e) => e ? reject(e) : resolve()
                      )
                    );
                  }
                }

                reassigned = true;
                finalAssignedUserIds = [newAssigneeId];
              }

              const fetchSql = `
                SELECT t.*, c.name AS client_name,
                  GROUP_CONCAT(DISTINCT u._id) AS assigned_user_ids,
                  GROUP_CONCAT(DISTINCT u.public_id) AS assigned_user_public_ids,
                  GROUP_CONCAT(DISTINCT u.name) AS assigned_user_names,
                  GROUP_CONCAT(DISTINCT u.email) AS assigned_user_emails
                FROM tasks t
                LEFT JOIN clientss c ON t.client_id = c.id
                LEFT JOIN taskassignments ta ON ta.task_Id = t.id
                LEFT JOIN users u ON u._id = ta.user_Id
                WHERE t.id = ? GROUP BY t.id LIMIT 1
              `;

              const rows = await new Promise((resolve, reject) => 
                connection.query(fetchSql, [internalTaskId], (e, r) => e ? reject(e) : resolve(r))
              );

              const taskObj = rows.length > 0 ? {
                id: rows[0].public_id || String(rows[0].id),
                title: rows[0].title,
                description: rows[0].description,
                stage: rows[0].stage,
                taskDate: rows[0].taskDate ? new Date(rows[0].taskDate).toISOString() : null,
                day: rows[0].taskDate ? (new Date(rows[0].taskDate).toISOString().split('T')[0]) : null,
                dayName: rows[0].taskDate ? dayjs(rows[0].taskDate).format('ddd') : null,
                priority: rows[0].priority,
                timeAlloted: rows[0].time_alloted ? Number(rows[0].time_alloted) : null,
                client: rows[0].client_id ? { id: String(rows[0].client_id), name: rows[0].client_name } : null,
                assignedUsers: (rows[0].assigned_user_ids?.split(',') || []).map((uid, i) => ({
                  id: rows[0].assigned_user_public_ids?.split(',')[i] || uid,
                  internalId: String(uid),
                  name: rows[0].assigned_user_names?.split(',')[i] || null,
                  email: rows[0].assigned_user_emails?.split(',')[i] || null
                }))
              } : { taskId };

              try {
                const dayStr = rows[0].taskDate ? (new Date(rows[0].taskDate).toISOString().split('T')[0]) : null;
                if (dayStr) {
                  if (await hasColumn('tasks', 'task_day')) {
                    await new Promise((res2, rej2) => connection.query('UPDATE tasks SET task_day = ? WHERE id = ?', [dayStr, internalTaskId], (e) => e ? rej2(e) : res2()));
                  }
                  if (await hasColumn('tasks', 'day')) {
                    await new Promise((res2, rej2) => connection.query('UPDATE tasks SET day = ? WHERE id = ?', [dayStr, internalTaskId], (e) => e ? rej2(e) : res2()));
                  }
                }
              } catch (e) { logger.warn('Failed to persist day column on update: ' + (e && e.message)); }

              if (reassigned && Array.isArray(taskObj.assignedUsers)) {
                try {
                  const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || '';
                  const taskLink = `${baseUrl}/tasks/${taskId}`;

                  const requesterId = req.user?._id ? String(req.user._id) : null;
                  const newAssignees = taskObj.assignedUsers.filter(u => u.internalId !== requesterId);

                  // send only to new assignees and the old assignee, and only if the email exists in users table
                  let anySent = false;
                  for (const user of newAssignees) {
                    const payload = emailService.taskReassignmentApprovedTemplate({
                      taskTitle: taskObj.title,
                      taskId,
                      oldAssignee: oldAssigneeName,
                      newAssignee: user.name,
                      taskLink
                    });
                    const sent = await safeSendEmailForTask(taskId, user.email, payload);
                    anySent = anySent || !!sent;
                  }

                  const oldPayload = emailService.taskReassignmentOldAssigneeTemplate({
                    taskTitle: taskObj.title,
                    newAssignees: newAssignees.map(u => u.name).join(', '),
                    taskLink
                  });
                  const oldSent = await safeSendEmailForTask(taskId, oldAssigneeEmail, oldPayload);
                  anySent = anySent || !!oldSent;

                  emailStatus = anySent ? { sent: true } : { sent: false };
                } catch (mailErr) {
                  logger.error(`Email failed for task=${taskId}: ${mailErr && mailErr.message}`);
                  emailStatus = { sent: false, error: mailErr && mailErr.message };
                }
              }

              connection.release();
              res.status(200).json({
                success: true,
                message: 'Task updated successfully',
                data: taskObj,
                emailStatus,
                reassigned,
                assignedToCount: finalAssignedUserIds.length
              });

            } catch (e) {
              connection.release();
              logger.error(`Post-update failed: ${e.message}`);
              res.status(500).json({ success: false, error: 'Post-update failed', details: e.message });
            }
          });

        } catch (error) {
          connection.release();
          logger.error(`Setup error: ${error.message}`);
          res.status(500).json({ success: false, error: 'Setup failed', details: error.message });
        }
      })();

    });

  } catch (error) {
    logger.error(`Unexpected error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
});
router.patch('/:taskId/reassign/:userId', ruleEngine('task_reassign'), requireRole(['Manager', 'Admin']), async (req, res) => {
  let { taskId, userId } = req.params;
  let { approve, newAssigneeId } = req.body;
  try {
    if (!/^\d+$/.test(taskId)) {
      const tRows = await q('SELECT id FROM tasks WHERE public_id = ?', [taskId]);
      if (tRows.length) taskId = tRows[0].id;
    }
    if (!/^\d+$/.test(userId)) {
      const uRows = await q('SELECT _id FROM users WHERE public_id = ?', [userId]);
      if (uRows.length) userId = uRows[0]._id;
    }
    if (newAssigneeId && !/^\d+$/.test(newAssigneeId)) {
      const uRows = await q('SELECT _id FROM users WHERE public_id = ?', [newAssigneeId]);
      if (uRows.length) newAssigneeId = uRows[0]._id;
    }

    if (approve) {

      await q('UPDATE taskassignments SET is_read_only = 1 WHERE task_Id = ? AND user_Id = ?', [taskId, userId]);
      if (newAssigneeId) {
        const exists = await q('SELECT 1 FROM taskassignments WHERE task_Id = ? AND user_Id = ?', [taskId, newAssigneeId]);
        if (!exists.length) {
          const hasActive = await assigneeHasActiveTask(newAssigneeId);
          if (hasActive) return res.status(400).json({ success: false, error: 'The selected assignee already has an active task and cannot be assigned another until it is completed.' });
          await q('INSERT INTO taskassignments (task_Id, user_Id, is_read_only) VALUES (?, ?, 0)', [taskId, newAssigneeId]);
        }
      }

      const [[oldUser], [newUser], [task]] = await Promise.all([
        q('SELECT name, email FROM users WHERE _id = ?', [userId]),
        newAssigneeId ? q('SELECT name, email FROM users WHERE _id = ?', [newAssigneeId]) : [{}],
        q('SELECT title FROM tasks WHERE id = ?', [taskId])
      ]);
      const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || '';
      const taskLink = `${baseUrl}/tasks/${taskId}`;

      if (newUser && newUser.email) {
        try {
          await safeSendEmailForTask(taskId, newUser.email, emailService.taskReassignmentApprovedTemplate({
            taskTitle: task?.title || '',
            oldAssignee: oldUser?.name || '',
            newAssignee: newUser?.name || '',
            taskLink
          }));
        } catch (e) {
          logger.error(`Failed to queue email to new assignee for task=${taskId}: ${e && e.message}`);
        }
      }

      if (oldUser && oldUser.email) {
        try {
          await safeSendEmailForTask(taskId, oldUser.email, emailService.taskReassignmentOldAssigneeTemplate({
            taskTitle: task?.title || '',
            newAssignee: newUser?.name || '',
            taskLink
          }));
        } catch (e) {
          logger.error(`Failed to queue email to old assignee for task=${taskId}: ${e && e.message}`);
        }
      }
      return res.json({ success: true });
    } else {

      await q('UPDATE taskassignments SET status = ?, is_read_only = 0 WHERE task_id = ? AND user_id = ?', ['ACTIVE', taskId, userId]);

      const [[oldUser], [task]] = await Promise.all([
        q('SELECT name, email FROM users WHERE _id = ?', [userId]),
        q('SELECT title FROM tasks WHERE id = ?', [taskId])
      ]);
      const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || '';
      const taskLink = `${baseUrl}/tasks/${taskId}`;
      if (oldUser && oldUser.email) {
        try {
          await safeSendEmailForTask(taskId, oldUser.email, emailService.taskReassignmentRejectedTemplate({
            taskTitle: task?.title || '',
            taskLink
          }));
        } catch (e) {
          logger.error(`Failed to queue rejection email for task=${taskId}, recipient=${oldUser.email}: ${e && e.message}`);
        }
      }
      return res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



router.patch('/:id/status', ruleEngine('task_status_update'), requireRole(['Employee']), async (req, res) => {
  try {
    await ensureTaskTimeLogsTable();
    
    const { id } = req.params;
    const { status, projectId, taskId } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    const validStatuses = ['PENDING', 'To Do', 'In Progress', 'On Hold', 'Review', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    let resolvedTaskId = req.params.id;
    if (isNaN(id)) {
      const taskRows = await q('SELECT id FROM tasks WHERE public_id = ? LIMIT 1', [id]);
      if (!taskRows || taskRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Task not found' });
      }
      resolvedTaskId = taskRows[0].id;
    }

    let resolvedProjectId = req.body.projectId;
    if (isNaN(projectId)) {

      const projectRows = await q('SELECT id FROM projects WHERE public_id = ? LIMIT 1', [projectId]);
      if (!projectRows || projectRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }
      resolvedProjectId = projectRows[0].id;
    }

    const hasReadOnlyColumn = await hasColumn('taskassignments', 'is_read_only');
    const selectColumns = hasReadOnlyColumn ? 't.*, ta.user_id, ta.is_read_only, p.public_id as project_public_id' : 't.*, ta.user_id, p.public_id as project_public_id';
    const readOnlyCondition = hasReadOnlyColumn ? ' AND (ta.is_read_only IS NULL OR ta.is_read_only != 1)' : '';
    const taskQuery = `
      SELECT ${selectColumns}
      FROM tasks t
      JOIN taskassignments ta ON t.id = ta.task_id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ? AND ta.user_id = ? AND t.project_id = ?${readOnlyCondition}
      LIMIT 1
    `;
    const tasks = await q(taskQuery, [resolvedTaskId, req.user._id, resolvedProjectId]);

    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found, not assigned to you with full access, or does not belong to the specified project' });
    }

    try {
      await ensureProjectOpen(resolvedProjectId);
    } catch (err) {
      return res.status(err.status || 403).json({ success: false, message: err.message });
    }

    const task = tasks[0];
    const currentStatusStr = task.status || task.stage || 'PENDING';
    
    const normalizedCurrent = currentStatusStr.toUpperCase();
    const normalizedTarget = status.toUpperCase();


    const allowedTransitions = {
      'PENDING': ['TO DO', 'IN PROGRESS'],
      'TO DO': ['IN PROGRESS'],
      'IN PROGRESS': ['ON HOLD', 'REVIEW'],
      'ON HOLD': ['IN PROGRESS'],
      'REVIEW': [],  // Only manager can approve to Completed
      'COMPLETED': []
    };

    const allowedNext = allowedTransitions[normalizedCurrent] || [];
    if (!allowedNext.includes(normalizedTarget)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid transition from '${currentStatusStr}' to '${status}'. Allowed: ${allowedNext.join(', ')}` 
      });
    }

    let workflowMessage = null;
    let workflowData = {};

    if (normalizedTarget === 'REVIEW') {
      const tenantId = req.tenantId || req.user.tenant_id || 1;
      logger.debug(`[DEBUG] Requesting transition for tenantId: ${tenantId}, task: ${resolvedTaskId}`);
      const transitionResult = await workflowService.requestTransition({
        tenantId,
        entityType: 'TASK',
        entityId: resolvedTaskId,
        toState: 'COMPLETED',
        userId: req.user._id,
        role: req.user.role,
        projectId: resolvedProjectId,
        meta: { reason: 'Employee requesting task completion' }
      });

      if (transitionResult && transitionResult.requestId) {
        workflowMessage = 'Review requested — sent for manager approval';
        workflowData = { requestId: transitionResult.requestId };
      } else {
        if (transitionResult && transitionResult.taskStatus === 'COMPLETED') {
          await q('UPDATE tasks SET status = ?, updatedAt = NOW() WHERE id = ?', ['Completed', resolvedTaskId]);
          return res.json({ success: true, message: 'Task completed directly', data: { status: 'Completed' } });
        }
      }
    }

    await q('UPDATE tasks SET status = ?, updatedAt = NOW() WHERE id = ?', [status, resolvedTaskId]);

    const now = new Date();
    if ((normalizedTarget === 'REVIEW' || normalizedTarget === 'COMPLETED' || normalizedTarget === 'ON HOLD') && normalizedCurrent === 'IN PROGRESS') {
       const lastLog = await q('SELECT timestamp FROM task_time_logs WHERE task_id = ? AND (action = ? OR action = ?) ORDER BY timestamp DESC LIMIT 1', [resolvedTaskId, 'start', 'resume']);
       let duration = 0;
       if (lastLog.length > 0) {
         duration = Math.floor((now - new Date(lastLog[0].timestamp)) / 1000);
       }
       
       const action = normalizedTarget === 'REVIEW' ? 'pause' : (normalizedTarget === 'COMPLETED' ? 'complete' : 'pause');
       await q('INSERT INTO task_time_logs (task_id, user_id, action, timestamp, duration) VALUES (?, ?, ?, ?, ?)', 
         [resolvedTaskId, req.user._id, action, now, duration]);
       
       const timerUpdate = normalizedTarget === 'COMPLETED' 
         ? 'completed_at = ?, total_duration = COALESCE(total_duration, 0) + ?, live_timer = NULL' 
         : 'total_duration = COALESCE(total_duration, 0) + ?, live_timer = NULL';
       const params = normalizedTarget === 'COMPLETED' ? [now, duration, resolvedTaskId] : [duration, resolvedTaskId];
       
       await q(`UPDATE tasks SET ${timerUpdate} WHERE id = ?`, params);
    } 
    else if (normalizedTarget === 'IN PROGRESS' && normalizedCurrent !== 'IN PROGRESS') {

      const action = (normalizedCurrent === 'ON HOLD') ? 'resume' : 'start';
      if (action === 'start') {
        await q('UPDATE tasks SET started_at = ?, live_timer = ? WHERE id = ?', [now, now, resolvedTaskId]);
      } else {
        await q('UPDATE tasks SET live_timer = ? WHERE id = ?', [now, resolvedTaskId]);
      }
      await q('INSERT INTO task_time_logs (task_id, user_id, action, timestamp) VALUES (?, ?, ?, ?)', 
        [resolvedTaskId, req.user._id, action, now]);
    }

    const updatedTask = await q('SELECT * FROM tasks WHERE id = ? LIMIT 1', [resolvedTaskId]);
    const t = updatedTask[0] || {};
    const totalSeconds = Number(t.total_duration || 0);
    const totalHoursFloat = totalSeconds / 3600;
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    const humanDuration = `${hh}:${mm}:${ss}`;

    const projectIdForAgg = task.project_id || resolvedProjectId;
    let projectHours = 0;
    if (projectIdForAgg) {
      const ph = await q('SELECT SUM(total_duration) as totalHours FROM tasks WHERE project_id = ?', [projectIdForAgg]);
      projectHours = Number((ph && ph[0] && ph[0].totalHours) || 0);

      try {
        const projHasTotalSec = await hasColumn('projects', 'total_hours_seconds');
        if (projHasTotalSec) {
          await q('UPDATE projects SET total_hours_seconds = ? WHERE id = ?', [projectHours, projectIdForAgg]);
        }
        const projHasTotalHours = await hasColumn('projects', 'total_hours');
        if (projHasTotalHours) {
          await q('UPDATE projects SET total_hours = ? WHERE id = ?', [Number((projectHours / 3600).toFixed(2)), projectIdForAgg]);
        }
      } catch (persistErr) {
        logger.warn('Failed to persist project hours:', persistErr && persistErr.message);
      }
    }

    await NotificationService.createAndSend(
      [req.user._id],
      'Task Status Changed',
      `Task status updated to ${status}: ${task.title}`,
      'TASK_STATUS_CHANGED',
      'task',
      task.public_id
    );

    await NotificationService.createAndSendToRoles(['Manager'], 
      'Task Status Updated', 
      `Task "${task.title}" status changed to ${status}`, 
      'TASK_STATUS_CHANGED', 
      'task', 
      task.public_id, 
      req.user.tenant_id
    );

    res.json({
      success: true,
      message: normalizedTarget === 'REVIEW' 
        ? `Task "${task.title}" has been moved to Review and sent to the manager for final approval.`
        : (normalizedTarget === 'COMPLETED' ? `Task "${task.title}" marked as Completed.` : `Task status updated to ${status}`),
      data: {
        projectId: task.project_public_id || resolvedProjectId,
        taskId: task.public_id,
        status: t.status,
        total_time_seconds: totalSeconds,
        total_time_hours: Number(totalHoursFloat.toFixed(2)),
        total_time_hhmmss: humanDuration,
        started_at: t.started_at,
        completed_at: t.completed_at,
        live_timer: t.live_timer,
        task: {
          id: t.id,
          public_id: t.public_id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          stage: t.stage,
          status: t.status,
          taskDate: t.taskDate,
          day: t.taskDate ? (new Date(t.taskDate).toISOString().split('T')[0]) : null,
          dayName: t.taskDate ? dayjs(t.taskDate).format('ddd') : null,
        },

        project_total_time_seconds: projectHours,
        project_total_time_hours: Number((projectHours / 3600).toFixed(2))
      }
    });
  } catch (e) {
    logger.error('Update task status error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/:id', ruleEngine('task_delete'), requireRole(['Admin', 'Manager']), (req, res) => {
  const { id: taskId } = req.params;

  logger.info(`[DELETE /tasks/:id] Deleting task: taskId=${taskId}`);

  db.getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'DB connection error' });
    }

    (async () => {
      try {

        const findTaskSql = 'SELECT id FROM tasks WHERE id = ? OR public_id = ?';
        const taskResult = await new Promise((resolve, reject) => {
          connection.query(findTaskSql, [taskId, taskId], (qErr, qRes) => {
            if (qErr) reject(qErr);
            else resolve(qRes);
          });
        });

        if (!taskResult || taskResult.length === 0) {
          connection.release();
          return res.status(404).json({ success: false, error: 'Task not found' });
        }

        const internalTaskId = taskResult[0].id;

        connection.beginTransaction((err) => {
          if (err) {
            connection.release();
            return res.status(500).json({ success: false, error: 'Transaction error' });
          }

          const tasksToRun = [
            { sql: 'DELETE FROM taskassignments WHERE task_id = ?', params: [internalTaskId] },
            { sql: 'DELETE FROM task_assignments WHERE task_id = ?', params: [internalTaskId] },
            { sql: 'DELETE FROM subtasks WHERE task_id = ?', params: [internalTaskId] },
            { sql: 'DELETE FROM task_hours WHERE task_id = ?', params: [internalTaskId] },
            { sql: 'DELETE FROM task_activities WHERE task_id = ?', params: [internalTaskId] },
            { sql: 'DELETE FROM tasks WHERE id = ?', params: [internalTaskId] },
          ];

          const runStep = (idx) => {
            if (idx >= tasksToRun.length) {
              connection.commit((err) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.release();
                    return res.status(500).json({ success: false, error: 'Commit error' });
                  });
                }
                connection.release();
                logger.info(`Task deleted successfully: taskId=${taskId}`);
                return res.status(200).json({ success: true, message: 'Task deleted successfully' });
              });
              return;
            }

            const step = tasksToRun[idx];
            connection.query(step.sql, step.params, (qErr, qRes) => {
              if (qErr) {
                return connection.rollback(() => {
                  connection.release();
                  return res.status(500).json({ success: false, error: 'Delete failed', details: qErr.message });
                });
              }
              runStep(idx + 1);
            });
          };

          runStep(0);
        });
      } catch (e) {
        connection.release();
        return res.status(500).json({ success: false, error: 'Unexpected error', details: e && e.message });
      }
    })();
  });
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
        return res.status(500).json({ error: "Failed to fetch tasks" });
      }
      if (!Array.isArray(results)) {
        return res
          .status(500)
          .json({ error: "Unexpected query result format" });
      }
      res.status(200).json(results);
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.get("/gettaskss", (req, res) => {
  const user = req.user;
  const role = user && user.role;

  const filterUserParam = req.query.userId;

  const buildAndRun = async (resolvedUserId) => {
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
          t.status,
          t.rejection_reason,
          t.rejected_at,
          u._id AS user_id, 
          u.name AS user_name, 
          u.role AS user_role,
          rj.name AS rejected_by_name,
          rj.public_id AS rejected_by_public_id
      FROM 
          tasks t
      LEFT JOIN 
          taskassignments ta ON t.id = ta.task_id
      LEFT JOIN 
          users u ON ta.user_id = u._id
      LEFT JOIN 
          clientss c ON t.client_id = c.id
      LEFT JOIN
          users rj ON t.rejected_by = rj._id
    `;

    if (role === 'Employee') {
      query += ` WHERE t.id IN (
          SELECT task_id FROM taskassignments WHERE user_id = ?
      )`;
    }

    if (resolvedUserId && role !== 'Employee') {
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

    try {
      const hasIsDeletedList = await hasColumn('tasks', 'isDeleted');
      const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
      if (hasIsDeletedList && !includeDeleted) {
        if (query.includes('WHERE')) {
          query = query.replace(/ORDER BY[\s\S]*$/m, '');
          query += ` AND t.isDeleted != 1 `;
        } else {
          query = query.replace(/ORDER BY[\s\S]*$/m, '');
          query += ` WHERE t.isDeleted != 1 `;
        }

        query += ` ORDER BY 
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
      t.createdAt ASC;`;
      }
    } catch (err) {

    }

    const queryParams = role === 'Employee' ? [resolvedUserId] : (resolvedUserId ? [resolvedUserId] : []);

    db.query(query, queryParams, (err, results) => {
      if (err) {
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
            status: row.status,
            rejection: row.rejection_reason ? {
              reason: row.rejection_reason,
              rejectedBy: row.rejected_by_name || 'Manager',
              rejectedAt: row.rejected_at,
              id: row.rejected_by_public_id
            } : null,
            taskDate: row.taskDate,
            day: row.taskDate ? (new Date(row.taskDate).toISOString().split('T')[0]) : null,
            dayName: row.taskDate ? dayjs(row.taskDate).format('ddd') : null,
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

      }

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

  if (filterUserParam) {
    const isNumeric = /^\d+$/.test(String(filterUserParam));
    if (isNumeric) {
      buildAndRun(filterUserParam);
      return;
    }

    db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error resolving userId', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found for provided userId' });
      const resolved = rows[0]._id;
      buildAndRun(resolved);
    });
    return;
  }

  const currentUserInternal = user && user._id;
  buildAndRun(currentUserInternal);
});

router.get("/gettasks", (req, res) => {
  const authUser = req.user;
  const role = authUser && authUser.role;

  const filterUserParam = req.query.userId;

  const buildAndRun = async (resolvedUserId) => {
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
              t.status,
              t.rejection_reason,
              t.rejected_at,
              u._id AS user_id, 
              u.name AS user_name, 
              u.role AS user_role,
              rj.name AS rejected_by_name,
              rj.public_id AS rejected_by_public_id
          FROM 
              tasks t
          LEFT JOIN 
              taskassignments ta ON t.id = ta.task_id
          LEFT JOIN 
              users u ON ta.user_id = u._id
          LEFT JOIN 
            clientss c ON t.client_id = c.id
          LEFT JOIN
            users rj ON t.rejected_by = rj._id
    `;

    if (role === 'Employee') {
      query = `
      SELECT 
         t.id AS task_id, c.name AS client_name, t.title, t.stage, t.taskDate, t.priority, t.createdAt, t.updatedAt, t.status, 
         t.rejection_reason, t.rejected_at,
         u._id AS user_id, u.name AS user_name, u.role AS user_role, rj.name AS rejected_by_name, rj.public_id AS rejected_by_public_id
      FROM tasks t
      JOIN taskassignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u._id
      LEFT JOIN clientss c ON t.client_id = c.id
      LEFT JOIN users rj ON t.rejected_by = rj._id
      WHERE ta.user_id = ?
      ORDER BY t.createdAt
    `;
    }

    if (resolvedUserId && role !== 'Employee') {

      query = query.replace(/ORDER BY[\s\S]*$/m, '');
      query += ` WHERE t.id IN (SELECT task_id FROM taskassignments WHERE user_id = ?)`;
      query += ` ORDER BY t.createdAt`;
    }

    try {
      const hasIsDeletedList = await hasColumn('tasks', 'isDeleted');
      const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
      if (hasIsDeletedList && !includeDeleted) {
        if (query.includes('WHERE')) {
          query = query.replace(/ORDER BY[\s\S]*$/m, '');
          query += ` AND t.isDeleted != 1 `;
        } else {
          query = query.replace(/ORDER BY[\s\S]*$/m, '');
          query += ` WHERE t.isDeleted != 1 `;
        }
        query += ` ORDER BY t.createdAt`;
      }
    } catch (err) { }

    const params = role === 'Employee' ? [resolvedUserId] : (resolvedUserId ? [resolvedUserId] : []);

    db.query(query, params, (err, results) => {
      if (err) {
        return res.status(500).send("Error fetching tasks");
      }

      const tasks = {};
      results.forEach((row) => {
        if (!tasks[row.task_id]) {
          tasks[row.task_id] = {
            task_id: row.task_id,
            client_name: row.client_name,
            title: row.title,
            stage: row.stage,
            status: row.status,
            rejection: row.rejection_reason ? {
               reason: row.rejection_reason,
               rejectedBy: row.rejected_by_name || 'Manager',
               rejectedAt: row.rejected_at,
               id: row.rejected_by_public_id
            } : null,
            taskDate: row.taskDate,
            day: row.taskDate ? (new Date(row.taskDate).toISOString().split('T')[0]) : null,
            dayName: row.taskDate ? dayjs(row.taskDate).format('ddd') : null,
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

      }

      res.status(200).json(Object.values(tasks));
    });
  };

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

  const currentUserInternal = authUser && authUser._id;
  buildAndRun(currentUserInternal);
});

// Convenience alias: allow GET /:id where id can be public_id or internal id
// List all reassign requests (manager) — placed before the catch-all `/:id` route
router.get('/reassign-requests', requireRole(['Manager']), async (req, res) => {
  try {
    const [requests] = await new Promise((resolve, reject) =>
      db.query(`
        SELECT r.*, t.title AS task_title, t.public_id AS task_public_id, u.name AS requester_name, u.email AS requester_email, u.public_id AS requester_public_id,
               t.status AS task_status, t.taskDate, t.priority, t.project_id,
               (SELECT u2.public_id FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_public_id,
               (SELECT u2.name FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_name,
               (SELECT u2.email FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_email
        FROM task_resign_requests r
        JOIN tasks t ON r.task_id = t.id
        JOIN users u ON r.requested_by = u._id
        ORDER BY r.requested_at DESC
      `, [], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const role = user && user.role;
  const userId = user && (user._id || user.loginId);

  db.query('SELECT id FROM tasks WHERE public_id = ? OR id = ? LIMIT 1', [id, id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error resolving task id', error: err.message });
    if (!rows || rows.length === 0) return res.status(404).send('Task not found');

    const task_id = rows[0].id;

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
          t.status,
          t.rejection_reason,
          t.rejected_at,
          t.approved_at,
          t.completed_at,
          u._id AS user_id, 
          u.name AS user_name, 
          u.role AS user_role,
          rj.name AS rejected_by_name,
          rj.public_id AS rejected_by_public_id,
          ap.name AS approved_by_name,
          ap.public_id AS approved_by_public_id
      FROM 
          tasks t
      LEFT JOIN taskassignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u._id
      LEFT JOIN clientss c ON t.client_id = c.id
      LEFT JOIN users rj ON t.rejected_by = rj._id
      LEFT JOIN users ap ON t.approved_by = ap._id
      WHERE 
          t.id = ?
      ORDER BY 
          t.id;
    `;

    (async () => {
      try {
        const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
        const hasIsDeleted = await hasColumn('tasks', 'isDeleted');
        let finalQuery = query;
        if (hasIsDeleted && !includeDeleted) {
          finalQuery = finalQuery.replace('WHERE t.id = ?', 'WHERE t.id = ? AND t.isDeleted != 1');
        }

        db.query(finalQuery, [task_id], (qErr, results) => {
          if (qErr) return res.status(500).send('Error fetching task');
          if (!results || results.length === 0) return res.status(404).send('Task not found');

          const task = {
            task_id: results[0].task_id,
            title: results[0].title,
            client_name: results[0].client_name,
            description: results[0].description,
            stage: results[0].stage,
            status: results[0].status,
            rejection: results[0].rejection_reason ? {
              reason: results[0].rejection_reason,
              rejected_by: {
                name: results[0].rejected_by_name || 'Manager',
                id: results[0].rejected_by_public_id
              },
              rejected_at: results[0].rejected_at
            } : null,
            approval: results[0].approved_by_name ? {
              approved_by: results[0].approved_by_name,
              approved_by_id: results[0].approved_by_public_id,
              approved_at: results[0].approved_at
            } : null,
            taskDate: results[0].taskDate,
            priority: results[0].priority,
            createdAt: results[0].createdAt,
            updatedAt: results[0].updatedAt,
            time_alloted: results[0].time_alloted,
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

          if (role === 'Employee') {
            const assigned = task.assigned_users.some(u => String(u.user_id) === String(userId));
            if (!assigned) return res.status(403).json({ message: 'Forbidden' });
          }

          res.status(200).json(task);
        });
      } catch (err) {
        return res.status(500).send('Error fetching task');
      }
    })();
  });
});

// Existing handler kept for backward-compatibility
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
          t.status,
          t.rejection_reason,
          t.rejected_at,
          t.approved_at,
          t.completed_at,
          u._id AS user_id, 
          u.name AS user_name, 
          u.role AS user_role,
          rj.name AS rejected_by_name,
          rj.public_id AS rejected_by_public_id,
          ap.name AS approved_by_name,
          ap.public_id AS approved_by_public_id
      FROM 
          tasks t
      LEFT JOIN taskassignments ta ON t.id = ta.task_id
      LEFT JOIN users u ON ta.user_id = u._id
      LEFT JOIN clientss c ON t.client_id = c.id
      LEFT JOIN users rj ON t.rejected_by = rj._id
      LEFT JOIN users ap ON t.approved_by = ap._id
      WHERE 
          t.id = ?
      ORDER BY 
          t.id;
  `;

  (async () => {
    try {
      const includeDeleted = req.query.includeDeleted === '1' || req.query.includeDeleted === 'true';
      const hasIsDeleted = await hasColumn('tasks', 'isDeleted');
      let finalQuery = query;
      if (hasIsDeleted && !includeDeleted) {

        finalQuery = finalQuery.replace('WHERE t.id = ?', 'WHERE t.id = ? AND t.isDeleted != 1');
      }

      db.query(finalQuery, [task_id], (err, results) => {
        if (err) {
          return res.status(500).send("Error fetching task");
        }

        if (results.length === 0) {
          return res.status(404).send("Task not found");
        }

        const task = {
          task_id: results[0].task_id,
          title: results[0].title,
          client_name: results[0].client_name,
          description: results[0].description,
          stage: results[0].stage,
          status: results[0].status,
          rejection: results[0].rejection_reason ? {
            reason: results[0].rejection_reason,
            rejected_by: {
              name: results[0].rejected_by_name || 'Manager',
              id: results[0].rejected_by_public_id
            },
            rejected_at: results[0].rejected_at
          } : null,
          approval: results[0].approved_by_name ? {
            approved_by: results[0].approved_by_name,
            approved_by_id: results[0].approved_by_public_id,
            approved_at: results[0].approved_at
          } : null,
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

        if (role === 'Employee') {
          const assigned = task.assigned_users.some(u => String(u.user_id) === String(userId));
          if (!assigned) return res.status(403).json({ message: 'Forbidden' });
        }

        res.status(200).json(task);
      });
    } catch (err) {
      return res.status(500).send('Error fetching task');
    }
  })();

});

router.delete("/deltask/:task_id", requireRole(['Admin', 'Manager']), (req, res) => {
  const { task_id } = req.params;

  db.getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'DB connection error' });
    }

    connection.beginTransaction((err) => {
      if (err) {
        connection.release();
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

router.post("/createsub/:task_id", requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  const { task_id } = req.params;
  const { title, due_date, tag } = req.body;
  const createdAt = new Date();
  const updatedAt = createdAt;

  if (!title || !due_date || !tag) {
    logger.warn(`Invalid input provided for task_id: ${task_id}`);
    return res.status(400).send({ success: false, message: "Invalid input" });
  }

  try {
    // Only enforce read-only checks for non-admin/manager users
    if (req.user && req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      const assignRows = await q('SELECT is_read_only FROM taskassignments WHERE task_Id = ? AND user_Id = ? LIMIT 1', [task_id, req.user._id]);
      if (!assignRows || assignRows.length === 0) return res.status(403).json({ success: false, message: 'Not assigned' });
      const isRO = assignRows[0] && (assignRows[0].is_read_only === 1 || String(assignRows[0].is_read_only) === '1');
      if (isRO) return res.status(403).json({ success: false, message: 'Read-only users cannot modify checklist' });
    }

    const insertSubTaskQuery = `
      INSERT INTO subtasks (task_id, title, due_date, tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`;

    const result = await new Promise((resolve, reject) => db.query(
      insertSubTaskQuery,
      [task_id, title, due_date, tag, toMySQLDate(createdAt), toMySQLDate(updatedAt)],
      (err, results) => err ? reject(err) : resolve(results)
    ));

    logger.info(`Subtask created successfully for task_id: ${task_id}, subtask_id: ${result.insertId}`);
    return res.status(201).json({
      success: true,
      message: "Subtask created successfully",
      data: {
        id: result.insertId,
        task_id,
        title,
        due_date,
        tag,
        created_at: createdAt,
        updated_at: updatedAt,
      },
    });
  } catch (err) {
    logger.error(`Error inserting subtask for task_id: ${task_id} - ${err && err.message}`);
    return res.status(500).send({ success: false, message: "Database error", error: err && err.message });
  }
});

router.get("/getsubtasks/:task_id", (req, res) => {
  const { task_id } = req.params;
  const getsubtasks = `SELECT title, due_date, tag FROM subtasks WHERE task_Id = ? ORDER BY id ASC`;
  try {
    db.query(getsubtasks, [task_id], (err, results) => {
      if (err) {
        logger.error('Error fetching subtasks: ' + (err && err.message));
        return res.status(500).send({ auth: false, message: 'Database error' });
      }
      res.status(201).json(results);
    });
  } catch (err) {
    logger.error('Unexpected error fetching subtasks: ' + (err && err.message));
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).json({ error: "Failed to calculate total working hours" });
  }
});

router.post("/working-hours", requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    const { task_id, date, start_time, end_time } = req.body;

    if (!task_id || !date || !start_time || !end_time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const workingDate = new Date(date).toISOString().split("T")[0];

    // Only enforce read-only checks for non-admin/manager users
    if (req.user && req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      const assignRows = await q('SELECT is_read_only FROM taskassignments WHERE task_Id = ? AND user_Id = ? LIMIT 1', [task_id, req.user._id]);
      if (!assignRows || assignRows.length === 0) return res.status(403).json({ success: false, message: 'Not assigned' });
      const isRO = assignRows[0] && (assignRows[0].is_read_only === 1 || String(assignRows[0].is_read_only) === '1');
      if (isRO) return res.status(403).json({ success: false, message: 'Read-only users cannot add working hours' });
    }

    const query = `
      INSERT INTO WorkingHours (task_id, working_date, start_time, end_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [task_id, workingDate, start_time, end_time];

    await q(query, values);

    res.status(201).json({ message: "Working hours added successfully" });
  } catch (error) {
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
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.post("/taskhours", requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  const { encryptedData } = req.body;

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

    const { taskId, userId, date, hours } = decryptedData;

    if (!taskId || !userId || !date || !hours) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Only allow non-admin/manager users if they are assigned and not read-only
      if (req.user && req.user.role !== 'Admin' && req.user.role !== 'Manager') {
        if (String(req.user._id) !== String(userId)) return res.status(403).json({ success: false, error: 'Not authorized' });
        const assignRows = await q('SELECT is_read_only FROM taskassignments WHERE task_Id = ? AND user_Id = ? LIMIT 1', [taskId, userId]);
        if (!assignRows || assignRows.length === 0) return res.status(403).json({ success: false, error: 'Not assigned' });
        const isRO = assignRows[0] && (assignRows[0].is_read_only === 1 || String(assignRows[0].is_read_only) === '1');
        if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot record hours' });
      }

      const query = `
        INSERT INTO task_hours (task_id, user_id, date, hours)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE hours = VALUES(hours), updated_at = CURRENT_TIMESTAMP
      `;

      await q(query, [taskId, userId, date, hours]);
      return res.status(200).json({ message: "Hours saved successfully" });
    } catch (err) {
      return res.status(500).json({ error: "Failed to save hours" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to process request" });
  }
});

router.put("/updatetask/:id", requireRole(['Admin', 'Manager']), async (req, res) => {
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
      [stage, title, priority, description, client_id, toMySQLDate(taskDate), time_alloted, toMySQLDate(new Date()), taskId],
      async (err, result) => {
        if (err) {
          logger.error(`Error updating task: ${err.message}`);
          return res.status(500).json({ success: false, error: 'Database update error' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, error: 'Task not found' });
        }

        if (Array.isArray(assigned_to)) {

          if (assigned_to.length > 1) {
            return res.status(400).json({ success: false, error: 'Tasks must have exactly one assignee (single-user ownership)' });
          }
          const deleteQuery = `DELETE FROM taskassignments WHERE task_Id = ?`;

          await new Promise((resolve, reject) => db.query(deleteQuery, [taskId], (delErr) => delErr ? reject(delErr) : resolve()));

          if (assigned_to.length === 1) {
            const candidate = assigned_to[0];
            const candidateId = String(candidate);
            const hasActive = await assigneeHasActiveTask(candidateId);
            if (hasActive) {
              return res.status(400).json({ success: false, error: 'The selected assignee already has an active task and cannot be assigned another until it is completed.' });
            }
            const insertQuery = `INSERT INTO taskassignments (task_Id, user_Id) VALUES (?, ?)`;
            try {
              await new Promise((resolve, reject) => db.query(insertQuery, [taskId, candidateId], (insErr) => insErr ? reject(insErr) : resolve()));
            } catch (insErr) {
              logger.error(`Error assigning user: ${insErr.message}`);
            }
          }
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
    res.status(500).json({ error: "Failed to fetch task hours" });
  }
});

router.post("/taskdetail/Postactivity", async (req, res) => {
  const { task_id, user_id, type, activity } = req.body;

  logger.info(`Received POST request to add task activity: task_id=${task_id}, user_id=${user_id}`);

  const sql = `
    INSERT INTO task_activities (task_id, user_id, type, activity)
    VALUES (?, ?, ?, ?)
  `;

  try {
    // enforce assignment and read-only checks for non-admin/manager
    if (req.user && req.user.role !== 'Admin' && req.user.role !== 'Manager') {
      if (String(req.user._id) !== String(user_id)) return res.status(403).json({ success: false, error: 'Not authorized' });
      const assignRows = await q('SELECT is_read_only FROM taskassignments WHERE task_Id = ? AND user_Id = ? LIMIT 1', [task_id, user_id]);
      if (!assignRows || assignRows.length === 0) return res.status(403).json({ success: false, error: 'Not assigned' });
      const isRO = assignRows[0] && (assignRows[0].is_read_only === 1 || String(assignRows[0].is_read_only) === '1');
      if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot add activities' });
    }

    const result = await new Promise((resolve, reject) => db.query(sql, [task_id, user_id, type, activity], (err, r) => err ? reject(err) : resolve(r)));
    logger.info(`Task activity added successfully: task_id=${task_id}, user_id=${user_id}, activity_id=${result.insertId}`);
    return res.status(201).json({ message: "Task activity added successfully.", id: result.insertId });
  } catch (err) {
    logger.error(`Error adding task activity: ${err && err.message}`);
    return res.status(500).json({ error: "Failed to add task activity." });
  }
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

    db.query(sql, [id], (err, result) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Failed to fetch task activities." });
      }

      res.status(200).json(result);
    });
  } catch (error) {
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});


router.post('/:id/request-reassignment', requireRole(['Employee']), async (req, res) => {
  let taskId = req.params.id;
  if (typeof taskId === 'string' && !/^\d+$/.test(taskId)) {
    const [rows] = await new Promise((resolve, reject) =>
      db.query('SELECT id FROM tasks WHERE public_id = ?', [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    if (!rows?.length) return res.status(404).json({ success: false, error: 'Task not found' });
    taskId = rows[0].id;
  }

  const employee = req.user;
  const { reason } = req.body;
  try {
    const [existingReq] = await new Promise((resolve, reject) =>
      db.query(`SELECT id FROM task_resign_requests WHERE task_id = ? AND status = 'PENDING'`, [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    if (existingReq?.length > 0) return res.status(409).json({ success: false, error: 'Pending request exists' });

    const [taskRows] = await new Promise((resolve, reject) =>
      db.query(`
        SELECT t.*, p.name as project_name, p.project_manager_id, u_pm._id as pm_id, u_pm.public_id as pm_public_id, u_pm.name as pm_name, u_pm.email as pm_email
        FROM tasks t 
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u_pm ON p.project_manager_id = u_pm._id AND u_pm.role = 'Manager' AND u_pm.isActive = 1
        WHERE t.id = ?
      `, [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    if (!taskRows?.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const fullTask = taskRows[0];

    try {
      await ensureProjectOpen(fullTask.project_id);
    } catch (err) {
      return res.status(err.status || 403).json({ success: false, error: err.message });
    }

    let manager = null;
    if (fullTask.pm_id) {
      manager = {
        _id: fullTask.pm_id,
        public_id: fullTask.pm_public_id,
        name: fullTask.pm_name,
        email: fullTask.pm_email
      };
    }

    if (!manager) {
      const [mgrRows] = await new Promise((resolve, reject) =>
        db.query(`
          SELECT DISTINCT u._id, u.public_id, u.name, u.email
          FROM taskassignments ta 
          JOIN users u ON ta.user_Id = u._id
          WHERE ta.task_Id = ? AND u.role = 'Manager' AND u.isActive = 1
          ORDER BY u.name ASC LIMIT 1
        `, [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
      );
      if (mgrRows?.length > 0) manager = mgrRows[0];
    }

    if (!manager) {
      const [fallback] = await new Promise((resolve, reject) =>
        db.query(
          `SELECT _id, public_id, name, email 
           FROM users 
           WHERE role = 'Manager' AND isActive = 1 AND email NOT LIKE '%@example.com' 
           ORDER BY name ASC LIMIT 1`, 
          [], (err, rows) => err ? reject(err) : resolve([rows])
        )
      );
      manager = fallback?.[0];
    }
    if (!manager) return res.status(400).json({ success: false, error: 'No manager found' });

    // Ensure requesting user is assigned and not read-only before allowing reassignment request
    try {
      const assignCheck = await q('SELECT user_Id as user_id, is_read_only FROM taskassignments WHERE task_Id = ? AND user_Id = ?', [taskId, employee._id]);
      if (!assignCheck || assignCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this task' });
      }
      const isRO = assignCheck[0] && (assignCheck[0].is_read_only === 1 || String(assignCheck[0].is_read_only) === '1');
      if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot request reassignment' });
    } catch (e) {
      // If permission check fails due to DB issues, deny the action conservatively
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }

    const [insertResult] = await new Promise((resolve, reject) =>
      db.query(
        'INSERT INTO task_resign_requests (task_id, requested_by, reason, status) VALUES (?, ?, ?, ?)', 
        [taskId, employee._id, reason || null, 'PENDING'], 
        (err, result) => err ? reject(err) : resolve([result])
      )
    );
    await new Promise((resolve, reject) =>
      db.query(`UPDATE tasks SET status = 'On Hold', live_timer = NULL WHERE id = ?`, [taskId], (err) => err ? reject(err) : resolve())
    );

    try {
      const taskLink = `${(process.env.FRONTEND_URL || process.env.BASE_URL || '')}/tasks/${fullTask.public_id}`;
      if (manager.email && !manager.email.includes('@example.com')) {
        const { subject, text, html } = emailService.taskReassignmentRequestTemplate({
          taskTitle: fullTask.title,
          requesterName: employee.name,
          reason: reason || 'None provided',
          taskLink
        });
        // validate recipient exists and send safely
        await safeSendEmailForTask(taskId, manager.email, { subject, text, html });
      }
    } catch (e) { logger.error(`Failed to send reassignment request email for task=${taskId}: ${e && e.message}`); }

    res.json({
      success: true,
      message: '✅ Task LOCKED (On Hold) - Manager notified',
      request_id: insertResult.insertId,
      task_status: 'On Hold',
      manager_id: manager.public_id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:taskId/reassign-requests/:requestId/:action(approve|reject)', requireRole(['Manager']), async (req, res) => {
  let { taskId, requestId, action } = req.params;
  
  const dbTransaction = (connection) => new Promise((resolve, reject) => {
    if (connection) return resolve(connection);
    db.getConnection((err, conn) => {
      if (err) return reject(err);
      conn.beginTransaction(err => err ? reject(err) : resolve(conn));
    });
  });

  const commitTransaction = (connection) => new Promise((resolve, reject) => {
    connection.commit(err => {
      connection.release();
      err ? reject(err) : resolve();
    });
  });

  const rollbackTransaction = (connection) => new Promise((resolve, reject) => {
    connection.rollback(() => {
      connection.release();
      resolve();
    });
  });

  try {

    if (!/^\d+$/.test(taskId)) {
      const [rows] = await new Promise((resolve, reject) =>
        db.query('SELECT id FROM tasks WHERE public_id = ?', [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
      );
      if (!rows?.length) return res.status(404).json({ success: false, error: 'Task not found' });
      taskId = rows[0].id;
    }

    try {
      const tRows = await q('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [taskId]);
      const projId = tRows && tRows[0] ? tRows[0].project_id : null;
      await ensureProjectOpen(projId);
    } catch (err) {
      return res.status(err.status || 403).json({ success: false, error: err.message });
    }

    const [reqRows] = await new Promise((resolve, reject) =>
      db.query(
        `SELECT * FROM task_resign_requests 
         WHERE id = ? AND task_id = ? AND status = 'PENDING'`, 
        [requestId, taskId], 
        (err, rows) => err ? reject(err) : resolve([rows])
      )
    );
    if (!reqRows?.length) {
      return res.status(404).json({ success: false, error: 'No pending request found' });
    }
    const resignRequest = reqRows[0];

    let finalNewAssigneeId = (req.body && req.body.new_assignee_id) || resignRequest.new_assignee_id;
    if (finalNewAssigneeId && !/^\d+$/.test(finalNewAssigneeId)) {
      const uRows = await q('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [finalNewAssigneeId]);
      if (uRows?.length) finalNewAssigneeId = uRows[0]._id;
    }

    let newAssigneeUser = null;
    if (action.toUpperCase() === 'APPROVE') {
      if (!finalNewAssigneeId) {
        return res.status(400).json({ success: false, error: 'new_assignee_id is required' });
      }
      const [newUserRows] = await new Promise((resolve, reject) =>
        db.query('SELECT _id, name, email, public_id FROM users WHERE _id = ?', [finalNewAssigneeId], (err, rows) => err ? reject(err) : resolve([rows]))
      );
      if (!newUserRows?.length) {
        return res.status(400).json({ success: false, error: 'New assignee not found' });
      }
      newAssigneeUser = newUserRows[0];

      const hasActiveForNew = await assigneeHasActiveTask(finalNewAssigneeId);
      if (hasActiveForNew) return res.status(400).json({ success: false, error: 'The selected new assignee already has an active task and cannot be assigned another until it is completed.' });
    }

    const [oldUserRows] = await new Promise((resolve, reject) =>
      db.query('SELECT _id, name, email FROM users WHERE _id = ?', [resignRequest.requested_by], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    const oldAssigneeUser = oldUserRows?.[0];
    const managers = await q('SELECT name, email FROM users WHERE role IN ("Manager", "Admin") AND (tenant_id = ? OR tenant_id IS NULL)', [req.tenantId || 1]);

    const newStatus = action.toUpperCase();
    const managerId = req.user._id;
    const managerName = req.user.name;

    const [taskRows] = await new Promise((resolve, reject) =>
      db.query('SELECT * FROM tasks WHERE id = ?', [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    if (!taskRows?.length) return res.status(404).json({ success: false, error: 'Task not found' });
    const task = taskRows[0];

    // Capture previous assignment flags so we don't accidentally elevate read-only users
    const prevAssignments = await new Promise((resolve, reject) =>
      db.query('SELECT user_Id as user_id, is_read_only FROM taskassignments WHERE task_id = ?', [taskId], (err, rows) => err ? reject(err) : resolve(rows))
    );

    const prevAssigneeUser = await new Promise((resolve, reject) =>
      db.query('SELECT name, email FROM users WHERE _id = ?', [resignRequest.requested_by], (err, rows) => err ? reject(err) : resolve(rows))
    );
    const prevAssigneeName = prevAssigneeUser?.[0]?.name || 'Previous Assignee';

    const connection = await dbTransaction();
    
    try {

      await new Promise((resolve, reject) => {
        connection.query(
          `UPDATE task_resign_requests 
           SET status = ?, responded_at = NOW(), responded_by = ?, responder_name = ? 
           WHERE id = ?`,
          [newStatus, managerId, managerName, requestId],
          (err) => err ? reject(err) : resolve()
        );
      });

      if (newStatus === 'APPROVE') {

        await new Promise((resolve, reject) => {
          connection.query(
            `UPDATE tasks SET status = 'In Progress', is_locked = 1 WHERE id = ?`,
            [taskId],
            (err) => err ? reject(err) : resolve()
          );
        });

        // Also update tasks.assigned_to (if column exists) and refreshed updatedAt within the same transaction
        try {
          const hasAssignedCol = await hasColumn('tasks', 'assigned_to');
          if (hasAssignedCol && finalNewAssigneeId) {
            const jsonAssigned = JSON.stringify([finalNewAssigneeId]);
            await new Promise((resolve, reject) => {
              connection.query(
                `UPDATE tasks SET assigned_to = ?, updatedAt = NOW() WHERE id = ?`,
                [jsonAssigned, taskId],
                (err) => err ? reject(err) : resolve()
              );
            });
          } else {
            // If assigned_to doesn't exist, still refresh updatedAt if present
            const hasUpdatedAt = await hasColumn('tasks', 'updatedAt');
            if (hasUpdatedAt) {
              await new Promise((resolve, reject) => {
                connection.query(`UPDATE tasks SET updatedAt = NOW() WHERE id = ?`, [taskId], (err) => err ? reject(err) : resolve());
              });
            }
          }
        } catch (e) {
          // If checking/setting columns fails, rollback will handle consistency downstream
          throw e;
        }


        await new Promise((resolve, reject) => {
          connection.query('DELETE FROM taskassignments WHERE task_Id = ?', [taskId], (err) => err ? reject(err) : resolve());
        });

        if (finalNewAssigneeId) {
          // preserve previous is_read_only flag for this user (do not elevate someone who was read-only)
          const prev = Array.isArray(prevAssignments) ? prevAssignments.find(p => String(p.user_id) === String(finalNewAssigneeId)) : null;
          const newIsReadOnly = (prev && (prev.is_read_only === 1 || String(prev.is_read_only) === '1')) ? 1 : 0;
          await new Promise((resolve, reject) => {
            connection.query(
              'INSERT INTO taskassignments (task_Id, user_Id, is_read_only) VALUES (?, ?, ?)',
              [taskId, finalNewAssigneeId, newIsReadOnly],
              (err) => err ? reject(err) : resolve()
            );
          });
        }

        await new Promise((resolve, reject) => {
          connection.query(
            'INSERT INTO taskassignments (task_Id, user_Id, is_read_only) VALUES (?, ?, 1)',
            [taskId, resignRequest.requested_by],
            (err) => err ? reject(err) : resolve()
          );
        });

          // Start timer for the new assignee so UI shows live timer after approval
          try {
            if (finalNewAssigneeId) {
              const now = new Date();
              const wasOnHold = task && task.status && String(task.status).toUpperCase() === 'ON HOLD';
              const startAction = wasOnHold ? 'resume' : 'start';

              await new Promise((resolve, reject) => {
                connection.query(
                  'UPDATE tasks SET live_timer = ?, started_at = COALESCE(started_at, ?) WHERE id = ?',
                  [now, now, taskId],
                  (err) => err ? reject(err) : resolve()
                );
              });

              await new Promise((resolve, reject) => {
                connection.query(
                  'INSERT INTO task_time_logs (task_id, user_id, action, timestamp) VALUES (?, ?, ?, ?)',
                  [taskId, finalNewAssigneeId, startAction, now],
                  (err) => err ? reject(err) : resolve()
                );
              });
            }
          } catch (timerErr) {
            // Do not fail the entire approval for timer issues; log and continue
            logger.error(`Failed to start timer on reassignment approval for task=${taskId}: ${timerErr && timerErr.message}`);
          }

        await commitTransaction(connection);

        const taskLink = `${(process.env.FRONTEND_URL || process.env.BASE_URL || '')}/tasks/${task.public_id || task.id}`;

        try {
          // Send only to old and new assignees (validate via safeSendEmailForTask)
          if (oldAssigneeUser?.email) {
            await safeSendEmailForTask(taskId, oldAssigneeUser.email, emailService.taskReassignmentOldAssigneeTemplate({
              taskTitle: task.title || 'Task',
              newAssignee: newAssigneeUser?.name || 'New Assignee',
              taskLink
            }));
          }

          if (newAssigneeUser?.email) {
            await safeSendEmailForTask(taskId, newAssigneeUser.email, emailService.taskReassignmentApprovedTemplate({
              taskTitle: task.title || 'Task',
              oldAssignee: oldAssigneeUser?.name || 'Previous Assignee',
              newAssignee: newAssigneeUser.name,
              taskLink
            }));
          }
        } catch (emailError) {
          logger.error(`Error sending approval emails for task=${taskId}: ${emailError && emailError.message}`);
        }

        return res.json({
          success: true,
          message: 'Reassignment approved successfully',
          action_taken: newStatus,
          task_status: 'Request Approved',
          locked: true,
          task: {
            id: task.public_id || task.id,
            title: task.title,
            priority: task.priority,
            stage: 'Request Approved'
          },
          assigned_to: newAssigneeUser ? {
            id: newAssigneeUser.public_id || newAssigneeUser._id,
            name: newAssigneeUser.name,
            email: newAssigneeUser.email
          } : null
        });

      } else if (newStatus === 'REJECT') {

        await new Promise((resolve, reject) => {
          connection.query(
            `UPDATE tasks SET status = 'In Progress', is_locked = 0 WHERE id = ?`,
            [taskId],
            (err) => err ? reject(err) : resolve()
          );
        });

        await commitTransaction(connection);

        const taskLink = `${(process.env.FRONTEND_URL || process.env.BASE_URL || '')}/tasks/${task.public_id || task.id}`;

        if (oldAssigneeUser?.email) {
          try {
            await safeSendEmailForTask(taskId, oldAssigneeUser.email, emailService.taskReassignmentRejectedTemplate({
              taskTitle: task.name || task.title || 'Task',
              taskLink
            }));
          } catch (e) {
            logger.error(`Failed to queue rejection email for task=${taskId}, recipient=${oldAssigneeUser.email}: ${e && e.message}`);
          }
        }

        const rejectedManagerTemplate = emailService.taskReassignmentRejectedManagerTemplate({
          taskTitle: task.name || task.title || 'Task',
          oldAssignee: oldAssigneeUser?.name || 'Previous Assignee',
          taskLink
        });

        // Manager notifications suppressed: per policy only old/new assignees receive reassignment emails

        return res.json({
          success: true,
          message: `Reassignment rejected. Task resumed for ${oldAssigneeUser?.name}.`,
          action_taken: newStatus,
          task_status: 'In Progress',
          locked: false
        });

      } else {
        await rollbackTransaction(connection);
        return res.status(400).json({ success: false, error: 'Invalid action (approve|reject)' });
      }
    }
    catch (txError) {
      await rollbackTransaction(connection);
      throw txError;
    }

  } catch (error) {
    logger.error('❌ Manager action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/reassign-requests', requireRole(['Employee', 'Manager']), async (req, res) => {
  let taskId = req.params.id;
  if (typeof taskId === 'string' && !/^\d+$/.test(taskId)) {
    const [rows] = await new Promise((resolve, reject) =>
      db.query('SELECT id FROM tasks WHERE public_id = ?', [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );
    if (!rows?.length) return res.status(404).json({ success: false, error: 'Task not found' });
    taskId = rows[0].id;
  }

  try {
    const [requests] = await new Promise((resolve, reject) =>
      db.query(`
        SELECT r.*, u.name as requester_name, u.public_id as requester_id, t.title, t.status as task_status,
               (SELECT u2.public_id FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_public_id,
               (SELECT u2.name FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_name,
               (SELECT u2.email FROM users u2 JOIN taskassignments ta2 ON ta2.user_Id = u2._id WHERE ta2.task_Id = t.id AND (ta2.is_read_only IS NULL OR ta2.is_read_only != 1) LIMIT 1) AS current_assignee_email
        FROM task_resign_requests r
        JOIN users u ON r.requested_by = u._id
        JOIN tasks t ON r.task_id = t.id
        WHERE r.task_id = ?
        ORDER BY r.requested_at DESC
      `, [taskId], (err, rows) => err ? reject(err) : resolve([rows]))
    );

    const latest = requests[0] || null;
    const isLocked = requests.some(r => r.status === 'PENDING');

    res.json({
      success: true,
      request: latest,
      requests,
      has_pending: requests.some(r => r.status === 'PENDING'),
      is_locked: isLocked,
      lock_info: latest ? {
        is_locked: isLocked,
        request_status: latest.status,
        request_id: latest.id,
        requested_at: latest.requested_at,
        responded_at: latest.responded_at,
        requested_by: latest.requested_by,
        requester_name: latest.requester_name,
        requester_id: latest.requester_id,
        responded_by: latest.responded_by,
        responder_name: latest.responder_name,
        task_status: latest.task_status
      } : {}
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/start', requireRole(['Employee']), async (req, res) => {
  try {
    await ensureTaskTimeLogsTable();
    
    const { id } = req.params;
    const userId = req.user._id;

    const task = await q('SELECT id, public_id, status FROM tasks WHERE id = ? OR public_id = ?', [id, id]);
    if (task.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    const taskId = task[0].id;
    const publicId = task[0].public_id;
    const currentStatus = task[0].status;

    const normalizedStatus = currentStatus?.toUpperCase().trim();

    if (normalizedStatus === 'IN PROGRESS') {
      return res.json({ success: true, message: 'Task already in progress' });
    }
    if (normalizedStatus !== 'TO DO' && normalizedStatus !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot start task with status '${currentStatus}'. Only 'TO DO' or 'PENDING' tasks can be started.` 
      });
    }

    const assignment = await q('SELECT * FROM taskassignments WHERE task_id = ? AND user_id = ?', [taskId, userId]);
    if (assignment.length === 0) return res.status(403).json({ success: false, error: 'Not assigned' });
    // Enforce read-only flag: assigned users with is_read_only must not start the task
    try {
      const assn = assignment[0];
      const isRO = (assn && (assn.is_read_only === 1 || String(assn.is_read_only) === '1')) || (assn && (assn.isReadOnly === 1 || String(assn.isReadOnly) === '1'));
      if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot modify task status' });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
    const [taskRow] = await q('SELECT is_locked FROM tasks WHERE id = ?', [taskId]);
    if (taskRow && taskRow.is_locked && req.user.role !== 'Admin' && req.user.role !== 'Manager') {

      const [assn] = await q('SELECT user_id FROM taskassignments WHERE task_id = ?', [taskId]);
      if (!assn || String(assn.user_id) !== String(userId)) {
        return res.status(403).json({ success: false, error: 'Task is read-only for you (reassigned).' });
      }
    }
    const [lockCheck] = await q(`SELECT trr.status FROM task_resign_requests trr WHERE trr.task_id = ? AND trr.status = 'PENDING'`, [taskId]);
    if (lockCheck?.length > 0) return res.status(423).json({ success: false, error: 'Task locked - pending reassignment' });

    const now = new Date();
    await q('INSERT INTO task_time_logs (task_id, user_id, action, timestamp) VALUES (?, ?, ?, ?)', [taskId, userId, 'start', now]);
    await q('UPDATE tasks SET status = "In Progress", started_at = ?, live_timer = ? WHERE id = ?', [now, now, taskId]);

    await NotificationService.createAndSend(
      [userId],
      'Task Started',
      `You started working on task: ${publicId}`,
      'TASK_STARTED',
      'task',
      publicId
    );

    res.json({ 
      success: true, 
      message: '✅ Started',
      data: { taskId: publicId, status: 'In Progress', started_at: now.toISOString() }
    });
  } catch (e) {
    logger.error('Start error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/:id/pause', requireRole(['Employee']), async (req, res) => {
  try {
    await ensureTaskTimeLogsTable();
    
    const { id } = req.params;
    const userId = req.user._id;

    const task = await q('SELECT id, public_id, status FROM tasks WHERE id = ? OR public_id = ?', [id, id]);
    if (task.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    const taskId = task[0].id;
    const publicId = task[0].public_id;

    const normalizedStatus = task[0].status?.toUpperCase().trim();
    if (normalizedStatus !== 'IN PROGRESS') {
      return res.status(400).json({ success: false, error: `Cannot pause '${task[0].status}'. Only 'IN PROGRESS'.` });
    }

    const assignment = await q('SELECT * FROM taskassignments WHERE task_id = ? AND user_id = ?', [taskId, userId]);
    if (assignment.length === 0) return res.status(403).json({ success: false, error: 'Not assigned' });
    // Enforce read-only flag for pause
    try {
      const assn = assignment[0];
      const isRO = (assn && (assn.is_read_only === 1 || String(assn.is_read_only) === '1')) || (assn && (assn.isReadOnly === 1 || String(assn.isReadOnly) === '1'));
      if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot modify task status' });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }

    const now = new Date();
    const lastLog = await q('SELECT timestamp FROM task_time_logs WHERE task_id = ? AND action IN ("start", "resume") ORDER BY timestamp DESC LIMIT 1', [taskId]);
    let duration = lastLog.length > 0 ? Math.floor((now - new Date(lastLog[0].timestamp)) / 1000) : 0;

    await q('INSERT INTO task_time_logs (task_id, user_id, action, timestamp, duration) VALUES (?, ?, ?, ?, ?)', [taskId, userId, 'pause', now, duration]);
    await q('UPDATE tasks SET status = "On Hold", total_duration = COALESCE(total_duration, 0) + ?, live_timer = NULL WHERE id = ?', [duration, taskId]);

    await NotificationService.createAndSend(
      [userId],
      'Task Paused',
      `You paused task: ${publicId}`,
      'TASK_PAUSED',
      'task',
      publicId
    );

    res.json({ success: true, message: '⏸️ Paused', data: { taskId: publicId, status: 'On Hold' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/:id/resume', requireRole(['Employee']), async (req, res) => {
  try {
    await ensureTaskTimeLogsTable();
    
    const { id } = req.params;
    const userId = req.user._id;

    const task = await q('SELECT id, public_id, status FROM tasks WHERE id = ? OR public_id = ?', [id, id]);
    if (task.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    const taskId = task[0].id;

    const normalizedStatus = task[0].status?.toUpperCase().trim();
    if (normalizedStatus !== 'ON HOLD') {
      return res.status(400).json({ success: false, error: `Cannot resume '${task[0].status}'. Only 'ON HOLD'.` });
    }

    const assignment = await q('SELECT * FROM taskassignments WHERE task_id = ? AND user_id = ?', [taskId, userId]);
    if (assignment.length === 0) return res.status(403).json({ success: false, error: 'Not assigned' });
    // Enforce read-only flag for resume
    try {
      const assn = assignment[0];
      const isRO = (assn && (assn.is_read_only === 1 || String(assn.is_read_only) === '1')) || (assn && (assn.isReadOnly === 1 || String(assn.isReadOnly) === '1'));
      if (isRO) return res.status(403).json({ success: false, error: 'Read-only users cannot modify task status' });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }

    const now = new Date();
    await q('INSERT INTO task_time_logs (task_id, user_id, action, timestamp) VALUES (?, ?, ?, ?)', [taskId, userId, 'resume', now]);
    await q('UPDATE tasks SET status = "In Progress", updatedAt = NOW() WHERE id = ?', [taskId]);

    await NotificationService.createAndSend(
      [userId],
      'Task Resumed',
      `Task resumed: ${task[0].public_id}`,
      'TASK_RESUMED',
      'task',
      task[0].public_id
    );

    res.json({ success: true, message: '▶️ Resumed', data: { status: 'In Progress' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


router.get('/:id/timeline', requireRole(['Admin', 'Manager', 'Employee']), async (req, res) => {
  try {
    await ensureTaskTimeLogsTable();
    
    let id = req.params.id;
    if (req.headers['x-task-public-id']) id = req.headers['x-task-public-id'];

    const taskResult = await db.query('SELECT id FROM tasks WHERE id = ? OR public_id = CAST(? AS CHAR)', [id, id]);
    if (!taskResult?.length) return res.status(404).json({ success: false, error: 'Task not found' });

    const taskId = taskResult[0].id;
    const logs = await q('SELECT * FROM task_time_logs WHERE task_id = ? ORDER BY timestamp DESC', [taskId]);
    const activities = await q('SELECT * FROM task_activities WHERE task_id = ? ORDER BY created_at DESC', [taskId]);

    res.json({ success: true, data: { logs, activities } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;