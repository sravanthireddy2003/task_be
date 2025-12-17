const express = require('express');
const router = express.Router();
const { requireAuth } = require(__root + 'middleware/roles');
 
// Import all routers (they export complete routers, not individual functions)
const ProjectsRouter = require(__root + 'controller/Projects');
const TasksRouter = require(__root + 'controller/Tasks');
const SubtasksRouter = require(__root + 'controller/Subtasks');
 
// Ensure authentication on all routes
router.use(requireAuth);
 
// Mount more specific sub-routers first so they are not captured by Projects' dynamic routes
// ==================== TASK ROUTES ====================
// Mount Tasks router at /tasks
router.use('/tasks', TasksRouter);

// ==================== SUBTASK ROUTES ====================
// Mount Subtasks router at /subtasks
router.use('/subtasks', SubtasksRouter);

// ==================== PROJECT ROUTES ====================
// Mount Projects router at root
router.use('/', ProjectsRouter);
 
module.exports = router;
 