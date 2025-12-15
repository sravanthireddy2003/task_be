const db = require(__root + 'db');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

router.use(requireAuth);

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Minimal upload endpoint storing metadata in files table
router.post('/upload', requireRole(['Admin','Manager','Employee']), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const uniqueName = `${Date.now()}-${req.file.originalname}`;
    const fileUrl = `/uploads/${uniqueName}`; // serve via static middleware in main app
    const doInsert = (resolvedUserId) => {
      const sql = `INSERT INTO files (file_url, file_name, file_type, file_size, task_id, user_id, uploaded_at, isActive) VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)`;
      const params = [fileUrl, req.file.originalname, req.file.mimetype, req.file.size, req.body.taskId || null, resolvedUserId];
      db.query(sql, params, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to save file details to the database' });
        return res.status(201).json({ message: 'File uploaded successfully', fileUrl });
      });
    };

    if (!/^[0-9]+$/.test(String(req.body.userId || ''))) {
      db.query('SELECT _id FROM users WHERE public_id = ? LIMIT 1', [req.body.userId || ''], (uErr, uRows) => {
        if (uErr) return res.status(500).json({ error: 'Failed to resolve userId' });
        if (!uRows || uRows.length === 0) return res.status(400).json({ error: 'Invalid userId' });
        doInsert(uRows[0]._id);
      });
    } else {
      doInsert(req.body.userId || null);
    }
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
