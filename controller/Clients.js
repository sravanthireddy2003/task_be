const db = require(__root + "db");
const express = require("express");
const router = express.Router();
const verify = require('./VerifyToken');
const upload = require('../multer');
const { storage } = require('./utils/Firestore');
const cloudinary = require('cloudinary');
const multer = require('multer');
const { ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const CryptoJS = require('crypto-js');
const cron = require('node-cron');
const nodemailer = require('nodemailer');


// CREATE - Add a new client
// router.post('/clients', (req, res) => {
//     const {ref, name, email, phone, company, address, district, state, pincode} = req.body;

//     const sql = `INSERT INTO clientss (ref, name, email, phone, company, address, district,
//                 state, pincode)
//                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//     db.query(sql, [ref, name, email, phone, company, address, district, state,pincode], (err, result) => {
//         if (err) {
//             return res.status(500).json({ error: 'Database error' });
//         }
//         res.status(201).json({ message: 'Client added', clientId: result.insertId });
//     });
// });


router.post('/clients', (req, res) => {
    const { name, email, phone, company, address, district, state, pincode } = req.body;

    // Generate reference number
    const companyInitials = company.substring(0, 3).toUpperCase();
    
    // Query to get the last reference number for this company initial sequence
    const getLastRefQuery = `
        SELECT ref 
        FROM clientss 
        WHERE ref LIKE ? 
        ORDER BY ref DESC 
        LIMIT 1
    `;

    db.query(getLastRefQuery, [`${companyInitials}%`], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error in reference generation' });
        }

        // Generate new reference number
        let newSeriesNumber = '0001';
        if (rows.length > 0) {
            // Extract the last 4 digits and increment
            const lastSeriesNumber = parseInt(rows[0].ref.slice(-4));
            newSeriesNumber = (lastSeriesNumber + 1).toString().padStart(4, '0');
        }

        const ref = `${companyInitials}${newSeriesNumber}`;

        // Insert client with the generated reference
        const insertSql = `
            INSERT INTO clientss (ref, name, email, phone, company, address, district, state, pincode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(insertSql, [ref, name, email, phone, company, address, district, state, pincode], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error in client insertion' });
            }
            
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
    db.query('SELECT * FROM clientss', (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(200).json(results);
    });
});



// READ - Get a single client by ID
router.get('/clients/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM clientss WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(200).json(result[0]);
    });
});

// UPDATE - Edit a client by ID
router.put('/clients/:id', (req, res) => {
    const { id } = req.params;
    const {
        ref, name, email, phone, company, address, district,
        state, pincode, taxId, paymentTerms, bankAccount, creditLimit
    } = req.body;

    const sql = `UPDATE clientss SET ref = ?, name = ?, email = ?, phone = ?, company = ?, address = ?,
                 district = ?, state = ?, pincode = ?, taxId = ?, paymentTerms = ?, bankAccount = ?,
                 creditLimit = ? WHERE id = ?`;

    db.query(sql, [ref, name, email, phone, company, address, district, state,
        pincode, taxId, paymentTerms, bankAccount, creditLimit, id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(200).json({ message: 'Client updated' });
    });
});

// DELETE - Remove a client by ID
router.delete('/clients/:id', (req, res) => {
    const { id } = req.params;

    db.query('DELETE FROM clientss WHERE id = ?', [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(200).json({ message: 'Client deleted' });
    });
});

module.exports = router;
