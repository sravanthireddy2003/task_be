// /**
//  * Enhanced Client Management API Controller
//  * Complete CRUD with permissions, validation, dashboard, and onboarding
//  */
// const db = require(__root + 'db');
// const express = require('express');
// const router = express.Router();
// const logger = require('../logger');
// const crypto = require('crypto');
// const path = require('path');
// const fs = require('fs');
// const multer = require('multer');
// const mime = require('mime-types');
// const { requireAuth, requireRole } = require(__root + 'middleware/roles');
// const managerAccess = require(__root + 'middleware/managerAccess');
// const clientViewer = require(__root + 'middleware/clientViewer');
// const emailService = require(__root + 'utils/emailService');
// const ClientOnboardingService = require(__root + 'services/ClientOnboardingService');
// const {
//   validateCreateClientDTO,
//   validateUpdateClientDTO,
//   validateContactDTO,
//   sanitizeClientData,
//   ClientValidationError,
//   validateEmail,
//   validatePhone
// } = require(__root + 'services/ClientValidationService');
// require('dotenv').config();

// // ==================== MULTER SETUP ====================
// const uploadsRoot = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, uploadsRoot);
//   },
//   filename: function (req, file, cb) {
//     const ext = path.extname(file.originalname) || '';
//     const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_\.]/g, '_');
//     const name = `${base}_${Date.now()}${ext}`;
//     cb(null, name);
//   }
// });
// const upload = multer({ storage });

// // ==================== HELPERS ====================
// function q(sql, params = []) {
//   return new Promise((resolve, reject) => {
//     db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
//   });
// }

// const columnCache = {};
// async function hasColumn(table, column) {
//   const key = `${table}::${column}`;
//   if (columnCache[key] !== undefined) return columnCache[key];
//   try {
//     const rows = await q("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [table, column]);
//     const ok = Array.isArray(rows) && rows.length > 0;
//     columnCache[key] = ok;
//     return ok;
//   } catch (e) {
//     columnCache[key] = false;
//     return false;
//   }
// }

// async function tableExists(tableName) {
//   try {
//     const rows = await q("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tableName]);
//     return Array.isArray(rows) && rows.length > 0;
//   } catch (e) {
//     return false;
//   }
// }

// function guessMimeType(filename) {
//   if (!filename) return null;
//   const m = mime.lookup(filename);
//   if (m) return m;
//   const ext = (path.extname(filename) || '').toLowerCase().replace('.', '');
//   const map = {
//     pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
//     gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
//     docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//   };
//   return map[ext] || null;
// }

// async function ensureClientTables() {
//   try {
//     if (!await tableExists('client_contacts')) {
//       await q("CREATE TABLE IF NOT EXISTS client_contacts (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(50), designation VARCHAR(255), is_primary TINYINT(1) DEFAULT 0, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
//     }
//     if (!await tableExists('client_documents')) {
//       await q("CREATE TABLE IF NOT EXISTS client_documents (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, file_url TEXT, file_name VARCHAR(255), file_type VARCHAR(100), uploaded_by INT, uploaded_at DATETIME DEFAULT NOW(), is_active TINYINT(1) DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
//     }
//     if (!await tableExists('client_activity_logs')) {
//       await q("CREATE TABLE IF NOT EXISTS client_activity_logs (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, actor_id INT, action VARCHAR(255), details TEXT, created_at DATETIME DEFAULT NOW()) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
//     }
//     if (!await tableExists('client_viewers')) {
//       await q("CREATE TABLE IF NOT EXISTS client_viewers (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, user_id INT NOT NULL, created_at DATETIME DEFAULT NOW(), UNIQUE KEY uniq_client_user (client_id, user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
//     }
//   } catch (e) {
//     logger.warn('Failed to ensure client tables: ' + e.message);
//   }
// }

// // ==================== MIDDLEWARE ====================
// router.use(requireAuth);
// router.use(clientViewer);
// router.use(managerAccess);

// // ==================== MIDDLEWARE: Scope list to managers ====================
// router.get('/', requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
//   try {
//     await ensureClientTables();
//     const { page = 1, limit = 25, search, status, manager_id } = req.query;

//     let where = [];
//     let params = [];

