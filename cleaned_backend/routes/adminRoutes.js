const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.manageUsers);
router.get('/clients', adminController.manageClients);
router.get('/departments', adminController.manageDepartments);
router.post('/departments', adminController.createDepartment);
router.put('/departments/:id', adminController.updateDepartment);

module.exports = router;
