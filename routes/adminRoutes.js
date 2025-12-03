const express = require('express');
const router = express.Router();
const auth = require(__root + 'middleware/auth');
const { allowRoles } = require(__root + 'middleware/role');
const Admin = require(__root + 'controller/adminController');

router.use(auth, allowRoles('Admin'));

router.get('/dashboard', Admin.getDashboard);
router.get('/users', Admin.manageUsers);
router.get('/clients', Admin.manageClients);
router.get('/departments', Admin.manageDepartments);
router.get('/projects', Admin.manageProjects);
router.get('/tasks', Admin.manageTasks);

module.exports = router;
