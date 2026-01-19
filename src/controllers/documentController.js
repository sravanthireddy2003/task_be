const db = require(__root + 'db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { uploadDocument } = require('../middleware/multer');

// ✅ Local storage helper (matches your existing uploads system)
class LocalStorage {
  constructor() { 
    this.type = 'local'; 
  }
  
  getRelativePath(filename) {
    return `/uploads/${filename}`;
  }
  
  getPublicUrl(relativePath, req) {
    const base = req ? `${req.protocol}://${req.get('host')}` : (process.env.BASE_URL || 'http://localhost:4000');
    if (relativePath?.startsWith('/uploads/')) return `${base}${relativePath}`;
    return `${base}/uploads/${relativePath?.replace(/^\//, '') || ''}`;
  }
}

const storageProvider = new LocalStorage();
const q = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

module.exports = {
  // ✅ POST /api/documents/upload - Multer + Local Storage
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

        // ✅ Verify entity exists (matches your table names)
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

        const publicUrl = storageProvider.getPublicUrl(relativePath, req);
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
            publicUrl,
            file_url: publicUrl  // ✅ For your existing frontend components
          }
        });
      } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  ],

  // ✅ GET /api/documents - List with headers/query params
  listDocuments: async (req, res) => {
    try {
      const projectPublicId = req.headers['project-id'] || req.headers['project-public-id'] || req.headers['projectid'] || req.query.projectId;
      const clientId = req.headers['client-id'] || req.headers['clientid'] || req.query.clientId;
      const taskId = req.headers['task-id'] || req.headers['taskid'] || req.query.taskId;
      const userId = req.user?._id;
      const userRole = req.user?.role;

      let entityId = null, entityType = null;
      
      if (projectPublicId) {
        const project = await q('SELECT id FROM projects WHERE public_id = ?', [projectPublicId]);
        if (project.length) { 
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

      let whereClause = '', params = [];
      if (entityId && entityType) {
        whereClause = 'AND d.entityType = ? AND d.entityId = ?';
        params = [entityType, entityId];
      }

      // ✅ Role-based access (simplified for local storage)
      if (userRole === 'EMPLOYEE') {
        whereClause += ' AND d.uploadedBy = ?';
        params.push(userId);
      }

      const documents = await q(`
        SELECT d.*, u.name as uploadedByName
        FROM documents d
        LEFT JOIN users u ON u._id = d.uploadedBy
        WHERE 1=1 ${whereClause}
        ORDER BY d.createdAt DESC
      `, params);

      const docsWithUrls = documents.map(doc => ({
        documentId: doc.documentId,
        fileName: doc.fileName,
        fileType: doc.mimeType,
        entityType: doc.entityType,
        entityId: doc.entityId,
        uploadedBy: { 
          userId: doc.uploadedBy, 
          name: doc.uploadedByName || null 
        },
        storageProvider: 'local',
        filePath: doc.filePath,
        previewAvailable: true,
        downloadAllowed: true,
        createdAt: doc.createdAt,
        file_url: storageProvider.getPublicUrl(doc.filePath, req),
        publicUrl: storageProvider.getPublicUrl(doc.filePath, req),
        previewUrl: storageProvider.getPublicUrl(doc.filePath, req),
        downloadUrl: storageProvider.getPublicUrl(doc.filePath, req)
      }));

      res.json({ 
        success: true, 
        data: { 
          projectId: projectPublicId || entityId,
          documents: docsWithUrls 
        } 
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ GET /api/documents/preview/:id
  getDocumentPreview: async (req, res) => {
    try {
      const { id } = req.params;
      const doc = await q('SELECT * FROM documents WHERE documentId = ?', [id]);
      
      if (!doc.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      const previewUrl = storageProvider.getPublicUrl(doc[0].filePath, req);
      res.json({ 
        success: true,
        documentId: id,
        previewUrl,
        file_url: previewUrl,
        publicUrl: previewUrl,
        expiresInSeconds: 0,  // Local storage = permanent
        metadata: doc[0]
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ GET /api/documents/download/:id - Direct redirect
  downloadDocument: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?._id;
      const userRole = req.user?.role;

      const doc = await q(`
        SELECT d.* FROM documents d 
        WHERE d.documentId = ? AND (d.uploadedBy = ? OR ? IN ('ADMIN', 'MANAGER'))
      `, [id, userId, userRole]);

      if (!doc.length) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const downloadUrl = storageProvider.getPublicUrl(doc[0].filePath, req);
      
      // ✅ Direct redirect to file (fastest UX)
      return res.redirect(downloadUrl);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // ✅ POST /api/documents/assign-access
  assignDocumentAccess: async (req, res) => {
    try {
      const { id } = req.params;
      const { userId: assigneeId, accessType } = req.body;
      const assignerRole = req.user?.role;

      if (!['ADMIN', 'MANAGER'].includes(assignerRole)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const docExists = await q('SELECT 1 FROM documents WHERE documentId = ?', [id]);
      if (!docExists.length) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      await q(
        'INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessType = ?',
        [id, assigneeId, accessType, accessType]
      );

      res.json({ success: true, message: 'Access assigned successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};
