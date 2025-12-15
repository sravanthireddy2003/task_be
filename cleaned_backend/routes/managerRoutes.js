const express = require('express');
const router = express.Router();
const managerController = require('../controller/managerController');

router.get('/dashboard', managerController.getManagerDashboard);
router.post('/projects', managerController.createProject);
router.put('/projects/:id', managerController.updateProject);
router.post('/tasks/reassign', managerController.reassignTask);

module.exports = router;
