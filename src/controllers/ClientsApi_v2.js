// /**
//  * Enhanced Client Management API Controller
//  * Complete CRUD with permissions, validation, dashboard, and onboarding
//  */
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

//     cb(null, uploadsRoot);
//   },
//     cb(null, name);
//   }
// });

// // ==================== HELPERS ====================
//     db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
//   });
// }

//   try {
//   } catch (e) {
//   }
// }

//   try {
//   } catch (e) {
//   }
// }

//     pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
//     gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
//     docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//   };
// }

//   try {
//     }
//     }
//     }
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


//     // Multi-tenant isolation
//         where.push('(clientss.tenant_id = ? OR clientss.tenant_id IS NULL)');
//         params.push(req.user.tenant_id);
//       }
//       // Managers see only their assigned clients
//       where.push('clientss.manager_id = ?');
//       params.push(req.user._id);
//       // Viewers see only their mapped client
//       where.push('clientss.id = ?');
//       params.push(req.viewerClientId);
//     }

//     // Soft delete filter
//       where.push('clientss.isDeleted != 1');
//     }

//     // Search
//       where.push('(clientss.name LIKE ? OR clientss.company LIKE ? OR clientss.gst_number LIKE ?)');
//       params.push(`%${search}%`, `%${search}%`, `%${search}%`);
//     }

//     // Status filter
//       where.push('clientss.status = ?');
//       params.push(status);
//     }

//     // Admin can filter by specific manager
//       where.push('clientss.manager_id = ?');
//       params.push(manager_id);
//     }


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


//     // Attach document count per client
//     }));

//   } catch (e) {
//     logger.error('Error listing clients: ' + e.message);
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
//       }
//     }

//       name, company, billingAddress, officeAddress, gstNumber, taxId,
//       industry, notes, status = 'Active', managerId, email, phone,
//       contacts = [], documents = [], createViewer = false

//     // Check duplicate
//       ? 'SELECT id FROM clientss WHERE name = ? AND company = ? AND isDeleted != 1 LIMIT 1'
//       : 'SELECT id FROM clientss WHERE name = ? AND company = ? LIMIT 1';
//     }

//     // Generate reference
//       seq = (lastn + 1).toString().padStart(4, '0');
//     }

//     // Insert client
//       INSERT INTO clientss (
//         ref, name, company, billing_address, office_address, gst_number, tax_id,
//         industry_type, notes, status, manager_id, email, phone,
//         created_by, tenant_id, created_at, isDeleted
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)
//     `;

//       ref, name, company, billingAddress || null, officeAddress || null,
//       gstNumber || null, taxId || null, industry || null, notes || null,
//       status, managerId || null, email || null, phone || null,
//       req.user._id, req.user.tenant_id || null
//     ]);


//     // Insert contacts
//         try {
//           validateContactDTO(c);
//           await q(
//             'INSERT INTO client_contacts (client_id, name, email, phone, designation, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//             [clientId, c.name, c.email || null, c.phone || null, c.designation || null, c.is_primary ? 1 : 0]
//           );
//         } catch (e) {
//         }
//       }
//     }

//     // Insert documents
//         try {
//           await q(
//             'INSERT INTO client_documents (client_id, file_url, file_name, file_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, NOW())',
//             [clientId, fileUrl, fileName, fileType || null, req.user._id]
//           );
//         } catch (e) {
//         }
//       }
//     }

//     // Log activity
//     await q(
//       'INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
//       [clientId, req.user._id, 'create', JSON.stringify({ ref, name, company })]
//     ).catch(() => {});

//     // Generate onboarding tasks
//     try {
//       onboardingTasks = await ClientOnboardingService.generateOnboardingTasks(clientId, managerId || null, req.user._id);
//     } catch (e) {
//       logger.warn('Failed to generate onboarding tasks: ' + e.message);
//     }

//       try {
//           'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//         );
//           await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [clientId, newUserId]).catch(() => {});
//         }
//         try {
//           logger.info(`Viewer credentials sent to ${contacts[0].email}: ${emailResult.sent ? 'Success' : 'Failed'}`);
//         } catch (e) {
//           logger.error('Failed to send viewer credentials: ' + e.message);
//         }
//         viewerInfo = { publicId, userId: newUserId };
//       } catch (e) {
//         logger.warn('Failed to create viewer: ' + e.message);
//       }
//     }

//       success: true,
//       message: 'Client created successfully',
//       data: { id: clientId, ref, name, company, status },
//       viewer: viewerInfo,
//       onboardingTasks
//     });
//   } catch (e) {
//     logger.error('Error creating client: ' + e.message);
//   }
// });

// // ==================== GET SINGLE CLIENT ====================
// router.get('/:id', requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
//   try {

//     // Viewer scoping
//       }
//     }

//     // Manager access check
//       }
//     }


//     // Fetch relations

//     // Resolve manager
//       }
//     }

//       success: true,
//       data: { client, contacts: contacts || [], documents: documents || [], activities: activities || [] }
//     });
//   } catch (e) {
//     logger.error('Error fetching client: ' + e.message);
//   }
// });

// // ==================== UPDATE CLIENT ====================
// router.put('/:id', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {

//     // Manager access check
//       }
//     }

//     // Validate
//     try {
//       validateUpdateClientDTO(req.body);
//     } catch (e) {
//       }
//     }


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

//   } catch (e) {
//     logger.error('Error updating client: ' + e.message);
//   }
// });

// // ==================== SOFT DELETE CLIENT ====================
// router.delete('/:id', requireRole('Admin'), async (req, res) => {
//   try {
//     await q('UPDATE clientss SET isDeleted = 1, deleted_at = NOW() WHERE id = ?', [id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'soft-delete', 'Client soft deleted']).catch(() => {});
//   } catch (e) {
//     logger.error('Error deleting client: ' + e.message);
//   }
// });

