const express = require('express');
const router = express.Router();
const { requireAuth } = require(__root + 'middleware/roles');

// Import all routers (they export complete routers, not individual functions)
const ProjectsRouter = require(__root + 'cleaned_backend/controller/Projects');
const TasksRouter = require(__root + 'cleaned_backend/controller/Tasks');
const SubtasksRouter = require(__root + 'cleaned_backend/controller/Subtasks');

// Ensure authentication on all routes
router.use(requireAuth);

// ==================== PROJECT ROUTES ====================
// Mount Projects router at root
router.use('/', ProjectsRouter);

// ==================== TASK ROUTES ====================
// Mount Tasks router at /tasks
router.use('/tasks', TasksRouter);

// ==================== SUBTASK ROUTES ====================
// Mount Subtasks router at /subtasks
router.use('/subtasks', SubtasksRouter);

module.exports = router;
