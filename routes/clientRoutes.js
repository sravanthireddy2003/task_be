const express = require('express');
const router = express.Router();
const clientViewerAccessControl = require(__root + 'middleware/clientViewerAccess');
const ClientsApi = require(__root + 'controller/ClientsApi');

router.use(clientViewerAccessControl);
router.use('/', ClientsApi);

module.exports = router;
