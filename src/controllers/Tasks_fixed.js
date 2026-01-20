const express = require('express');
const router = express.Router();
const db = require(__root + 'db');
const logger = require(__root + 'logger');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');
const NotificationService = require(__root + 'services/notificationService');

router.use(requireAuth);

// GET /tasks - list tasks
router.get('/', ruleEngine(RULES.TASK_VIEW), requireRole(['Admin','Manager','Employee']), async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => db.query(
      'SELECT id, public_id, title, status FROM tasks ORDER BY id DESC LIMIT 100',
      (e, r) => e ? reject(e) : resolve(r)
    ));
    const data = (rows || []).map(r => ({ id: r.public_id || String(r.id), title: r.title, status: r.status }));
    return res.json({ success: true, data, meta: { count: data.length } });
  } catch (err) {
    logger.error('tasks:list error: ' + (err && err.message));
    return res.status(500).json({ success: false, error: 'Failed fetching tasks' });
  }
});

// POST /tasks/createjson - create a simple task
router.post('/createjson', ruleEngine(RULES.TASK_CREATE), requireRole(['Admin','Manager']), async (req, res) => {
  try {
    const { title, description, client_id } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title required' });
    const createdAt = new Date();
    const result = await new Promise((resolve, reject) => db.query(
      'INSERT INTO tasks (title, description, client_id, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [title, description || null, client_id || null, createdAt, createdAt],
      (e, r) => e ? reject(e) : resolve(r)
    ));
    const newId = result.insertId;
    // try sending notification (non-blocking)
    try { NotificationService.createAndSendToRoles(['Manager','Admin'], 'New Task Created', `Task "${title}" created`, 'TASK_CREATED', 'task', String(newId), req.user && req.user.tenant_id).catch(()=>{}); } catch(_) {}
    return res.status(201).json({ success: true, data: { id: String(newId), title, description } });
  } catch (err) {
    logger.error('tasks:create error: ' + (err && err.message));
    return res.status(500).json({ success: false, error: 'Failed creating task' });
  }
});

// POST /tasks/selected-details - fetch details for task ids/public_ids
router.post('/selected-details', ruleEngine(RULES.TASK_VIEW), requireRole(['Admin','Manager','Employee']), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.taskIds) ? req.body.taskIds : (Array.isArray(req.body.task_ids) ? req.body.task_ids : []);
    if (!ids.length) return res.status(400).json({ success: false, error: 'taskIds required' });
    const numeric = ids.filter(v => /^\d+$/.test(String(v))).map(Number);
    const rows = await new Promise((resolve, reject) => db.query(
      'SELECT id, public_id, title, status FROM tasks WHERE id IN (?) OR public_id IN (?)',
      [numeric.length ? numeric : [-1], ids],
      (e, r) => e ? reject(e) : resolve(r)
    ));
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    logger.error('selected-details error: ' + (err && err.message));
    return res.status(500).json({ success: false, error: 'Failed fetching selected details' });
  }
});

// GET /tasks/taskdropdown - id/title list
router.get('/taskdropdown', ruleEngine(RULES.TASK_VIEW), requireRole(['Admin','Manager','Employee']), async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => db.query('SELECT id, title FROM tasks ORDER BY title LIMIT 500', (e, r) => e ? reject(e) : resolve(r)));
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    logger.error('taskdropdown error: ' + (err && err.message));
    return res.status(500).json({ success: false, error: 'Failed fetching task dropdown' });
  }
});

module.exports = router;