//     // Multi-tenant isolation
//     if (req.user.role === 'Admin') {
//       if (req.user.tenant_id) {
//         where.push('(clientss.tenant_id = ? OR clientss.tenant_id IS NULL)');
//         params.push(req.user.tenant_id);
//       }
//     } else if (req.user.role === 'Manager') {
//       // Managers see only their assigned clients
//       where.push('clientss.manager_id = ?');
//       params.push(req.user._id);
//     } else if (req.user.role === 'Client-Viewer') {
//       // Viewers see only their mapped client
//       if (!req.viewerClientId) return res.status(403).json({ success: false, error: 'Viewer not mapped to a client' });
//       where.push('clientss.id = ?');
//       params.push(req.viewerClientId);
//     }

//     // Soft delete filter
//     const hasIsDeleted = await hasColumn('clientss', 'isDeleted');
//     if (hasIsDeleted) {
//       where.push('clientss.isDeleted != 1');
//     }

//     // Search
//     if (search) {
//       where.push('(clientss.name LIKE ? OR clientss.company LIKE ? OR clientss.gst_number LIKE ?)');
//       params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//     }

//     // Status filter
//     if (status) {
//       where.push('clientss.status = ?');
//       params.push(status);
//     }

//     // Admin can filter by specific manager
//     if (manager_id && req.user.role === 'Admin') {
//       where.push('clientss.manager_id = ?');
//       params.push(manager_id);
//     }

//     const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
//     const countRows = await q(`SELECT COUNT(*) as c FROM clientss ${whereSql}`, params);
//     const total = countRows[0].c || 0;
//     const offset = (page - 1) * limit;

//     const listSql = `
//       SELECT clientss.id, clientss.ref, clientss.name, clientss.company,
//              clientss.status, clientss.email, clientss.phone, clientss.created_at,
//              clientss.manager_id,
//              (SELECT public_id FROM users WHERE _id = clientss.manager_id LIMIT 1) as manager_public_id,
//              (SELECT name FROM users WHERE _id = clientss.manager_id LIMIT 1) as manager_name
//       FROM clientss
//       ${whereSql}
//       ORDER BY clientss.created_at DESC
//       LIMIT ? OFFSET ?
//     `;

//     const rows = await q(listSql, params.concat([limit, offset]));

//     // Attach document count per client
//     const withDocs = await Promise.all(rows.map(async (r) => {
//       const docs = await q('SELECT COUNT(*) as c FROM client_documents WHERE client_id = ? AND is_active = 1', [r.id]).catch(() => [{ c: 0 }]);
//       r.documentCount = docs[0].c || 0;
//       return r;
//     }));

//     return res.json({ success: true, data: withDocs, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
//   } catch (e) {
//     logger.error('Error listing clients: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to list clients', details: e.message });
//   }
// });

// // ==================== CREATE CLIENT ====================
// router.post('/', requireRole('Admin'), async (req, res) => {
//   try {
//     await ensureClientTables();

//     // Validate input
//     try {
//       validateCreateClientDTO(req.body);
//     } catch (e) {
//       if (e instanceof ClientValidationError) {
//         return res.status(400).json({ success: false, error: e.message, details: e.details });
//       }
//       throw e;
//     }

//     const {
//       name, company, billingAddress, officeAddress, gstNumber, taxId,
//       industry, notes, status = 'Active', managerId, email, phone,
//       contacts = [], documents = [], createViewer = false
//     } = req.body;

//     // Check duplicate
//     const hasIsDeleted = await hasColumn('clientss', 'isDeleted');
//     const dupSql = hasIsDeleted
//       ? 'SELECT id FROM clientss WHERE name = ? AND company = ? AND isDeleted != 1 LIMIT 1'
//       : 'SELECT id FROM clientss WHERE name = ? AND company = ? LIMIT 1';
//     const dup = await q(dupSql, [name, company]);
//     if (Array.isArray(dup) && dup.length > 0) {
//       return res.status(409).json({ success: false, error: 'Client with this name and company already exists' });
//     }

//     // Generate reference
//     const compInit = (company || '').substring(0, 3).toUpperCase() || name.substring(0, 3).toUpperCase();
//     const last = await q('SELECT ref FROM clientss WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', [`${compInit}%`]);
//     let seq = '0001';
//     if (Array.isArray(last) && last.length > 0) {
//       const lastn = parseInt(last[0].ref.slice(-4) || '0', 10) || 0;
//       seq = (lastn + 1).toString().padStart(4, '0');
//     }
//     const ref = `${compInit}${seq}`;

