const db = require(__root + 'db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { uploadDocument } = require('../middleware/multer');

// Local storage helper
class LocalStorage {
  constructor() { 
    this.type = 'local'; 
  }
  
  getRelativePath(filename) {
    return `/uploads/${filename}`;
  }
  
  getPublicUrl(relativePath) {
    const base = process.env.BASE_URL || 'http://localhost:4000';
    if (relativePath.startsWith('/uploads/')) return `${base}${relativePath}`;
    return `${base}/uploads/${relativePath.replace(/^\//, '')}`;
  }
}

const storageProvider = new LocalStorage();
const q = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

module.exports = {
  // ✅ Upload document endpoint
  uploadDocument: [
    uploadDocument.single('document'),
    async (req, res) => {
      try {
        const { entityType, entityId } = req.body;
        const userId = req.user?._id;

        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        if (!['CLIENT', 'PROJECT', 'TASK'].includes(entityType)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, error: 'Invalid entity type' });
        }

        // Verify entity exists
        let entityTable, entityIdColumn;
        switch (entityType) {
          case 'CLIENT': entityTable = 'clientss'; entityIdColumn = 'id'; break;
          case 'PROJECT': entityTable = 'projects'; entityIdColumn = 'id'; break;
          case 'TASK': entityTable = 'tasks'; entityIdColumn = 'id'; break;
        }

        const entityExists = await q(`SELECT 1 FROM ${entityTable} WHERE ${entityIdColumn} = ?`, [entityId]);
        if (!entityExists.length) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ success: false, error: 'Entity not found' });
        }

        const relativePath = storageProvider.getRelativePath(req.file.filename);
        const documentId = crypto.randomBytes(8).toString('hex');

        await q(
          `INSERT INTO documents 
           (documentId, entityType, entityId, uploadedBy, storageProvider, filePath, fileName, fileSize, mimeType, encrypted, createdAt) 
           VALUES (?, ?, ?, ?, 'local', ?, ?, ?, ?, false, NOW())`,
          [documentId, entityType, entityId, userId, relativePath, req.file.originalname, req.file.size, req.file.mimetype]
        );

        const publicUrl = storageProvider.getPublicUrl(relativePath);

        res.status(201).json({
          success: true,
          data: {
            documentId,
            entityType,
            entityId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            filePath: relativePath,
            publicUrl
          }
        });
      } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ],

  // ✅ List documents
  listDocuments: async (req, res) => {
    try {
      const projectPublicId = req.headers['project-id'] || req.headers['project-public-id'] || req.headers['projectid'];
      const clientId = req.headers['client-id'] || req.headers['clientid'];
      const taskId = req.headers['task-id'] || req.headers['taskid'];
      const userId = req.user?._id;
      const userRole = req.user?.role;

      let entityId = null, entityType = null;
      if (projectPublicId) {
        const project = await q('SELECT id FROM projects WHERE public_id = ?', [projectPublicId]);
        if (project.length) { entityId = project[0].id; entityType = 'PROJECT'; }
      } else if (clientId) { entityId = clientId; entityType = 'CLIENT'; }
      else if (taskId) { entityId = taskId; entityType = 'TASK'; }

      let whereClause = '', params = [];
      if (entityId && entityType) {
        whereClause = 'AND d.entityType = ? AND d.entityId = ?';
        params = [entityType, entityId];
      }

      if (userRole === 'EMPLOYEE') {
        whereClause += ' AND da.userId = ? AND da.accessType IN (?, ?)';
        params.push(userId, 'READ', 'WRITE');
      } else if (userRole === 'MANAGER') {
        whereClause += ' AND (da.userId = ? OR d.entityId IN (SELECT id FROM projects WHERE project_manager_id = ?))';
        params.push(userId, userId);
      }

      const documents = await q(`
        SELECT d.*, u.name as uploadedByName, da.accessType
        FROM documents d
        LEFT JOIN users u ON u._id = d.uploadedBy
        LEFT JOIN document_access da ON da.documentId = d.documentId AND da.userId = ?
        WHERE 1=1 ${whereClause}
        ORDER BY d.createdAt DESC
      `, [userId, ...params]);

      const docsWithUrls = documents.map(doc => ({
        ...doc,
        publicUrl: doc.filePath ? storageProvider.getPublicUrl(doc.filePath) : null
      }));

      res.json({ success: true, data: docsWithUrls });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ Get document preview
  getDocumentPreview: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?._id;
      const userRole = req.user?.role;

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

      const previewUrl = doc.filePath ? storageProvider.getPublicUrl(doc.filePath) : null;
      res.json({ success: true, data: { previewUrl, metadata: doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ Download document
  downloadDocument: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?._id;
      const userRole = req.user?.role;

      const access = await q(`
        SELECT d.*, da.accessType 
        FROM documents d
        LEFT JOIN document_access da ON da.documentId = d.documentId AND da.userId = ?
        WHERE d.documentId = ? AND (da.accessType = 'DOWNLOAD' OR ? = 'ADMIN' OR ? = 'MANAGER')
      `, [userId, id, userRole, userRole]);

      if (!access.length) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const doc = access[0];
      const downloadUrl = doc.filePath ? storageProvider.getPublicUrl(doc.filePath) : null;
      res.json({ success: true, data: { downloadUrl, metadata: doc } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ Assign document access
  assignDocumentAccess: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, accessType } = req.body;
      const assignerRole = req.user?.role;

      if (!['ADMIN', 'MANAGER'].includes(assignerRole)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const doc = await q('SELECT * FROM documents WHERE documentId = ?', [id]);
      if (!doc.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      await q(
        'INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessType = ?',
        [id, userId, accessType, accessType]
      );

      res.json({ success: true, message: 'Access assigned successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};
