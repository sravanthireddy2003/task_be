const db = require(__root + "db");
const express = require("express");
const router = express.Router();
const logger = require("../logger");

// CREATE - Add a new client
router.post('/clients', (req, res) => {
    const { name, email, phone, company, address, district, state, pincode } = req.body;

    logger.info(`Attempting to add new client: ${name}, Company: ${company}`);

    // Generate reference number
    const companyInitials = company.substring(0, 3).toUpperCase();

    const getLastRefQuery = `
        SELECT ref 
        FROM clientss 
        WHERE ref LIKE ? 
        ORDER BY ref DESC 
        LIMIT 1
    `;

    db.query(getLastRefQuery, [`${companyInitials}%`], (err, rows) => {
        if (err) {
            logger.error(`Database error while generating reference for client: ${err.message}`);
            return res.status(500).json({ error: 'Database error in reference generation' });
        }

        let newSeriesNumber = '0001';
        if (rows.length > 0) {
            const lastSeriesNumber = parseInt(rows[0].ref.slice(-4));
            newSeriesNumber = (lastSeriesNumber + 1).toString().padStart(4, '0');
        }

        const ref = `${companyInitials}${newSeriesNumber}`;
        logger.info(`Generated reference: ${ref} for client: ${name}`);

        const insertSql = `
            INSERT INTO clientss (ref, name, email, phone, company, address, district, state, pincode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(insertSql, [ref, name, email, phone, company, address, district, state, pincode], (err, result) => {
            if (err) {
                logger.error(`Database error while adding client ${name}: ${err.message}`);
                return res.status(500).json({ error: 'Database error in client insertion' });
            }

            logger.info(`Client ${name} added successfully with ID ${result.insertId}`);
            res.status(201).json({
                message: 'Client added',
                clientId: result.insertId,
                reference: ref
            });
        });
    });
});

// READ - Get all clients
router.get('/clients', (req, res) => {
    // logger.info('Fetching all clients from the database.');

    db.query('SELECT * FROM clientss', (err, results) => {
        if (err) {
            logger.error(`Error fetching clients: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        }
        // logger.info('Fetched all clients successfully.');
        res.status(200).json(results);
    });
});

