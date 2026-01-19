// Thin document controller — parses requests, delegates to services, formats responses
const upload = require(__root + 'multer');
const documentService = require(__root + 'services/documentService');
const documentAccessService = require(__root + 'services/documentAccessService');
const storageService = require(__root + 'services/storageService');
const db = require(__root + 'db');

// Controllers are intentionally thin: they validate/parses request inputs,
// call the service layer, and forward errors to the centralized error handler.
module.exports = {
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
      }
    }
  ],

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

        return doc;
      }));

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
      }

      // Fallback: if storage returns a streamable response, stream it
      if (preview.stream) {
        res.set(preview.headers || {});
        return preview.stream.pipe(res);
      }

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