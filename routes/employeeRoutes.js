const express = require('express');
const router = express.Router();
const auth = require(__root + 'middleware/auth');
const { allowRoles } = require(__root + 'middleware/role');
const Employee = require(__root + 'controller/employeeController');

router.use(auth, allowRoles('Employee'));

router.get('/my-tasks', Employee.getMyTasks);
router.post('/subtask', Employee.addSubtask);
router.put('/subtask/:id', Employee.updateSubtask);
router.post('/subtask/:id/complete', Employee.softDeleteChecklistItem);

module.exports = router;
