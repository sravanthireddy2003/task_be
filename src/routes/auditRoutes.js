const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const auditController = require(__root + 'controllers/auditController');

// Admin routes - protect only the audit-logs endpoint, not all /api/admin paths
const adminRouter = express.Router();
adminRouter.get('/audit-logs', requireAuth, requireRole(['Admin']), auditController.admin);

// Manager routes - restrict only the audit-logs endpoint
const managerRouter = express.Router();
managerRouter.get('/audit-logs', requireAuth, requireRole(['Manager','Admin']), auditController.manager);

// Employee routes - restrict only the audit-logs endpoint
const employeeRouter = express.Router();
employeeRouter.get('/audit-logs', requireAuth, requireRole(['Employee','Manager','Admin']), auditController.employee);

module.exports = { admin: adminRouter, manager: managerRouter, employee: employeeRouter };
