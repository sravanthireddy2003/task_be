const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require(__root + 'db');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Storage abstraction
class StorageProvider {
  constructor(type) {
    this.type = type;
  }

  async upload(file, key) {
    throw new Error('Implement in subclass');
  }

  async getSignedUrl(key, expiresIn = 3600) {
    throw new Error('Implement in subclass');
  }
}

class S3Storage extends StorageProvider {
  constructor() {
    super('s3');
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET;
  }

  async upload(file, key) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
      },
    });
    await this.client.send(command);
    return `s3://${this.bucket}/${key}`;
  }

  async getSignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn });
  }
}

class LocalStorage extends StorageProvider {
  constructor() {
    super('local');
  }

  async upload(file, key) {
    // For local storage, just return the file path
    return file.path;
  }

  async getSignedUrl(key, expiresIn = 3600) {
    // For local storage, return the local URL
    return `${process.env.BASE_URL || 'http://localhost:4000'}/uploads/${key}`;
  }
}

// Factory for storage providers
const getStorageProvider = () => {
  const provider = process.env.STORAGE_PROVIDER || 'local';
  switch (provider) {
    case 's3':
      return new S3Storage();
    case 'local':
      return new LocalStorage();
    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
};

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
});

const q = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

module.exports = {
  uploadDocument: [
    upload.single('document'),
    async (req, res) => {
      try {
        const { entityType, entityId } = req.body;
        const userId = req.user._id;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        if (!['CLIENT', 'PROJECT', 'TASK'].includes(entityType)) {
          return res.status(400).json({ success: false, error: 'Invalid entity type' });
        }

        // Verify entity exists
        let entityTable, entityIdColumn;
        switch (entityType) {
          case 'CLIENT':
            entityTable = 'clientss';
            entityIdColumn = 'id';
            break;
          case 'PROJECT':
            entityTable = 'projects';
            entityIdColumn = 'id';
            break;
          case 'TASK':
            entityTable = 'tasks';
            entityIdColumn = 'id';
            break;
        }

        const entityExists = await q(`SELECT 1 FROM ${entityTable} WHERE ${entityIdColumn} = ?`, [entityId]);
        if (!entityExists.length) {
          return res.status(404).json({ success: false, error: 'Entity not found' });
        }

        // Upload to storage
        const storage = getStorageProvider();
        const key = `documents/${Date.now()}-${file.filename}`;
        const filePath = await storage.upload(file, key);

        // Save to DB
        const documentId = crypto.randomBytes(8).toString('hex');
        await q(
          'INSERT INTO documents (documentId, entityType, entityId, uploadedBy, storageProvider, filePath, fileName, fileSize, mimeType, encrypted, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
          [documentId, entityType, entityId, userId, storage.type, filePath, file.originalname, file.size, file.mimetype, false]
        );

        // Clean up temp file
        fs.unlinkSync(file.path);

        res.status(201).json({
          success: true,
          data: {
            documentId,
            entityType,
            entityId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
          },
        });
      } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
      }
    },
  ],

  listDocuments: async (req, res) => {
    try {
      const projectPublicId = req.headers['project-id'] || req.headers['project-public-id'] || req.headers['projectid'];
      const clientId = req.headers['client-id'] || req.headers['clientid'];
      const taskId = req.headers['task-id'] || req.headers['taskid'];
      const userId = req.user._id;
      const userRole = req.user.role;

      let entityId = null;
      let entityType = null;

      if (projectPublicId) {
        // Get project id from public_id
        const project = await q('SELECT id FROM projects WHERE public_id = ?', [projectPublicId]);
        if (project.length > 0) {
          entityId = project[0].id;
          entityType = 'PROJECT';
        }
      } else if (clientId) {
        entityId = clientId;
        entityType = 'CLIENT';
      } else if (taskId) {
        entityId = taskId;
        entityType = 'TASK';
      }

      let whereClause = '';
      let params = [];

      if (entityId && entityType) {
        whereClause = 'AND d.entityType = ? AND d.entityId = ?';
        params = [entityType, entityId];
      }

      // Role-based filtering
      if (userRole === 'EMPLOYEE') {
        whereClause += ' AND da.userId = ? AND da.accessType IN (?, ?)';
        params.push(userId, 'READ', 'WRITE');
      } else if (userRole === 'MANAGER') {
        // Managers can see documents for their projects
        whereClause += ' AND (da.userId = ? OR d.entityId IN (SELECT id FROM projects WHERE project_manager_id = ?))';
        params.push(userId, userId);
      }
      // Admins can see all

      const documents = await q(`
        SELECT d.*, u.name as uploadedByName, da.accessType
        FROM documents d
        LEFT JOIN users u ON u._id = d.uploadedBy
        LEFT JOIN document_access da ON da.documentId = d.documentId AND da.userId = ?
        WHERE 1=1 ${whereClause}
        ORDER BY d.createdAt DESC
      `, [userId, ...params]);

      res.json({ success: true, data: documents });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  getDocumentPreview: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const userRole = req.user.role;

      // Check access
      const access = await q(`
        SELECT d.*, da.accessType
        FROM documents d
        LEFT JOIN document_access da ON da.documentId = d.documentId AND da.userId = ?
        WHERE d.documentId = ?
      `, [userId, id]);

      if (!access.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const doc = access[0];
      if (userRole === 'EMPLOYEE' && !doc.accessType) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Generate signed URL for preview
      const storage = getStorageProvider();
      const signedUrl = await storage.getSignedUrl(doc.filePath.replace(`${storage.type}://${storage.bucket}/`, ''), 3600);

      res.json({ success: true, data: { previewUrl: signedUrl, metadata: doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  downloadDocument: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const userRole = req.user.role;

      // Check access with DOWNLOAD permission
      const access = await q(`
        SELECT d.*, da.accessType
        FROM documents d
        LEFT JOIN document_access da ON da.documentId = d.documentId AND da.userId = ?
        WHERE d.documentId = ? AND (da.accessType = ? OR ? = 'ADMIN' OR ? = 'MANAGER')
      `, [userId, id, 'DOWNLOAD', userRole, userRole]);

      if (!access.length) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const doc = access[0];
      const storage = getStorageProvider();
      const signedUrl = await storage.getSignedUrl(doc.filePath.replace(`${storage.type}://${storage.bucket}/`, ''), 3600);

      res.json({ success: true, data: { downloadUrl: signedUrl, metadata: doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  assignDocumentAccess: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, accessType } = req.body;
      const assignerId = req.user._id;
      const assignerRole = req.user.role;

      // Only admins and managers can assign access
      if (!['ADMIN', 'MANAGER'].includes(assignerRole)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      // Verify document exists
      const doc = await q('SELECT * FROM documents WHERE documentId = ?', [id]);
      if (!doc.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      // Insert or update access
      await q(
        'INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessType = ?',
        [id, userId, accessType, accessType]
      );

      res.json({ success: true, message: 'Access assigned successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
};