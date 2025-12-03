const db = require(__root + "db");
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const router = express.Router();
// tenantMiddleware intentionally not applied here (only Tasks/Projects are tenant-scoped)
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
require('dotenv').config();

// Apply auth to uploads (tenant scoping removed — only Projects & Tasks will enforce tenant)
router.use(requireAuth);

// AWS S3 Client Setup
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer Storage Setup (in-memory storage for file upload)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST route for file upload (Admin/Manager/Employee only)
router.post('/upload', requireRole(['Admin','Manager','Employee']), upload.single('file'), async (req, res) => {
  try {
    // Ensure taskId and userId are provided in the body
    const { taskId, userId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!taskId || !userId) {
      return res.status(400).json({ error: 'Task ID and User ID are required' });
    }

    // Log the incoming request body and file data for debugging
    console.log('Request Body:', req.body);
    console.log('Uploaded File:', req.file);

    // Generate a unique name for the file
    const uniqueName = `${Date.now()}-${req.file.originalname}`;

    // Upload the file to AWS S3
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: uniqueName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    const uploadCommand = new PutObjectCommand(uploadParams);

    // Send the file to S3 and wait for the upload to complete
    await s3.send(uploadCommand);

    // Construct the file URL from the S3 bucket and key
    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueName}`;

    // Insert the file details into the database
    const query = `
      INSERT INTO files (file_url, file_name, file_type, file_size, task_id, user_id, uploaded_at, isActive)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), 1)
    `;
    const queryParams = [
      fileUrl,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      taskId,
      userId
    ];

    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error('Database Error:', err);
        return res.status(500).json({ error: 'Failed to save file details to the database' });
      }
      res.status(201).json({ message: 'File uploaded successfully', fileUrl });
    });
  } catch (error) {
    console.error('Error in file upload process:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/getuploads/:id', requireRole(['Admin','Manager','Employee']), async (req, res) => {
  const { id } = req.params; 
    try {
        const query = `
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

        // Pass the id as a parameter to prevent SQL injection
      db.query(query, [id], (err, results) => {
            if (err) {
                console.error("Database Error:", err);
                return res.status(500).json({ error: 'Failed to fetch the file upload from database' });
            }

            if (results.length === 0) {
                return res.status(201).json({ message: 'Please upload a File' });
            }

            // Return the fetched file upload as JSON
            res.status(200).json({
                message: 'File upload fetched successfully',
                // data: results[0]
                data: results
            });
        });
    } catch (error) {
        console.error("Error fetching file upload:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



module.exports = router;