// // ==================== RESTORE CLIENT ====================
// router.post('/:id/restore', requireRole('Admin'), async (req, res) => {
//   try {
//     await q('UPDATE clientss SET isDeleted = 0, deleted_at = NULL WHERE id = ?', [id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'restore', 'Client restored']).catch(() => {});
//   } catch (e) {
//     logger.error('Error restoring client: ' + e.message);
//   }
// });

// // ==================== PERMANENT DELETE CLIENT ====================
// router.delete('/:id/permanent', requireRole('Admin'), async (req, res) => {
//   try {
//     await q('DELETE FROM client_documents WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_contacts WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_activity_logs WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM client_viewers WHERE client_id = ?', [id]).catch(() => {});
//     await q('DELETE FROM clientss WHERE id = ?', [id]);
//   } catch (e) {
//     logger.error('Error permanently deleting client: ' + e.message);
//   }
// });

// // ==================== ASSIGN MANAGER ====================
// router.post('/:id/assign-manager', requireRole('Admin'), async (req, res) => {
//   try {

//     await q('UPDATE clientss SET manager_id = ?, updated_by = ? WHERE id = ?', [managerId, req.user._id, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'assign-manager', JSON.stringify({ managerId })]).catch(() => {});

//   } catch (e) {
//     logger.error('Error assigning manager: ' + e.message);
//   }
// });

// // ==================== CONTACT MANAGEMENT ====================
// router.post('/:id/contacts', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     try {
//       validateContactDTO(req.body);
//     } catch (e) {
//       }
//     }

//       await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
//     }


//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-added', JSON.stringify({ name, email })]).catch(() => {});

//   } catch (e) {
//     logger.error('Error adding contact: ' + e.message);
//   }
// });

// router.put('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {

//       await q('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [id]);
//     }


//         sets.push(`${k} = ?`);
//         params.push(payload[k]);
//       }
//     }


//     params.push(contactId);
//     await q(`UPDATE client_contacts SET ${sets.join(', ')} WHERE id = ?`, params);

//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-updated', JSON.stringify(payload)]).catch(() => {});

//   } catch (e) {
//     logger.error('Error updating contact: ' + e.message);
//   }
// });

// router.delete('/:id/contacts/:contactId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     await q('DELETE FROM client_contacts WHERE id = ? AND client_id = ?', [contactId, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'contact-deleted', 'Contact deleted']).catch(() => {});
//   } catch (e) {
//     logger.error('Error deleting contact: ' + e.message);
//   }
// });

// // ==================== DOCUMENT MANAGEMENT ====================
// router.post('/:id/documents', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {

//     }



//         'INSERT INTO client_documents (client_id, file_url, file_name, file_type, document_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//         [id, fileUrl, fileName, fileType || null, d.document_type || 'Other', req.user._id]
//       );

//       inserted.push({ id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType });

//       await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-uploaded', JSON.stringify({ fileName })]).catch(() => {});
//     }

//   } catch (e) {
//     logger.error('Error uploading documents: ' + e.message);
//   }
// });

// router.post('/:id/upload', requireRole(['Admin', 'Manager']), upload.array('files', 20), async (req, res) => {
//   try {
//     }


//         'INSERT INTO client_documents (client_id, file_url, file_name, file_type, document_type, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//         [id, fileUrl, fileName, fileType || null, 'Other', req.user._id]
//       );

//       inserted.push({ id: r.insertId, file_url: fileUrl, file_name: fileName, file_type: fileType });

//       await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-uploaded', JSON.stringify({ fileName })]).catch(() => {});
//     }

//   } catch (e) {
//     logger.error('Error uploading files: ' + e.message);
//   }
// });

// router.delete('/:id/documents/:docId', requireRole(['Admin', 'Manager']), async (req, res) => {
//   try {
//     await q('UPDATE client_documents SET is_active = 0, is_deleted = 1 WHERE id = ? AND client_id = ?', [docId, id]);
//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'document-deleted', 'Document deleted']).catch(() => {});
//   } catch (e) {
//     logger.error('Error deleting document: ' + e.message);
//   }
// });

// // ==================== CLIENT DASHBOARD ====================
// router.get('/:id/dashboard', requireRole(['Admin', 'Manager', 'Client-Viewer']), async (req, res) => {
//   try {

//     // Viewer scoping
//       }
//     }

//     // Manager access check
//       }
//     }


//     // Total projects

//     // Total tasks

//     // Completed tasks

//     // Pending tasks

//     // Recent activities
//     dashboard.recentActivities = activities || [];

//     // Recent documents
//     dashboard.recentDocuments = documents || [];

//   } catch (e) {
//     logger.error('Error fetching dashboard: ' + e.message);
//   }
// });

// // ==================== CLIENT-VIEWER MANAGEMENT ====================
// router.post('/:id/create-viewer', requireRole('Admin'), async (req, res) => {
//   try {

//     }


//       'INSERT INTO users (public_id, name, email, password, role, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//     );

//       await q('INSERT INTO client_viewers (client_id, user_id, created_at) VALUES (?, ?, NOW())', [id, newUserId]).catch(() => {});
//     }

//     try {
//       logger.info(`Viewer credentials sent to ${email}: ${emailResult.sent ? 'Success' : 'Failed'}`);
//     } catch (e) {
//       logger.error('Failed to send credentials: ' + e.message);
//     }

//     await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())', [id, req.user._id, 'viewer-created', JSON.stringify({ publicId, email })]).catch(() => {});

//   } catch (e) {
//     logger.error('Error creating viewer: ' + e.message);
//   }
// });