// READ - Get a single client by ID
router.get('/clients/:id', (req, res) => {
    const { id } = req.params;
    logger.info(`Fetching client with ID: ${id}`);

    db.query('SELECT * FROM clientss WHERE id = ?', [id], (err, result) => {
        if (err) {
            logger.error(`Error fetching client with ID ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.length === 0) {
            logger.warn(`Client with ID ${id} not found.`);
            return res.status(404).json({ error: 'Client not found' });
        }
        logger.info(`Fetched client with ID: ${id} successfully.`);
        res.status(200).json(result[0]);
    });
});

// UPDATE - Edit a client by ID
router.put('/clients/:id', (req, res) => {
    const { id } = req.params;
    const { ref, name, email, phone, company, address, district, state, pincode, taxId, paymentTerms, bankAccount, creditLimit } = req.body;

    logger.info(`Updating client with ID: ${id}`);

    const sql = `UPDATE clientss SET ref = ?, name = ?, email = ?, phone = ?, company = ?, address = ?,
                 district = ?, state = ?, pincode = ?, taxId = ?, paymentTerms = ?, bankAccount = ?, 
                 creditLimit = ? WHERE id = ?`;

    db.query(sql, [ref, name, email, phone, company, address, district, state, pincode, taxId, paymentTerms, bankAccount, creditLimit, id], (err, result) => {
        if (err) {
            logger.error(`Error updating client with ID ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            logger.warn(`Client with ID ${id} not found for update.`);
            return res.status(404).json({ error: 'Client not found' });
        }
        logger.info(`Client with ID: ${id} updated successfully.`);
        res.status(200).json({ message: 'Client updated' });
    });
});

// DELETE - Remove a client by ID
router.delete('/clients/:id', (req, res) => {
    const { id } = req.params;

    logger.info(`Deleting client with ID: ${id}`);

    db.query('DELETE FROM clientss WHERE id = ?', [id], (err, result) => {
        if (err) {
            logger.error(`Error deleting client with ID ${id}: ${err.message}`);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            logger.warn(`Client with ID ${id} not found for deletion.`);
            return res.status(404).json({ error: 'Client not found' });
        }
        logger.info(`Client with ID: ${id} deleted successfully.`);
        res.status(200).json({ message: 'Client deleted' });
    });
});

module.exports = router;










// const db = require(__root + "db");
// const express = require("express");
// const router = express.Router();
// const verify = require('./VerifyToken');
// const upload = require('../multer');
// const { storage } = require('./utils/Firestore');
// const cloudinary = require('cloudinary');
// const multer = require('multer');
// const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
// const CryptoJS = require('crypto-js');
// const cron = require('node-cron');
// const nodemailer = require('nodemailer');
// const logger = require("../logger");



// // CREATE - Add a new client
// // router.post('/clients', (req, res) => {
// //     const {ref, name, email, phone, company, address, district, state, pincode} = req.body;

// //     const sql = `INSERT INTO clientss (ref, name, email, phone, company, address, district,
// //                 state, pincode)
// //                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// //     db.query(sql, [ref, name, email, phone, company, address, district, state,pincode], (err, result) => {
// //         if (err) {
// //             return res.status(500).json({ error: 'Database error' });
// //         }
// //         res.status(201).json({ message: 'Client added', clientId: result.insertId });
// //     });
// // });


// router.post('/clients', (req, res) => {
//     const { name, email, phone, company, address, district, state, pincode } = req.body;

//     // Generate reference number
//     const companyInitials = company.substring(0, 3).toUpperCase();
    
//     // Query to get the last reference number for this company initial sequence
//     const getLastRefQuery = `
//         SELECT ref 
//         FROM clientss 
//         WHERE ref LIKE ? 
//         ORDER BY ref DESC 
//         LIMIT 1
//     `;

//     db.query(getLastRefQuery, [`${companyInitials}%`], (err, rows) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error in reference generation' });
//         }

//         // Generate new reference number
//         let newSeriesNumber = '0001';
//         if (rows.length > 0) {
//             // Extract the last 4 digits and increment
//             const lastSeriesNumber = parseInt(rows[0].ref.slice(-4));
//             newSeriesNumber = (lastSeriesNumber + 1).toString().padStart(4, '0');
//         }

//         const ref = `${companyInitials}${newSeriesNumber}`;

//         // Insert client with the generated reference
//         const insertSql = `
//             INSERT INTO clientss (ref, name, email, phone, company, address, district, state, pincode)
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `;

//         db.query(insertSql, [ref, name, email, phone, company, address, district, state, pincode], (err, result) => {
//             if (err) {
//                 return res.status(500).json({ error: 'Database error in client insertion' });
//             }
            
//             res.status(201).json({ 
//                 message: 'Client added', 
//                 clientId: result.insertId,
//                 reference: ref 
//             });
//         });
//     });
// });



// // READ - Get all clients
// router.get('/clients', (req, res) => {
//     db.query('SELECT * FROM clientss', (err, results) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error' });
//         }
//         res.status(200).json(results);
//     });
// });



// // READ - Get a single client by ID
// router.get('/clients/:id', (req, res) => {
//     const { id } = req.params;
//     db.query('SELECT * FROM clientss WHERE id = ?', [id], (err, result) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error' });
//         }
//         if (result.length === 0) {
//             return res.status(404).json({ error: 'Client not found' });
//         }
//         res.status(200).json(result[0]);
//     });
// });

// // UPDATE - Edit a client by ID
// router.put('/clients/:id', (req, res) => {
//     const { id } = req.params;
//     const {
//         ref, name, email, phone, company, address, district,
//         state, pincode, taxId, paymentTerms, bankAccount, creditLimit
//     } = req.body;

//     const sql = `UPDATE clientss SET ref = ?, name = ?, email = ?, phone = ?, company = ?, address = ?,
//                  district = ?, state = ?, pincode = ?, taxId = ?, paymentTerms = ?, bankAccount = ?,
//                  creditLimit = ? WHERE id = ?`;

//     db.query(sql, [ref, name, email, phone, company, address, district, state,
//         pincode, taxId, paymentTerms, bankAccount, creditLimit, id], (err, result) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error' });
//         }
//         if (result.affectedRows === 0) {
//             return res.status(404).json({ error: 'Client not found' });
//         }
//         res.status(200).json({ message: 'Client updated' });
//     });
// });

// // DELETE - Remove a client by ID
// router.delete('/clients/:id', (req, res) => {
//     const { id } = req.params;

//     db.query('DELETE FROM clientss WHERE id = ?', [id], (err, result) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error' });
//         }
//         if (result.affectedRows === 0) {
//             return res.status(404).json({ error: 'Client not found' });
//         }
//         res.status(200).json({ message: 'Client deleted' });
//     });
// });

// module.exports = router;