//     // Insert client
//     const insertSql = `
//       INSERT INTO clientss (
//         ref, name, company, billing_address, office_address, gst_number, tax_id,
//         industry_type, notes, status, manager_id, email, phone,
//         created_by, tenant_id, created_at, isDeleted
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)
//     `;

//     const result = await q(insertSql, [
//       ref, name, company, billingAddress || null, officeAddress || null,
//       gstNumber || null, taxId || null, industry || null, notes || null,
//       status, managerId || null, email || null, phone || null,
//       req.user._id, req.user.tenant_id || null
//     ]);

//     const clientId = result.insertId;

//     // Insert contacts
//     if (Array.isArray(contacts) && contacts.length > 0) {
//       for (const c of contacts) {
//         try {
//           validateContactDTO(c);
//           await q(
//             'INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//             [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]
//           );
//         } catch (e) {
//           logger.warn(`Failed to insert contact for client ${clientId}: ${e.message}`);
//         }
//       }
//     }

//     // Insert documents
//     if (Array.isArray(documents) && documents.length > 0) {
//       for (const d of documents) {
//         const fileName = d.file_name || d.fileName;
//         if (!fileName) continue;
//         const fileUrl = d.file_url || d.fileUrl || `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`;
//         const fileType = d.file_type || guessMimeType(fileName);
//         try {
//           await q(
//             'INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())',
//             [clientId, fileUrl, fileName, fileType || null, req.user._id]
//           );
//         } catch (e) {
//           logger.warn(`Failed to insert document for client ${clientId}: ${e.message}`);
//         }
//       }
//     }

//     // Log activity
//     await q(
//       'INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
//       [clientId, req.user._id, 'create', JSON.stringify({ ref, name, company })]
//     ).catch(() => {});

//     // Generate onboarding tasks
//     let onboardingTasks = [];
//     try {
//       onboardingTasks = await ClientOnboardingService.generateOnboardingTasks(clientId, managerId || null, req.user._id);
//     } catch (e) {
//       logger.warn('Failed to generate onboarding tasks: ' + e.message);
//     }

//     // Create viewer if requested
//     let viewerInfo = null;
//     if (createViewer && contacts && contacts.length > 0 && contacts[0].email) {
//       try {
//         const tempPassword = crypto.randomBytes(6).toString('hex');
//         const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
//         const publicId = crypto.randomBytes(8).toString('hex');
//         const userRes = await q(
//           'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//           [publicId, contacts[0].name || `Viewer for ${name}`, contacts[0].email, hashed, 'Client-Viewer', 1]
//         );
//         const newUserId = userRes.insertId;
//         if (newUserId) {
//           await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]).catch(() => {});
//         }
//         try {
//           const setupLink = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/auth/setup?uid=${encodeURIComponent(publicId)}`;
//           const emailResult = await emailService.sendCredentials(contacts[0].email, contacts[0].name || name, publicId, tempPassword, setupLink);
//           logger.info(`Viewer credentials sent to ${contacts[0].email}: ${emailResult.sent ? 'Success' : 'Failed'}`);
//         } catch (e) {
//           logger.error('Failed to send viewer credentials: ' + e.message);
//         }
//         viewerInfo = { publicId, userId: newUserId };
//       } catch (e) {
//         logger.warn('Failed to create viewer: ' + e.message);
//       }
//     }

//     return res.status(201).json({
//       success: true,
//       message: 'Client created successfully',
//       data: { id: clientId, ref, name, company, status },
//       viewer: viewerInfo,
//       onboardingTasks
//     });
//   } catch (e) {
//     logger.error('Error creating client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to create client', details: e.message });
//   }
// });

// // ==================== GET SINGLE CLIENT ====================
// router.get('/:id', requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
//   try {
//     const id = req.params.id;

//     // Viewer scoping
//     if (req.user.role === 'Client-Viewer') {
//       if (!req.viewerClientId || String(req.viewerClientId) !== String(id)) {
//         return res.status(403).json({ success: false, error: 'Access denied' });
//       }
//     }

