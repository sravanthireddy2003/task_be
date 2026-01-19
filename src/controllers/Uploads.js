const db = require(__root + "db");
const express = require('express');
const { uploadDocument } = require(__root + 'middleware/multer');
const router = express.Router();
// tenantMiddleware intentionally not applied here (only Tasks/Projects are tenant-scoped)
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const RULES = require(__root + 'rules/ruleCodes');
/*
  Rule codes used in this router:
  - UPLOAD_CREATE, UPLOAD_VIEW, UPLOAD_DELETE
*/
require('dotenv').config();

// Temporary debug route available only outside production to allow unauthenticated testing
if (process.env.NODE_ENV !== 'production') {
  router.post('/debug-upload', uploadDocument.single('file'), async (req, res) => {
    try {
      const { taskId, userId } = req.body;
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      if (!taskId || !userId) return res.status(400).json({ error: 'Task ID and User ID are required' });
      const relativePath = `/uploads/${req.file.filename}`;
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const publicUrl = `${baseUrl}${relativePath}`;
      const doInsert = (resolvedUserId) => {
        const sql = `INSERT INTO files (file_url, file_name, file_type, file_size, task_id, user_id, uploaded_at, isActive) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
        const params = [relativePath, req.file.originalname, req.file.mimetype, req.file.size, taskId, resolvedUserId];
        db.query(sql, params, (err) => {
          if (err) return res.status(500).json({ error: 'Failed to save file details to the database' });
          return res.status(201).json({ message: 'Debug upload successful', fileUrl: publicUrl, filePath: relativePath });
        });
      };
      if (!/^\d+$/.test(String(userId))) {
        db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [userId], (uErr, uRows) => {
          if (uErr) return res.status(500).json({ error: 'Failed to resolve userId' });
          if (!uRows || uRows.length === 0) return res.status(400).json({ error: 'Invalid userId' });
          doInsert(uRows[0]._id);
        });
      } else {
        doInsert(userId);
      }
    } catch (e) { return res.status(500).json({ error: 'Internal error' }); }
  });
}

router.use(requireAuth);

const upload = uploadDocument;

router.post('/upload', ruleEngine(RULES.UPLOAD_CREATE), requireRole(['Admin','Manager','Employee']), upload.single('file'), async (req, res) => {
  try {
    const { taskId, userId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!taskId || !userId) return res.status(400).json({ error: 'Task ID and User ID are required' });

    const relativePath = `/uploads/${req.file.filename}`;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const publicUrl = `${baseUrl}${relativePath}`;

    const doInsert = (resolvedUserId) => {
      const sql = `INSERT INTO files (file_url, file_name, file_type, file_size, task_id, user_id, uploaded_at, isActive) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
      const params = [relativePath, req.file.originalname, req.file.mimetype, req.file.size, taskId, resolvedUserId];
      db.query(sql, params, (err) => {
        if (err) {
          console.error('Database Error:', err);
          return res.status(500).json({ error: 'Failed to save file details to the database' });
        }
        return res.status(201).json({ message: 'File uploaded successfully', fileUrl: publicUrl, filePath: relativePath });
      });
    };

    if (!/^\d+$/.test(String(userId))) {
      db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [userId], (uErr, uRows) => {
        if (uErr) {
          console.error('User lookup error:', uErr);
          return res.status(500).json({ error: 'Failed to resolve userId' });
        }
        if (!uRows || uRows.length === 0) return res.status(400).json({ error: 'Invalid userId' });
        doInsert(uRows[0]._id);
      });
    } else {
      doInsert(userId);
    }
  } catch (error) {
    console.error('Error in file upload process:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/getuploads/:id', ruleEngine(RULES.UPLOAD_VIEW), requireRole(['Admin','Manager','Employee']), async (req, res) => {
  const { id } = req.params;
  try {
    const baseQuery = `
      SELECT 
        f.id, f.file_url, f.file_name, f.file_type, f.file_size, f.uploaded_at, f.isActive, 
        t.id AS task_id, t.title AS task_name, 
        u._id AS user_id, u.name AS user_name
      FROM files f
      LEFT JOIN tasks t ON f.task_id = t.id
      LEFT JOIN users u ON f.user_id = u._id
      WHERE t.id = ?
      ORDER BY f.uploaded_at DESC
    `;

    const filterUserParam = req.query.userId;

    const runQuery = (resolvedUserId) => {
      let sql = baseQuery;
      const params = [id];
      if (resolvedUserId) {
        sql = sql.replace(/ORDER BY[\s\S]*$/m, '');
        sql += ' AND f.user_id = ? ORDER BY f.uploaded_at DESC';
        params.push(resolvedUserId);
      }
      db.query(sql, params, (err, results) => {
        if (err) {
          console.error('Database Error:', err);
          return res.status(500).json({ error: 'Failed to fetch the file upload from database' });
        }
        if (!results || results.length === 0) return res.status(201).json({ message: 'Please upload a File' });

        try {
          const userIds = Array.from(new Set(results.map(r => r.user_id).filter(Boolean)));
          if (userIds.length === 0) return res.status(200).json({ message: 'File upload fetched successfully', data: results });
          db.query('SELECT _id, public_id FROM users WHERE _id IN (?)', [userIds], (uErr, uRows) => {
            if (uErr || !Array.isArray(uRows)) return res.status(200).json({ message: 'File upload fetched successfully', data: results });
              const map = {};
              uRows.forEach(u => { map[u._id] = u.public_id || u._id; });
              const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
              const out = results.map(r => ({
                ...r,
                user_id: map[r.user_id] || r.user_id,
                // if file_url stored as relative path, return full URL to client
                file_url: r.file_url && String(r.file_url).startsWith('/uploads/') ? `${baseUrl}${r.file_url}` : r.file_url
              }));
              return res.status(200).json({ message: 'File upload fetched successfully', data: out });
          });
        } catch (e) {
          return res.status(200).json({ message: 'File upload fetched successfully', data: results });
        }
      });
    };

    if (filterUserParam) {
      const isNumeric = /^\d+$/.test(String(filterUserParam));
      if (isNumeric) { runQuery(filterUserParam); return; }
      db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [filterUserParam], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error resolving userId' });
        if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found for provided userId' });
        runQuery(rows[0]._id);
      });
      return;
    }

    runQuery(null);
  } catch (error) {
    console.error('Error fetching file upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;



