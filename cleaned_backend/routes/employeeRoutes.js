const express = require('express');
const router = express.Router();
const employeeController = require('../controller/employeeController');

router.get('/my-tasks', employeeController.getMyTasks);
router.post('/subtasks', employeeController.addSubtask);
router.put('/subtasks/:id', employeeController.updateSubtask);

module.exports = router;
