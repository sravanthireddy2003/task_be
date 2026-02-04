const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const auditController = require(__root + 'controllers/auditController');
const adminRouter = express.Router();
adminRouter.get('/audit-logs', requireAuth, requireRole(['Admin']), auditController.admin);
const managerRouter = express.Router();
managerRouter.get('/audit-logs', requireAuth, requireRole(['Manager','Admin']), auditController.manager);
const employeeRouter = express.Router();
employeeRouter.get('/audit-logs', requireAuth, requireRole(['Employee','Manager','Admin']), auditController.employee);

module.exports = { admin: adminRouter, manager: managerRouter, employee: employeeRouter };
