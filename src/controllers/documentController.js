// Enhanced document controller with RBAC, ownership checks, secure streaming and audit logging
const upload = require('../multer');
const storageService = require('../services/storageService');
const db = require('../db');
const crypto = require('crypto');
const path = require('path');

const NotificationService = require('../services/notificationService');
const workflowService = require(__root + 'workflow/workflowService');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));

function makeId() { return crypto.randomBytes(12).toString('hex'); }

function isAdmin(user) { return user && String(user.role).toLowerCase() === 'admin'; }
function isManager(user) { return user && String(user.role).toLowerCase() === 'manager'; }
function isEmployee(user) { return user && String(user.role).toLowerCase() === 'employee'; }

async function managerOwnsProject(projectId, user) {
  if (!projectId || !user) return false;
  try {
    const internal = user._id || null;
    const publicId = user.public_id || user.id || null;
    const rows = await q('SELECT id FROM projects WHERE (id = ? OR public_id = ?) AND (project_manager_id = ? OR project_manager_id = ?) LIMIT 1', [projectId, projectId, internal, publicId]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { return false; }
}

async function userHasAccess(documentId, user, required = ['view']) {
  if (!documentId || !user) return false;
  if (isAdmin(user)) return true;
  try {
    // Load document
    const rows = await q('SELECT documentId, filePath, uploadedBy, entityType, entityId FROM documents WHERE documentId = ? LIMIT 1', [documentId]);
    if (!rows || rows.length === 0) return false;
    const doc = rows[0];

    // Manager override based on project ownership
    if (isManager(user)) {
      const et = doc.entityType && String(doc.entityType).toUpperCase();
      if (et === 'PROJECT' && doc.entityId && await managerOwnsProject(doc.entityId, user)) return true;
      if (et === 'TASK' && doc.entityId) {
        try {
          const trows = await q('SELECT project_id FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [doc.entityId, doc.entityId]);
          if (trows && trows.length && trows[0].project_id && await managerOwnsProject(trows[0].project_id, user)) return true;
        } catch (_) {}
      }
    }

    // Explicit access check
    const accRows = await q('SELECT accessType FROM document_access WHERE documentId = ? AND userId = ? LIMIT 1', [documentId, user._id || user.id]);
    if (!accRows || accRows.length === 0) return false;
    const level = String(accRows[0].accessType || '').toLowerCase();

    // Normalize to numeric rank; support both new and legacy labels
    const toRank = (val) => {
      switch (val) {
        case 'owner':
        case 'admin':
          return 3;
        case 'edit':
        case 'write':
          return 2;
        case 'view':
        case 'read':
          return 1;
        default:
          return 0;
      }
    };

    const requiredLevel = Array.isArray(required) && required.length ? String(required[0]).toLowerCase() : 'view';
    return toRank(level) >= toRank(requiredLevel);
  } catch (e) { return false; }
}

// Ensure audit logging convenience
async function writeAudit(user, action, entity, entityId, details = {}) {
  try {
    await q('INSERT INTO audit_logs (actor_id, action, entity, entity_id, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [user && (user._id || user.id) || null, action, entity, entityId, JSON.stringify(details || {}), new Date()]);
  } catch (e) {
    // swallow to avoid impacting user flow
    console.warn('audit write failed', e && e.message);
  }
}

module.exports = {
  // POST /api/documents/upload
  uploadDocument: [
    upload.single('document'),
    async (req, res, next) => {
      try {
        // Role check: Admin and Manager allowed
        if (!isAdmin(req.user) && !isManager(req.user)) {
          return res.status(403).json({ success: false, error: 'Insufficient permissions to upload documents' });
        }

        const file = req.file;
        if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        // Accept either entityType/entityId or legacy projectId/clientId/taskId
        let entityType = (req.body.entityType || req.body.entity_type || null);
        let entityId = (req.body.entityId || req.body.entity_id || null);
        if (!entityType) {
          if (req.body.projectId || req.body.project_id) { entityType = 'PROJECT'; entityId = req.body.projectId || req.body.project_id; }
          else if (req.body.clientId || req.body.client_id) { entityType = 'CLIENT'; entityId = req.body.clientId || req.body.client_id; }
          else if (req.body.taskId || req.body.task_id) { entityType = 'TASK'; entityId = req.body.taskId || req.body.task_id; }
        }

        // If manager, enforce they own the project (if entityType === PROJECT)
        if (isManager(req.user) && entityType && String(entityType).toUpperCase() === 'PROJECT' && entityId && !(await managerOwnsProject(entityId, req.user))) {
          return res.status(403).json({ success: false, error: 'Manager does not have access to this project' });
        }

        const docId = makeId();
        const filename = docId + path.extname(file.originalname || '');
        const storageResult = await storageService.upload(file, filename);

        const now = new Date();
        // Persist using existing schema: entityType/entityId, mimeType, filePath, storageProvider
        const insertSql = `INSERT INTO documents (documentId, fileName, filePath, storageProvider, entityType, entityId, mimeType, uploadedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await q(insertSql, [docId, file.originalname, storageResult.storagePath || storageResult.publicPath || '', storageResult.provider || 'local', entityType ? String(entityType).toUpperCase() : null, entityId || null, file.mimetype || null, req.user && (req.user._id || req.user.id) || null, now]);

        // Automatic access assignment based on role
        const uploaderRole = req.user.role.toLowerCase();
        if (uploaderRole === 'admin' || uploaderRole === 'manager') {
          // Assign OWNER to ADMIN/MANAGER
          await q('INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessType = VALUES(accessType)', [docId, req.user._id || req.user.id, 'OWNER']);
        } else {
          // Assign OWNER to uploader (USER)
          await q('INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE accessType = VALUES(accessType)', [docId, req.user._id || req.user.id, 'OWNER']);
        }

        const baseUrl = req.protocol + '://' + req.get('host');
        let publicUrl = '';
        if (storageResult && storageResult.storagePath && String(storageResult.storagePath).startsWith('/uploads/')) {
          publicUrl = baseUrl + storageResult.storagePath.split('/').map(encodeURIComponent).join('/').replace('%2F', '/');
        } else if (storageResult && storageResult.storagePath) publicUrl = storageResult.storagePath;

        // If upload is marked sensitive, trigger approval workflow (best-effort)
        try {
          const sensitiveFlag = (req.body && (req.body.sensitive === '1' || String(req.body.sensitive).toLowerCase() === 'true' || String(req.body.sensitivity).toLowerCase() === 'high'));
          if (sensitiveFlag) {
            const tenantId = req.user && req.user.tenant_id;
            if (tenantId) {
              const templates = await workflowService.listTemplates(tenantId);
              const tpl = (templates || []).find(t => String(t.trigger_event).toUpperCase() === 'DOCUMENT_SENSITIVE_UPLOAD');
              if (tpl) {
                await workflowService.createInstance({ tenant_id: tenantId, template_id: tpl.id, entity_type: 'DOCUMENT', entity_id: docId, created_by: (req.user && (req.user._id || req.user.id)) || null });
              }
            }
          }
        } catch (e) {
          console.error('Workflow trigger (sensitive upload) failed:', e && e.message);
        }

        return res.status(201).json({ success: true, data: { documentId: docId, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size, file_url: publicUrl } });
      } catch (err) {
        return next(err);
      }
    }
  ],

  // GET /api/documents
  listDocuments: async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;

      const projectParam = req.query.projectId || req.query.project_id || req.headers['project-id'];
      const clientParam = req.query.clientId || req.query.client_id || req.headers['client-id'];

      // Resolve projectParam to possible stored identifiers (internal id and public_id)
      let projectFilterIds = null;
      let projectClientIds = null; // client ids inferred from project
      let projectTaskIds = null; // task ids under project (internal/public)
      if (projectParam) {
        try {
          const prow = await q('SELECT id, public_id, client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectParam, projectParam]);
          if (prow && prow.length > 0) {
            const p = prow[0];
            projectFilterIds = [];
            if (p.id !== undefined && p.id !== null) projectFilterIds.push(p.id);
            if (p.public_id !== undefined && p.public_id !== null && !projectFilterIds.includes(p.public_id)) projectFilterIds.push(p.public_id);
            // capture client id from project to include client-scoped docs
            if (p.client_id !== undefined && p.client_id !== null) projectClientIds = [String(p.client_id)];
            // gather tasks belonging to this project (internal id and public_id)
            try {
              const trows = await q('SELECT id, public_id FROM tasks WHERE project_id = ? OR project_public_id = ?', [p.id, p.public_id]).catch(() => []);
              if (trows && trows.length) {
                projectTaskIds = [];
                for (const t of trows) {
                  if (t.id !== undefined && t.id !== null) projectTaskIds.push(String(t.id));
                  if (t.public_id !== undefined && t.public_id !== null && !projectTaskIds.includes(t.public_id)) projectTaskIds.push(t.public_id);
                }
              }
            } catch (e) { projectTaskIds = null; }
          } else {
            projectFilterIds = [projectParam];
          }
        } catch (e) {
          projectFilterIds = [projectParam];
        }
      }

      // Resolve clientParam similarly
      let clientFilterIds = null;
      if (clientParam) {
        try {
          const crow = await q('SELECT id, public_id FROM clientss WHERE id = ? OR public_id = ? LIMIT 1', [clientParam, clientParam]);
          if (crow && crow.length > 0) {
            const c = crow[0];
            clientFilterIds = [];
            if (c.id !== undefined && c.id !== null) clientFilterIds.push(String(c.id));
            if (c.public_id !== undefined && c.public_id !== null && !clientFilterIds.includes(c.public_id)) clientFilterIds.push(c.public_id);
          } else {
            clientFilterIds = [clientParam];
          }
        } catch (e) {
          clientFilterIds = [clientParam];
        }
      }

      // Admin: list all, Manager: list all (same as admin)
      let rows = [];
      if (isAdmin(req.user)) {
        // Admin: optionally filter by project/client/task using entityType/entityId
        const params = [];
        const orParts = [];
        if (projectFilterIds && projectFilterIds.length) {
          orParts.push("(entityType = 'PROJECT' AND entityId IN (?))"); params.push(projectFilterIds);
          // include task documents under the project
          if (projectTaskIds && projectTaskIds.length) { orParts.push("(entityType = 'TASK' AND entityId IN (?))"); params.push(projectTaskIds); }
        }
        // include client docs only when client param explicitly provided
        if (clientFilterIds && clientFilterIds.length) { orParts.push("(entityType = 'CLIENT' AND entityId IN (?))"); params.push(clientFilterIds); }
        let sql = 'SELECT * FROM documents';
        if (orParts.length) sql += ' WHERE ' + orParts.join(' OR ');
        sql += ' ORDER BY createdAt DESC LIMIT 500';
        rows = await q(sql, params);
      } else if (isManager(req.user)) {
        // Manager: if a project/client filter is provided and manager owns the project, show all docs under it;
        // otherwise, default to only documents explicitly assigned to the manager.
        const uid = req.user && (req.user._id || req.user.id);
        const projectParam = req.query.projectId || req.query.project_id || req.headers['project-id'];
        const ownsProject = projectParam ? await managerOwnsProject(projectParam, req.user) : false;

        if (ownsProject && (projectFilterIds || projectTaskIds || clientFilterIds || projectClientIds)) {
          const params = [uid];
          const orParts = [];
          if (projectFilterIds && projectFilterIds.length) { orParts.push("(d.entityType = 'PROJECT' AND d.entityId IN (?))"); params.push(projectFilterIds); }
          if (projectTaskIds && projectTaskIds.length) { orParts.push("(d.entityType = 'TASK' AND d.entityId IN (?))"); params.push(projectTaskIds); }
          // include client docs inferred from owned project
          if (projectClientIds && projectClientIds.length) { orParts.push("(d.entityType = 'CLIENT' AND d.entityId IN (?))"); params.push(projectClientIds); }
          // include explicit client filter if provided
          if (clientFilterIds && clientFilterIds.length) { orParts.push("(d.entityType = 'CLIENT' AND d.entityId IN (?))"); params.push(clientFilterIds); }
          let sql = `SELECT d.*, self.accessType AS permissionLevel FROM documents d
                     LEFT JOIN document_access self ON self.documentId = d.documentId AND self.userId = ?`;
          if (orParts.length) sql += ' WHERE ' + orParts.join(' OR ');
          sql += ' ORDER BY d.createdAt DESC LIMIT 500';
          rows = await q(sql, params);
        } else {
          // default: only assigned to manager
          const params = [uid];
          const entityOr = [];
          if (projectFilterIds && projectFilterIds.length) { entityOr.push("(d.entityType = 'PROJECT' AND d.entityId IN (?))"); params.push(projectFilterIds); }
          if (projectFilterIds && projectFilterIds.length && projectTaskIds && projectTaskIds.length) { entityOr.push("(d.entityType = 'TASK' AND d.entityId IN (?))"); params.push(projectTaskIds); }
          if (clientFilterIds && clientFilterIds.length) { entityOr.push("(d.entityType = 'CLIENT' AND d.entityId IN (?))"); params.push(clientFilterIds); }
          let sql = `SELECT d.*, da.accessType AS permissionLevel FROM documents d INNER JOIN document_access da ON da.documentId = d.documentId WHERE da.userId = ?`;
          if (entityOr.length) {
            sql += ' AND (' + entityOr.join(' OR ') + ')';
          }
          sql += ' ORDER BY d.createdAt DESC LIMIT 500';
          rows = await q(sql, params);
        }
      } else { // employee
        // Join with access table to only return permitted docs
        const uid = req.user && (req.user._id || req.user.id);
        if (!uid) return res.json({ success: true, data: { total: 0, documents: [] } });
        const entityOr = [];
        const entityParams = [];
        if (projectFilterIds && projectFilterIds.length) { entityOr.push("(d.entityType = 'PROJECT' AND d.entityId IN (?))"); entityParams.push(projectFilterIds); }
        if (projectFilterIds && projectFilterIds.length && projectTaskIds && projectTaskIds.length) { entityOr.push("(d.entityType = 'TASK' AND d.entityId IN (?))"); entityParams.push(projectTaskIds); }
        // include client docs inferred from the project
        if (projectClientIds && projectClientIds.length) { entityOr.push("(d.entityType = 'CLIENT' AND d.entityId IN (?))"); entityParams.push(projectClientIds); }
        // include client docs only when client param explicitly provided
        if (clientFilterIds && clientFilterIds.length) { entityOr.push("(d.entityType = 'CLIENT' AND d.entityId IN (?))"); entityParams.push(clientFilterIds); }
        // If a specific project/client filter is applied, do NOT restrict by uploader role; otherwise restrict to admin/manager uploader
        let sql;
        const base = `SELECT d.*, da.accessType AS permissionLevel FROM documents d INNER JOIN document_access da ON da.documentId = d.documentId`;
        if (entityOr.length) {
          sql = base + ` WHERE da.userId = ?`;
          sql += ' AND (' + entityOr.join(' OR ') + ')';
        } else {
          sql = base + ` LEFT JOIN users u ON u._id = d.uploadedBy WHERE da.userId = ? AND LOWER(u.role) IN ('admin','manager')`;
        }
        sql += ' ORDER BY d.createdAt DESC LIMIT 500';
        const params = [uid].concat(entityParams);
        rows = await q(sql, params);
      }

      // Fallback: if no project/task documents found but project maps to a client with docs,
      // include client-scoped documents (respecting role/access).
      if ((rows == null || rows.length === 0) && projectClientIds && projectClientIds.length) {
        try {
          if (isAdmin(req.user)) {
            rows = await q("SELECT * FROM documents WHERE entityType = 'CLIENT' AND entityId IN (?) ORDER BY createdAt DESC LIMIT 500", [projectClientIds]);
          } else if (isManager(req.user)) {
            // only if manager owns the project(s)
            let allowed = false;
            if (projectFilterIds && projectFilterIds.length) {
              for (const pf of projectFilterIds) {
                if (await managerOwnsProject(pf, req.user)) { allowed = true; break; }
              }
            }
            if (allowed) {
              rows = await q("SELECT * FROM documents WHERE entityType = 'CLIENT' AND entityId IN (?) ORDER BY createdAt DESC LIMIT 500", [projectClientIds]);
            }
          } else {
            // employee: include client docs explicitly granted via document_access (no uploader role restriction when project filter present)
            const uid = req.user && (req.user._id || req.user.id);
            if (uid) {
              rows = await q("SELECT d.*, da.accessType AS permissionLevel FROM documents d INNER JOIN document_access da ON da.documentId = d.documentId WHERE da.userId = ? AND d.entityType = ? AND d.entityId IN (?) ORDER BY d.createdAt DESC LIMIT 500", [uid, 'CLIENT', projectClientIds]);
            }
          }
        } catch (e) {
          // ignore fallback errors
        }
      }

      // Map response with access members; paginate first to limit per-doc queries
      const baseUrl = req.protocol + '://' + req.get('host');
      const total = rows.length;
      const start = (page - 1) * limit;
      const slicedRows = rows.slice(start, start + limit);
      const pages = Math.ceil(total / limit);

      const documents = await Promise.all(slicedRows.map(async r => {
        const countRow = await q('SELECT COUNT(*) as cnt FROM document_access WHERE documentId = ?', [r.documentId]);
        const accessCount = countRow && countRow.length ? countRow[0].cnt : 0;
        const members = await q('SELECT da.userId, da.accessType AS accessType, u.role, u.name FROM document_access da LEFT JOIN users u ON u._id = da.userId WHERE da.documentId = ?', [r.documentId]);
        const accessMembers = (members || []).map(m => {
          const roleLc = (m.role || '').toLowerCase();
          let at = (m.accessType || '').trim();
          if (!at) at = (roleLc === 'admin' || roleLc === 'manager') ? 'OWNER' : 'VIEW';
          return { userId: m.userId, name: m.name || null, accessType: at.toUpperCase(), role: roleLc };
        });
        return {
          documentId: r.documentId,
          fileName: r.fileName,
          fileType: r.fileType || r.mimeType,
          fileSize: r.fileSize || null,
          uploadedBy: r.uploadedBy,
          entityType: r.entityType,
          entityId: r.entityId,
          createdAt: r.createdAt,
          file_url: (r.filePath && String(r.filePath).startsWith('/uploads/')) ? (baseUrl + r.filePath) : r.filePath,
          permissionLevel: r.permissionLevel,
          accessCount,
          accessMembers
        };
      }));

      return res.json({ success: true, data: { total, documents, page, limit, pages } });
    } catch (err) {
      return next(err);
    }
  },

  // GET /api/documents/:id/preview
  getDocumentPreview: async (req, res, next) => {
    try {
      const id = req.params.id;
      // preview allowed if user has view permission (or admin/manager owner)
      const allowed = await userHasAccess(id, req.user, ['view']);
      if (!allowed) {
        // Fallback for project-scoped preview: if employee is a member of the provided project,
        // allow preview when the document belongs to that project (PROJECT/TASK) or its client (CLIENT)
        try {
          const docRows = await q('SELECT documentId, fileName, filePath, entityType, entityId FROM documents WHERE documentId = ? LIMIT 1', [id]);
          if (!docRows || !docRows.length) return res.status(404).json({ success: false, error: 'Document not found' });
          const doc = docRows[0];

          const projectParam = req.query.projectId || req.query.project_id || req.headers['project-id'];
          if (projectParam && String(req.user.role).toLowerCase() === 'employee') {
            const prow = await q('SELECT id, public_id, client_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectParam, projectParam]);
            if (prow && prow.length) {
              const pid = prow[0].id;
              const isMemberRows = await q(
                'SELECT 1 FROM taskassignments ta JOIN tasks t ON ta.task_Id = t.id WHERE ta.user_Id = ? AND t.project_id = ? LIMIT 1',
                [req.user._id || req.user.id, pid]
              );
              const isMember = isMemberRows && isMemberRows.length > 0;

              if (isMember) {
                const et = doc.entityType && String(doc.entityType).toUpperCase();
                let belongs = false;
                if (et === 'PROJECT') {
                  belongs = (String(doc.entityId) === String(pid) || String(doc.entityId) === String(prow[0].public_id));
                } else if (et === 'TASK') {
                  try {
                    const trow = await q('SELECT project_id FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [doc.entityId, doc.entityId]);
                    belongs = trow && trow.length && String(trow[0].project_id) === String(pid);
                  } catch (_) { belongs = false; }
                } else if (et === 'CLIENT') {
                  belongs = prow[0].client_id != null && String(prow[0].client_id) === String(doc.entityId);
                }
                if (belongs) {
                  // grant preview in this scoped context
                  // continue to file serving below
                } else {
                  return res.status(403).json({ success: false, error: 'Access denied' });
                }
              } else {
                return res.status(403).json({ success: false, error: 'Access denied' });
              }
            } else {
              return res.status(403).json({ success: false, error: 'Access denied' });
            }
          } else {
            return res.status(403).json({ success: false, error: 'Access denied' });
          }
        } catch (e) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      const row = (await q('SELECT documentId, fileName, filePath, storageProvider FROM documents WHERE documentId = ? LIMIT 1', [id]))[0];
      if (!row) return res.status(404).json({ success: false, error: 'Document not found' });

      try {
        const handle = await storageService.getDownloadHandle({ storagePath: row.filePath }, { expiresIn: 300 });
        if (handle.redirectUrl) return res.json({ success: true, documentId: id, previewUrl: handle.redirectUrl, expiresInSeconds: handle.expiresInSeconds || 300 });
        if (handle.publicPath) {
          const base = req.protocol + '://' + req.get('host');
          const rel = String(handle.publicPath).replace(/^\/uploads\//, '');
          const parts = rel.split('/').map(p => encodeURIComponent(p));
          return res.json({ success: true, documentId: id, previewUrl: base + '/uploads/' + parts.join('/'), expiresInSeconds: 0 });
        }
        if (handle.stream) {
          res.set(handle.headers || { 'Content-Type': row.fileType || 'application/octet-stream' });
          return handle.stream.pipe(res);
        }
      } catch (e) {
        // fallthrough
      }

      return res.status(404).json({ success: false, error: 'Preview not available' });
    } catch (err) { return next(err); }
  },

  // GET /api/documents/:id/download
  downloadDocument: async (req, res, next) => {
    try {
      const id = req.params.id;
      // check download permission
      const allowed = await userHasAccess(id, req.user, ['download']);
      if (!allowed) return res.status(403).json({ success: false, error: 'Insufficient permission to download' });

      const row = (await q('SELECT documentId, fileName, filePath, storageProvider FROM documents WHERE documentId = ? LIMIT 1', [id]))[0];
      if (!row) return res.status(404).json({ success: false, error: 'Document not found' });

      const handle = await storageService.getDownloadHandle({ storagePath: row.filePath });
      if (handle.redirectUrl) {
        await writeAudit(req.user, 'download-document', 'Document', id, { via: 'redirect' });
        return res.redirect(handle.redirectUrl);
      }
      if (handle.publicPath) {
        const base = req.protocol + '://' + req.get('host');
        const rel = String(handle.publicPath).replace(/^\/uploads\//, '');
        const parts = rel.split('/').map(p => encodeURIComponent(p));
        await writeAudit(req.user, 'download-document', 'Document', id, { via: 'publicPath' });
        return res.redirect(base + '/uploads/' + parts.join('/'));
      }
      if (handle.stream) {
        res.set({ 'Content-Disposition': `attachment; filename="${row.fileName || 'file'}"`, ...(handle.headers || {}) });
        await writeAudit(req.user, 'download-document', 'Document', id, { via: 'stream' });
        return handle.stream.pipe(res);
      }

      return res.status(500).json({ success: false, error: 'Unable to serve file' });
    } catch (err) { return next(err); }
  },

  // POST /api/documents/:documentId/assign-access
  assignDocumentAccess: async (req, res, next) => {
    try {
      const documentId = req.params.documentId || req.params.id || req.body.documentId;
      const bodyAccess = req.body.accessType || req.body.permissionLevel; // accept either key
      const singleAssigneeId = req.body.assigneeId;
      const incomingAssigneeIds = Array.isArray(req.body.assigneeIds) ? req.body.assigneeIds : [];
      const assigneeIds = incomingAssigneeIds.length ? incomingAssigneeIds : (singleAssigneeId ? [singleAssigneeId] : []);
      if (!documentId || !bodyAccess || assigneeIds.length === 0) return res.status(400).json({ success: false, error: 'documentId, assigneeIds/assigneeId, and accessType are required' });

      const requesterId = req.user._id || req.user.id;
      const requesterRole = req.user.role.toLowerCase();

      // Fetch document
      const drows = await q('SELECT documentId, fileName, entityType, entityId FROM documents WHERE documentId = ? LIMIT 1', [documentId]);
      if (!drows || drows.length === 0) return res.status(404).json({ success: false, error: 'Document not found' });
      const doc = drows[0];

      // Resolve project context: use explicit projectId from body/query/header if provided, else derive from document binding
      let projectParam = req.body.projectId || req.body.project_id || req.query.projectId || req.query.project_id || req.headers['project-id'] || null;
      let projectId = projectParam;
      if (!projectId) {
        const et = doc.entityType && String(doc.entityType).toUpperCase();
        if (et === 'PROJECT') {
          projectId = doc.entityId;
        } else if (et === 'TASK') {
          try {
            // Try resolving project via tasks table by id or public_id
            let trow = null;
            try {
              const rows = await q('SELECT project_id FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [doc.entityId, doc.entityId]);
              if (rows && rows.length) trow = rows[0];
            } catch (e1) {
              // Fallback to id-only schema
              const rows2 = await q('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [doc.entityId]).catch(() => []);
              if (rows2 && rows2.length) trow = rows2[0];
            }
            if (trow && trow.project_id) projectId = trow.project_id;
          } catch (e) {
            // ignore and continue
          }
        }
      }

      // Normalize projectId to internal numeric id when possible
      let projectInternalId = null;
      if (projectId) {
        try {
          const prow = await q('SELECT id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]).catch(() => []);
          if (prow && prow.length) projectInternalId = prow[0].id;
        } catch (e) { /* ignore */ }
      }

      if (!projectId && !projectInternalId) {
        return res.status(400).json({ success: false, error: 'Document must be linked to a project or provide projectId' });
      }

      // Prepare requested permission
      const requestedLevelKey = String(bodyAccess).toLowerCase();
      const aliasMap = {
        view: 'VIEW', read: 'VIEW', preview: 'VIEW', download: 'VIEW',
        edit: 'EDIT', write: 'EDIT',
        owner: 'OWNER', admin: 'OWNER'
      };
      if (!aliasMap[requestedLevelKey]) {
        return res.status(400).json({ success: false, error: 'Invalid accessType. Use VIEW|EDIT|OWNER or aliases: read, write, preview, download, admin' });
      }
      const requestedLevel = aliasMap[requestedLevelKey];

      // Check if requester has OWNER permission; allow Admin override
      let requesterIsOwner = false;
      const ownerCheck = await q('SELECT accessType FROM document_access WHERE documentId = ? AND userId = ? LIMIT 1', [documentId, requesterId]);
      if (ownerCheck && ownerCheck.length && String(ownerCheck[0].accessType).toUpperCase() === 'OWNER') requesterIsOwner = true;
      if (!requesterIsOwner && requesterRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only document OWNER or Admin can assign access' });
      }

      // Validate and upsert per assignee
      const assignments = [];
      for (const aid of assigneeIds) {
        // Validate membership in project
        const memberCheck = await q(
          `SELECT _id FROM users WHERE _id = ? AND (
             _id = (SELECT project_manager_id FROM projects WHERE id = ? OR public_id = ?) OR
             EXISTS (
               SELECT 1 FROM taskassignments ta
               JOIN tasks t ON ta.task_id = t.id
               WHERE ta.user_id = users._id AND t.project_id = ?
             )
           ) LIMIT 1`,
          [aid, projectId || projectInternalId, projectId || projectInternalId, projectInternalId || projectId]
        );
        if (!memberCheck || memberCheck.length === 0) {
          return res.status(403).json({ success: false, error: `Assignee ${aid} is not a member of the project` });
        }

        // Fetch assignee role
        const assignee = await q('SELECT role FROM users WHERE _id = ? LIMIT 1', [aid]);
        if (!assignee || assignee.length === 0) return res.status(404).json({ success: false, error: `Assignee ${aid} not found` });
        const assigneeRole = (assignee[0].role || '').toLowerCase();

        // Determine final level for this assignee
        let permissionLevel = requestedLevel;
        if (assigneeRole === 'admin' || assigneeRole === 'manager') {
          permissionLevel = 'OWNER';
        }

        const existing = await q('SELECT id FROM document_access WHERE documentId = ? AND userId = ? LIMIT 1', [documentId, aid]);
        if (existing && existing.length) {
          await q('UPDATE document_access SET accessType = ? WHERE id = ?', [permissionLevel, existing[0].id]);
        } else {
          await q('INSERT INTO document_access (documentId, userId, accessType) VALUES (?, ?, ?)', [documentId, aid, permissionLevel]);
        }
        assignments.push({ userId: aid, accessType: permissionLevel });
      }

      // Audit log
      await writeAudit({ _id: requesterId }, 'DOCUMENT_SHARED', 'Document', documentId, { targetUserIds: assigneeIds, requestedLevel });

      // Notification
      const project = await q('SELECT name FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
      const projectName = project && project.length ? project[0].name : 'Unknown Project';
      const allSame = assignments.every(a => a.accessType === assignments[0].accessType);
      const notifText = allSame
        ? `You have been granted ${assignments[0].accessType} access to ${doc.fileName} in ${projectName}`
        : `You have been granted access to ${doc.fileName} in ${projectName}`;
      await NotificationService.createAndSend(assigneeIds, 'Document Shared', notifText, 'DOCUMENT_ACCESS', 'Document', documentId);

      const assignedCount = assignments.length;
      const assignedLevel = allSame ? assignments[0].accessType : null;
      const message = allSame
        ? `Document access assigned successfully (${assignedLevel}) to ${assignedCount} user${assignedCount > 1 ? 's' : ''}.`
        : `Document access assigned successfully to ${assignedCount} user${assignedCount > 1 ? 's' : ''}.`;
      return res.json({ success: true, message, data: { documentId, projectId: projectInternalId || projectId, assignments } });
    } catch (err) { return next(err); }
  },

  // GET /api/documents/my
  getMyDocuments: async (req, res, next) => {
    try {
      const userId = req.user._id || req.user.id;
      const userRole = req.user.role.toLowerCase();

      let documents = [];
      if (userRole === 'admin' || userRole === 'manager') {
        // Show all documents they have access to
        documents = await q(`
          SELECT d.*, da.permissionLevel, da.assignedAt
          FROM documents d
          INNER JOIN document_access da ON d.documentId = da.documentId
          WHERE da.userId = ?
          ORDER BY d.createdAt DESC
        `, [userId]);
      } else {
        // Employee: only documents they have access to
        documents = await q(`
          SELECT d.*, da.permissionLevel, da.assignedAt
          FROM documents d
          INNER JOIN document_access da ON d.documentId = da.documentId
          WHERE da.userId = ? AND da.permissionLevel IN ('VIEW', 'EDIT', 'OWNER')
          ORDER BY d.createdAt DESC
        `, [userId]);
      }

      // Add accessCount for each document
      for (let doc of documents) {
        const accessCount = await q('SELECT COUNT(*) as count FROM document_access WHERE documentId = ?', [doc.documentId]);
        doc.accessCount = accessCount[0].count;
      }

      return res.json({ success: true, data: { total: documents.length, documents } });
    } catch (err) { return next(err); }
  },

  // GET /api/documents/project/:projectId/members
  getProjectMembers: async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

      // Resolve project (supports internal id or public_id)
      // Some schemas may not have manager_id; select only reliable columns
      const projRows = await q('SELECT id, public_id, project_manager_id FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
      if (!projRows || projRows.length === 0) return res.status(404).json({ success: false, error: 'Project not found' });
      const project = projRows[0];

      const pid = project.id;
      const ppub = project.public_id;

      // Collect managers assigned to the project (project_manager_id and manager_id if present)
      const managerIds = [];
      if (project.project_manager_id) managerIds.push(String(project.project_manager_id));
      // manager_id may not exist in all schemas; rely on project_manager_id

      let managers = [];
      if (managerIds.length) {
        const mgrRows = await q(`SELECT _id, public_id, name, role FROM users WHERE _id IN (?) AND role = 'Manager'`, [managerIds]).catch(() => []);
        managers = (mgrRows || []).map(u => ({ id: u._id, publicId: u.public_id, name: u.name, role: 'Manager' }));
      }

      // Collect employees assigned to any task in this project via taskassignments
      const empRows = await q(`
        SELECT DISTINCT u._id, u.public_id, u.name, u.role
        FROM tasks t
        JOIN taskassignments ta ON ta.task_Id = t.id
        JOIN users u ON u._id = ta.user_id
        WHERE (t.project_id = ? OR t.project_public_id = ?)
          AND u.role = 'Employee'
      `, [pid, ppub]).catch(() => []);
      const employees = (empRows || []).map(u => ({ id: u._id, publicId: u.public_id, name: u.name, role: 'Employee' }));

      // Combine and de-duplicate by id
      const seen = new Set();
      const members = [];
      for (const m of [...managers, ...employees]) {
        if (!seen.has(String(m.id))) {
          seen.add(String(m.id));
          members.push(m);
        }
      }

      return res.json({ success: true, data: { members } });
    } catch (err) { return next(err); }
  }
};