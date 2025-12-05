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
router.post('/departments', Admin.createDepartment);
router.put('/departments/:id', Admin.updateDepartment);
router.delete('/departments/:id', Admin.deleteDepartment);
router.get('/projects', Admin.manageProjects);
router.get('/tasks', Admin.manageTasks);

// Modules CRUD
router.get('/modules', Admin.getModules);
router.get('/modules/:id', Admin.getModuleById);
router.post('/modules', Admin.createModule);
router.put('/modules/:id', Admin.updateModule);
router.delete('/modules/:id', Admin.deleteModule);

module.exports = router;
