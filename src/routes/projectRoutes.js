const express = require('express');
const router = express.Router();
const { requireAuth } = require(__root + 'middleware/roles');
const ProjectsRouter = require(__root + 'controllers/Projects');
const TasksRouter = require(__root + 'controllers/Tasks');
const SubtasksRouter = require(__root + 'controllers/Subtasks');
router.use(requireAuth);
router.use('/tasks', TasksRouter);
router.use('/subtasks', SubtasksRouter);
router.use('/', ProjectsRouter);
 
module.exports = router;
 