<<<<<<< HEAD
﻿const db = require(__root + 'db');
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
=======
// Thin document controller — parses requests, delegates to services, formats responses
const upload = require(__root + 'multer');
const documentService = require(__root + 'services/documentService');
const documentAccessService = require(__root + 'services/documentAccessService');
const storageService = require(__root + 'services/storageService');
const db = require(__root + 'db');
>>>>>>> origin/feature/doc-upload-memory-storage

// Controllers are intentionally thin: they validate/parses request inputs,
// call the service layer, and forward errors to the centralized error handler.
module.exports = {
<<<<<<< HEAD
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
=======
  // POST /api/documents/upload
  uploadDocument: [
    upload.single('document'),
    async (req, res, next) => {
      try {
        const result = await documentService.uploadDocument({ file: req.file, body: req.body, user: req.user });
        // Build full URL for local uploads (encode to ensure spaces/special chars are safe)
        try {
          const baseUrl = req.protocol + '://' + req.get('host');
          if (result && result.storagePath) {
            const sp = String(result.storagePath);
            if (sp.startsWith('/uploads/')) result.file_url = baseUrl + encodeURI(sp);
            else if (/^https?:\/\//i.test(sp)) result.file_url = sp;
            else result.file_url = '';
          }
        } catch (e) {
          // ignore URL build errors
        }
        return res.json({ success: true, data: result });
      } catch (err) {
        return next(err);
>>>>>>> origin/feature/doc-upload-memory-storage
      }
    }
  ],

<<<<<<< HEAD
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
=======
  // GET /api/documents
  listDocuments: async (req, res, next) => {
    try {
      const filter = {
        projectId: req.headers['project-id'] || req.query.projectId || req.query.project_id || req.body.project_id || req.query.project_public_id || req.query.public_id,
        // also expose original public id separately for services that may resolve it
        projectPublicId: req.query.project_public_id || req.query.public_id,
        clientId: req.query.clientId || req.query.client_id || req.headers['client-id']
      };
      const rows = await documentService.listDocuments({ filter, user: req.user });

      // Build response to match requested shape
      const ruleDecision = req.ruleDecision || { allowed: true, ruleCode: 'DOCUMENT_VIEW', reason: 'User has access to project documents' };

      const baseUrl = req.protocol + '://' + req.get('host');
      const encodeUploads = (storedPath) => {
        if (!storedPath) return '';
        try {
          if (!String(storedPath).startsWith('/uploads/')) return storedPath;
          const rel = String(storedPath).replace(/^\/uploads\//, '');
          const parts = rel.split('/').map(p => encodeURIComponent(p));
          return baseUrl + '/uploads/' + parts.join('/');
        } catch (e) { return baseUrl + storedPath; }
      };

      const documents = await Promise.all((rows || []).map(async (r) => {
        const doc = {
          documentId: r.documentId || r.id || null,
          fileName: r.fileName,
          fileType: r.mimeType || r.fileType || null,
          entityType: r.entityType,
          entityId: r.entityId,
          uploadedBy: { userId: r.uploadedBy || r.uploaded_by || null, name: null },
          accessLevel: null,
          storageProvider: r.storageProvider || r.storage_provider || null,
          previewAvailable: false,
          downloadAllowed: false,
          createdAt: r.createdAt || r.created_at || null
        };

        try {
          const handle = await storageService.getDownloadHandle({ storagePath: r.storagePath || r.filePath, key: r.storageKey });
          if (handle && handle.redirectUrl) {
            doc.previewAvailable = true;
            doc.downloadAllowed = true;
            doc.previewUrl = handle.redirectUrl;
            doc.downloadUrl = handle.redirectUrl;
          } else if (handle && handle.publicPath) {
            doc.previewAvailable = true;
            doc.downloadAllowed = true;
            doc.previewUrl = encodeUploads(handle.publicPath);
            doc.downloadUrl = encodeUploads(handle.publicPath);
          }
        } catch (e) {
          // ignore storage errors per-item
        }

        // Enrich uploadedBy.name if missing
        try {
          const uploaderId = doc.uploadedBy && (doc.uploadedBy.userId || doc.uploadedBy.userId === 0) ? doc.uploadedBy.userId : null;
          if (uploaderId && !doc.uploadedBy.name) {
            const urows = await new Promise((resolve, reject) => db.query('SELECT name FROM users WHERE _id = ? OR id = ? LIMIT 1', [uploaderId, uploaderId], (err, rows) => (err ? reject(err) : resolve(rows))));
            if (urows && urows.length > 0) doc.uploadedBy.name = urows[0].name || '';
            else doc.uploadedBy.name = '';
          }
        } catch (e) {
          doc.uploadedBy.name = doc.uploadedBy.name || '';
        }

        // set accessLevel based on downloadAllowed
        doc.accessLevel = doc.downloadAllowed ? 'VIEW_DOWNLOAD' : 'VIEW';

        // Ensure file_url is present: prefer downloadUrl, then previewUrl, then storagePath
        try {
          if (doc.downloadUrl) doc.file_url = doc.downloadUrl;
          else if (doc.previewUrl) doc.file_url = doc.previewUrl;
          else if (r && r.storagePath) {
            const sp = String(r.storagePath);
            if (sp.startsWith('/uploads/')) doc.file_url = encodeUploads(sp);
            else if (/^https?:\/\//i.test(sp)) doc.file_url = sp;
            else doc.file_url = '';
          } else {
            doc.file_url = '';
          }
        } catch (e) {
          doc.file_url = '';
        }
>>>>>>> origin/feature/doc-upload-memory-storage

        return doc;
      }));

<<<<<<< HEAD
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
=======
      return res.json({
        success: true,
        message: 'Documents fetched successfully',
        ruleDecision,
        data: {
          projectId: filter.projectPublicId || filter.projectId || null,
          documents
        }
      });
    } catch (err) {
      return next(err);
    }
  },

  // GET /api/documents/preview/:id
  getDocumentPreview: async (req, res, next) => {
    try {
      const id = req.params.id;
      const preview = await documentService.getDocumentPreview({ id, user: req.user });
      // Prefer a preview URL (signed URL for S3 or public URL for local uploads)
      try {
        const handle = await storageService.getDownloadHandle({ storagePath: preview.storagePath, key: preview.storageKey }, { expiresIn: 300 });
        if (handle.redirectUrl) {
          return res.json({
            success: true,
            documentId: id,
            previewUrl: handle.redirectUrl,
            expiresInSeconds: handle.expiresInSeconds || 300
          });
        }
        if (handle.publicPath) {
          const base = req.protocol + '://' + req.get('host');
          const rel = String(handle.publicPath).replace(/^\/uploads\//, '');
          const parts = rel.split('/').map(p => encodeURIComponent(p));
          return res.json({ success: true, documentId: id, previewUrl: base + '/uploads/' + parts.join('/'), expiresInSeconds: 0 });
        }
      } catch (e) {
        // fall through to streaming if no URL could be produced
>>>>>>> origin/feature/doc-upload-memory-storage
      }

      // Fallback: if storage returns a streamable response, stream it
      if (preview.stream) {
        res.set(preview.headers || {});
        return preview.stream.pipe(res);
      }

<<<<<<< HEAD
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
=======
      return res.status(404).json({ success: false, error: 'Preview not available' });
    } catch (err) {
      return next(err);
    }
  },

  // GET /api/documents/download/:id
  downloadDocument: async (req, res, next) => {
    try {
      const id = req.params.id;
      const download = await documentService.downloadDocument({ id, user: req.user });
      if (download.redirectUrl) return res.redirect(download.redirectUrl);
      // If storage returned a publicPath for local files, prefer redirecting to that public URL
      if (download.publicPath) {
        const base = req.protocol + '://' + req.get('host');
        const rel = String(download.publicPath).replace(/^\/uploads\//, '');
        const parts = rel.split('/').map(p => encodeURIComponent(p));
        return res.redirect(base + '/uploads/' + parts.join('/'));
      }
      res.set({ 'Content-Disposition': `attachment; filename="${download.fileName || 'file'}"`, ...(download.headers || {}) });
      if (download.stream) return download.stream.pipe(res);
      return res.send(download.body || {});
    } catch (err) {
      return next(err);
    }
  },

  // POST /api/documents/assign-access
  assignDocumentAccess: async (req, res, next) => {
    try {
      const { documentId, assigneeId, accessType } = req.body;
      const result = await documentAccessService.assignAccess({ documentId, assigneeId, accessType, user: req.user });
      return res.json({ success: true, data: result });
    } catch (err) {
      return next(err);
    }
  }
};
>>>>>>> origin/feature/doc-upload-memory-storage
