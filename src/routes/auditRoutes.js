const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const auditController = require(__root + 'controllers/auditController');

// Admin routes
const adminRouter = express.Router();
adminRouter.use(requireAuth);
adminRouter.use(requireRole(['Admin']));
adminRouter.get('/audit-logs', auditController.admin);

// Manager routes
const managerRouter = express.Router();
managerRouter.use(requireAuth);
managerRouter.use(requireRole(['Manager','Admin']));
managerRouter.get('/audit-logs', auditController.manager);

// Employee routes
const employeeRouter = express.Router();
employeeRouter.use(requireAuth);
employeeRouter.use(requireRole(['Employee','Manager','Admin']));
employeeRouter.get('/audit-logs', auditController.employee);

module.exports = { admin: adminRouter, manager: managerRouter, employee: employeeRouter };
