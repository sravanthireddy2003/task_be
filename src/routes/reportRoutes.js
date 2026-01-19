const express = require('express');
const router = express.Router();

const ReportsController = require(__root + 'controllers/Reports');

// ReportsController exports a router
router.use('/', ReportsController);

module.exports = router;