//     // Manager access check
//     if (req.user.role === 'Manager') {
//       const assigned = await q('SELECT id FROM clientss WHERE id = ? AND manager_id = ?', [id, req.user._id]);
//       if (!assigned || assigned.length === 0) {
//         return res.status(403).json({ success: false, error: 'Access denied: Not assigned to this client' });
//       }
//     }

//     const client = (await q('SELECT * FROM clientss WHERE id = ? LIMIT 1', [id]))[0];
//     if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

//     // Fetch relations
//     const contacts = await q('SELECT id, name, email, phone, designation, is_primary FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC', [id]).catch(() => []);
//     const documents = await q('SELECT id, file_url, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC', [id]).catch(() => []);
//     const activities = await q('SELECT id, actor_id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [id]).catch(() => []);

//     // Resolve manager
//     if (client.manager_id) {
//       const mgr = await q('SELECT _id, public_id, name FROM users WHERE _id = ? LIMIT 1', [client.manager_id]).catch(() => []);
//       if (mgr && mgr.length > 0) {
//         client.manager_public_id = mgr[0].public_id;
//         client.manager_name = mgr[0].name;
//       }
//     }

//     return res.json({
//       success: true,
//       data: { client, contacts: contacts || [], documents: documents || [], activities: activities || [] }
//     });
//   } catch (e) {
//     logger.error('Error fetching client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to fetch client' });
//   }
// });

// // ==================== UPDATE CLIENT ====================
// router.put('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const id = req.params.id;

//     // Manager access check
//     if (req.user.role === 'Manager') {
//       const assigned = await q('SELECT id FROM clientss WHERE id = ? AND manager_id = ?', [id, req.user._id]);
//       if (!assigned || assigned.length === 0) {
//         return res.status(403).json({ success: false, error: 'Access denied' });
//       }
//     }

//     // Validate
//     try {
//       validateUpdateClientDTO(req.body);
//     } catch (e) {
//       if (e instanceof ClientValidationError) {
//         return res.status(400).json({ success: false, error: e.message, details: e.details });
//       }
//       throw e;
//     }

//     const updates = sanitizeClientData(req.body);
//     const setCols = [];
//     const params = [];

//     for (const [key, value] of Object.entries(updates)) {
//       setCols.push(`${key} = ?`);
//       params.push(value);
//     }

//     params.push(id);
//     await q(`UPDATE clientss SET ${setCols.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`, params.concat([req.user._id]));

//     // Log activity
//     await q(
//       'INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
//       [id, req.user._id, 'update', JSON.stringify(updates)]
//     ).catch(() => {});

//     return res.json({ success: true, message: 'Client updated successfully' });
//   } catch (e) {
//     logger.error('Error updating client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to update client' });
//   }
// });

// // ==================== SOFT DELETE CLIENT ====================
// router.delete('/:id', requireRole('Admin'), async (req, res) => {
//   try {
//     const id = req.params.id;
//     await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'soft-delete', 'Client soft deleted']).catch(() => {});
//     return res.json({ success: true, message: 'Client soft-deleted' });
//   } catch (e) {
//     logger.error('Error deleting client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to delete client' });
//   }
// });

// // ==================== RESTORE CLIENT ====================
// router.post('/:id/restore', requireRole('Admin'), async (req, res) => {
//   try {
//     const id = req.params.id;
//     await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'restore', 'Client restored']).catch(() => {});
//     return res.json({ success: true, message: 'Client restored' });
//   } catch (e) {
//     logger.error('Error restoring client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to restore client' });
//   }
// });

// // ==================== PERMANENT DELETE CLIENT ====================
// router.delete('/:id/permanent', requireRole('Admin'), async (req, res) => {
//   try {
//     const id = req.params.id;
//     await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM clientss WHERE id = ?', [id]);
//     return res.json({ success: true, message: 'Client permanently deleted' });
//   } catch (e) {
//     logger.error('Error permanently deleting client: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to delete client' });
//   }
// });

// // ==================== ASSIGN MANAGER ====================
// router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { managerId } = req.body;
//     if (!managerId) return res.status(400).json({ success: false, error: 'managerId required' });

//     await q('UPDATE clientss SET manager_id = ?, updated_by = ? WHERE id = ?', [managerId, req.user._id, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'assign-manager', JSON.stringify({ managerId })]).catch(() => {});

