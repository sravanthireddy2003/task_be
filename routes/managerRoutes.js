const express = require('express');
const router = express.Router();
const auth = require(__root + 'middleware/auth');
const { allowRoles } = require(__root + 'middleware/role');
const Manager = require(__root + 'controller/managerController');

router.use(auth, allowRoles('Manager'));

router.get('/dashboard', Manager.getManagerDashboard);
router.post('/project', Manager.createProject);
router.put('/project/:id', Manager.updateProject);
router.post('/task/reassign', Manager.reassignTask);

module.exports = router;
