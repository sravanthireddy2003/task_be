// require('dotenv').config();
 
// router.use(requireAuth);
 
//     db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
//   });
// }
 
// /* -------------------- helpers -------------------- */
 
 
//     `SELECT COLUMN_NAME
//      FROM INFORMATION_SCHEMA.COLUMNS
//      WHERE TABLE_SCHEMA = DATABASE()
//      AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
//     [table, column]
//   );
 
// }
 
//     `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
//      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
//     [table]
//   );
// }
 
//   try {
//     await q(`
//       CREATE TABLE IF NOT EXISTS client_contacts (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         client_id INT NOT NULL,
//         name VARCHAR(255) NOT NULL,
//         email VARCHAR(255),
//         phone VARCHAR(50),
//         designation VARCHAR(255),
//         is_primary TINYINT(1) DEFAULT 0,
//         created_at DATETIME DEFAULT NOW()
//       )
//     `);
 
//     await q(`
//       CREATE TABLE IF NOT EXISTS client_documents (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         client_id INT NOT NULL,
//         file_url TEXT,
//         file_name VARCHAR(255),
//         file_type VARCHAR(100),
//         uploaded_by INT,
//         uploaded_at DATETIME DEFAULT NOW(),
//         is_active TINYINT(1) DEFAULT 1
//       )
//     `);
 
//     await q(`
//       CREATE TABLE IF NOT EXISTS client_activity_logs (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         client_id INT NOT NULL,
//         actor_id INT,
//         action VARCHAR(255),
//         details TEXT,
//         created_at DATETIME DEFAULT NOW()
//       )
//     `);
//   } catch (e) {
//     logger.warn('Failed ensuring tables: ' + e.message);
//   }
// }
 
// /* -------------------- CREATE CLIENT -------------------- */
 
// router.post('/', requireRole('Admin'), async (req, res) => {
//   try {
//     await ensureClientTables();
 
//       name,
//       company,
//       billingAddress,
//       officeAddress,
//       gstNumber,
//       taxId,
//       industry,
//       notes,
//       status = 'Active',
//       managerId,
//       contacts = []
 
//         success: false,
//         error: 'Client name and company are required'
//       });
//     }
 
//     // 🔹 Duplicate check
//       'SELECT id FROM clientss WHERE name = ? LIMIT 1',
//       [name]
//     );
//         success: false,
//         error: 'Client already exists'
//       });
//     }
 
//     // 🔹 Create client
 
//       `INSERT INTO clientss
//       (ref, name, company, billing_address, office_address, gst_number, tax_id, industry, notes, status, manager_id, created_at)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
//       [
//         ref,
//         name,
//         company,
//         billingAddress || null,
//         officeAddress || null,
//         gstNumber || null,
//         taxId || null,
//         industry || null,
//         notes || null,
//         status,
//         managerId || null
//       ]
//     );
 
 
//     // 🔹 Insert contacts
 
//       await q(
//         `INSERT INTO client_contacts
//          (client_id, name, email, phone, designation, is_primary, created_at)
//          VALUES (?, ?, ?, ?, ?, ?, NOW())`,
//         [
//           clientId,
//           c.name,
//           c.email || null,
//           c.phone || null,
//           c.designation || null,
//           c.is_primary ? 1 : 0
//         ]
//       );

//       // If contact has an email, create a user as Client-Viewer (not Client)
//           await q(
//             `INSERT INTO users (name, email, role, status, created_at) VALUES (?, ?, ?, ?, NOW())`,
//             [c.name, c.email, 'Client-Viewer', 'Active']
//           );
//         }
//       }

//       }
//     }
 
//     // 🔹 Activity log
//     await q(
//       `INSERT INTO client_activity_logs
//       (client_id, actor_id, action, details, created_at)
//       VALUES (?, ?, 'create', ?, NOW())`,
//       [
//         clientId,
//         req.user?.id || null,
//         JSON.stringify({ createdBy: req.user?.name || 'Admin' })
//       ]
//     );
 
//     // 🔹 Email to CLIENT ONLY
//         `${process.env.FRONTEND_URL || 'http://localhost:4000'}/client-portal/${ref}`;
 
//         name: primaryName,
//         email: primaryEmail,
//         role: 'Client',
//         title: `Welcome to ${company}`,
//         setupLink: portalLink
//       });
 
//       await emailService.sendEmail({
//         to: primaryEmail,
//         subject: template.subject,
//         text: template.text,
//         html: template.html
//       });
//     }
 
//       success: true,
//       message: 'Client created successfully',
//       data: { id: clientId, ref, name, company }
//     });
 
//   } catch (err) {
//     logger.error('Client create error:', err);
//       success: false,
//       error: err.message
//     });
//   }
// });
 
// // GET endpoint (unchanged)
// router.get('/', requireRole(['Admin','Manager','Client-Viewer']), async (req, res) => {
//   try {
   
   
   
   
   
   
//       joinClause = ' LEFT JOIN (SELECT client_id, email, phone FROM client_contacts WHERE is_primary = 1) pc ON pc.client_id = clientss.id ';
//     } else {
//     }
   
   
//   } catch (e) {
//     logger.error('Error listing clients: ' + e.message);
//   }
// });
 
// // DELETE CLIENT ENDPOINT with email notification
// router.delete('/:id', requireRole('Admin'), async (req, res) => {
//   try {
//     }
 
//     }
 
//     // Always perform a hard delete to remove client and related data from DB
//     try {
//       await q('DELETE FROM client_activity_logs WHERE client_id = ?', [clientId]).catch(() => {});
//       // delete documents
//       await q('DELETE FROM client_documents WHERE client_id = ?', [clientId]).catch(() => {});
//       // delete contacts
//       await q('DELETE FROM client_contacts WHERE client_id = ?', [clientId]).catch(() => {});
//       // delete any viewer mappings/users associated with client (safe-names: client_viewers / users)
//       await q('DELETE FROM client_viewers WHERE client_id = ?', [clientId]).catch(() => {});
//       // Finally delete the client
//       await q('DELETE FROM clientss WHERE id = ?', [clientId]);
 
//       try {
//         await q('INSERT INTO client_activity_logs (client_id, actor_id, action, details, created_at) VALUES (?, ?, ?, ?, NOW())',
//           [clientId, req.user && req.user._id ? req.user._id : null, 'hard_delete', JSON.stringify({ deletedBy: req.user ? req.user.id : null })]);
//       } catch (logErr) {
//         logger.debug('Could not record delete activity: ' + logErr.message);
//       }
//     } catch (deleteErr) {
//       logger.error('Error during hard delete operations: ' + deleteErr.message);
//     }
 
//     // **NOTIFY MANAGER ABOUT CLIENT DELETION using emailService**
//       try {
//             taskId: client[0].ref,
//             stage: 'DELETED',
//             userNames: [manager[0].name]
//           });
         
//           await emailService.sendEmail({
//             to: manager[0].email,
//             subject: `Client ${client[0].company} (${client[0].ref}) - DELETED`,
//             text: `Client ${client[0].company} (${client[0].ref}) has been deleted by ${req.user?.name || 'Admin'}.`,
//             html: template.html
//           });
//           logger.info(`Client deletion notification sent to manager ${manager[0].email}`);
//         }
//       } catch (emailErr) {
//         logger.warn('Failed to send client deletion notification: ' + emailErr.message);
//       }
//     }
 
//     logger.info(`Client ${client[0].ref} (${client[0].company}) deleted by ${req.user?.id || 'unknown'}`);
//   } catch (e) {
//     logger.error('Error deleting client: ' + e.message);
//   }
// });
 
 
 