//     return res.json({ success: true, message: 'Manager assigned' });
//   } catch (e) {
//     logger.error('Error assigning manager: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to assign manager' });
//   }
// });

// // ==================== CONTACT MANAGEMENT ====================
// router.post('/:id/contacts', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const id = req.params.id;
//     try {
//       validateContactDTO(req.body);
//     } catch (e) {
//       if (e instanceof ClientValidationError) {
//         return res.status(400).json({ success: false, error: e.message, details: e.details });
//       }
//       throw e;
//     }

//     const { name, email, phone, designation, is_primary } = req.body;
//     if (is_primary) {
//       await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
//     }

//     const r = await q('INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [id, name, email || null, phone || null, designation || null, is_primary ? 1 : 0]);

//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-added', JSON.stringify({ name, email })]).catch(() => {});

//     return res.status(201).json({ success: true, data: { id: r.insertId } });
//   } catch (e) {
//     logger.error('Error adding contact: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to add contact' });
//   }
// });

// router.put('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const { id, contactId } = req.params;
//     const payload = req.body || {};

//     if (payload.is_primary) {
//       await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
//     }

//     const allowed = ['name', 'email', 'phone', 'designation', 'is_primary'];
//     const sets = [];
//     const params = [];

//     for (const k of allowed) {
//       if (payload[k] !== undefined) {
//         sets.push(`${k} = ?`);
//         params.push(payload[k]);
//       }
//     }

//     if (sets.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

//     params.push(contactId);
//     await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params);

//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-updated', JSON.stringify(payload)]).catch(() => {});

//     return res.json({ success: true, message: 'Contact updated' });
//   } catch (e) {
//     logger.error('Error updating contact: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to update contact' });
//   }
// });

// router.delete('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const { id, contactId } = req.params;
//     await q('DELETE FROM client_contacts WHERE id = ? AND client_id = ?', [contactId, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-deleted', 'Contact deleted']).catch(() => {});
//     return res.json({ success: true, message: 'Contact deleted' });
//   } catch (e) {
//     logger.error('Error deleting contact: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to delete contact' });
//   }
// });

// // ==================== DOCUMENT MANAGEMENT ====================
// router.post('/:id/documents', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { documents = [] } = req.body;

//     if (!Array.isArray(documents) || documents.length === 0) {
//       return res.status(400).json({ success: false, error: 'documents array required' });
//     }

//     const inserted = [];
//     for (const d of documents) {
//       const fileName = d.file_name || d.fileName;
//       if (!fileName) continue;

//       const fileUrl = d.file_url || d.fileUrl || `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`;
//       const fileType = d.file_type || d.document_type || guessMimeType(fileName);

//       const r = await q(
//         'INSERT INTO client_documents (client_id, file_url, file_name, file_type, document_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//         [id, fileUrl, fileName, fileType || null, d.document_type || 'Other', req.user._id]
//       );

//       inserted.push({ id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType });

//       await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-uploaded', JSON.stringify({ fileName })]).catch(() => {});
//     }

//     return res.status(201).json({ success: true, data: inserted });
//   } catch (e) {
//     logger.error('Error uploading documents: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to upload documents' });
//   }
// });

// router.post('/:id/upload', requireRole(['Admin', 'Manager']), upload.array('files', 20), async (req, res) => {
//   try {
//     const { id } = req.params;
//     if (!req.files || req.files.length === 0) {
//       return res.status(400).json({ success: false, error: 'No files uploaded' });
//     }

//     const inserted = [];
//     for (const f of req.files) {
//       const fileName = f.originalname || f.filename;
//       const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(f.filename)}`;
//       const fileType = f.mimetype || guessMimeType(fileName);

//       const r = await q(
//         'INSERT INTO client_documents (client_id, file_url, file_name, file_type, document_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//         [id, fileUrl, fileName, fileType || null, 'Other', req.user._id]
//       );

//       inserted.push({ id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType });

//       await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-uploaded', JSON.stringify({ fileName })]).catch(() => {});
//     }

//     return res.status(201).json({ success: true, data: inserted });
//   } catch (e) {
//     logger.error('Error uploading files: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to upload files' });
//   }
// });

// router.delete('/:id/documents/:docId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     const { id, docId } = req.params;
//     await q('UPDATE client_documents SET is_active = 0, is_deleted = 1 WHERE id = ? AND client_id = ?', [docId, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-deleted', 'Document deleted']).catch(() => {});
//     return res.json({ success: true, message: 'Document deleted' });
//   } catch (e) {
//     logger.error('Error deleting document: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to delete document' });
//   }
// });

// // ==================== CLIENT DASHBOARD ====================
// router.get('/:id/dashboard', requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Viewer scoping
//     if (req.user.role === 'Client-Viewer') {
//       if (!req.viewerClientId || String(req.viewerClientId) !== String(id)) {
//         return res.status(403).json({ success: false, error: 'Access denied' });
//       }
//     }

//     // Manager access check
//     if (req.user.role === 'Manager') {
//       const assigned = await q('SELECT id FROM clientss WHERE id = ? AND manager_id = ?', [id, req.user._id]);
//       if (!assigned || assigned.length === 0) {
//         return res.status(403).json({ success: false, error: 'Access denied' });
//       }
//     }

//     const dashboard = {};

//     // Total projects
//     const projects = await q('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [id]).catch(() => [{ c: 0 }]);
//     dashboard.totalProjects = projects[0]?.c || 0;

//     // Total tasks
//     const tasks = await q('SELECT COUNT(*) as c FROM tasks WHERE client_id = ?', [id]).catch(() => [{ c: 0 }]);
//     dashboard.totalTasks = tasks[0]?.c || 0;

//     // Completed tasks
//     const completedTasks = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status = 'Done'", [id]).catch(() => [{ c: 0 }]);
//     dashboard.completedTasks = completedTasks[0]?.c || 0;

//     // Pending tasks
//     const pendingTasks = await q("SELECT COUNT(*) as c FROM tasks WHERE client_id = ? AND status != 'Done'", [id]).catch(() => [{ c: 0 }]);
//     dashboard.pendingTasks = pendingTasks[0]?.c || 0;

//     // Recent activities
//     const activities = await q('SELECT id, action, details, created_at FROM client_activity_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 10', [id]).catch(() => []);
//     dashboard.recentActivities = activities || [];

//     // Recent documents
//     const documents = await q('SELECT id, file_name, file_type, uploaded_at FROM client_documents WHERE client_id = ? AND is_active = 1 ORDER BY uploaded_at DESC LIMIT 5', [id]).catch(() => []);
//     dashboard.recentDocuments = documents || [];

//     return res.json({ success: true, data: dashboard });
//   } catch (e) {
//     logger.error('Error fetching dashboard: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
//   }
// });

// // ==================== CLIENT-VIEWER MANAGEMENT ====================
// router.post('/:id/create-viewer', requireRole('Admin'), async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { email, name } = req.body;

//     if (!email || !validateEmail(email)) {
//       return res.status(400).json({ success: false, error: 'Valid email required' });
//     }

//     const tempPassword = crypto.randomBytes(6).toString('hex');
//     const hashed = await new Promise((resH, rejH) => require('bcryptjs').hash(tempPassword, 10, (e, h) => e ? rejH(e) : resH(h)));
//     const publicId = crypto.randomBytes(8).toString('hex');

//     const userRes = await q(
//       'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//       [publicId, name || `Viewer for Client ${id}`, email, hashed, 'Client-Viewer', 1]
//     );

//     const newUserId = userRes.insertId;
//     if (newUserId) {
//       await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [id, newUserId]).catch(() => {});
//     }

//     try {
//       const setupLink = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/auth/setup?uid=${encodeURIComponent(publicId)}`;
//       const emailResult = await emailService.sendCredentials(email, name || 'Client Viewer', publicId, tempPassword, setupLink);
//       logger.info(`Viewer credentials sent to ${email}: ${emailResult.sent ? 'Success' : 'Failed'}`);
//     } catch (e) {
//       logger.error('Failed to send credentials: ' + e.message);
//     }

//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'viewer-created', JSON.stringify({ publicId, email })]).catch(() => {});

//     return res.status(201).json({ success: true, data: { publicId, userId: newUserId, email } });
//   } catch (e) {
//     logger.error('Error creating viewer: ' + e.message);
//     return res.status(500).json({ success: false, error: 'Failed to create viewer' });
//   }
// });

// module.exports = router;
