const express = require('express');
const router = express.Router();
const auth = require(__root + 'middleware/auth');
const { allowRoles } = require(__root + 'middleware/role');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const DocumentController = require(__root + 'controllers/documentController');

router.use(auth);

// Protect all document routes with rule engine
router.use(ruleEngine('DOCUMENT_VIEW'));

router.post('/upload', allowRoles('Admin'), ruleEngine('DOCUMENT_UPLOAD'), DocumentController.uploadDocument);
router.get('/', DocumentController.listDocuments);
router.get('/:id/preview', DocumentController.getDocumentPreview);
router.get('/:id/download', ruleEngine('DOCUMENT_DOWNLOAD'), DocumentController.downloadDocument);
router.post('/:id/assign-access', allowRoles('Admin', 'Manager'), ruleEngine('DOCUMENT_ASSIGN_ACCESS'), DocumentController.assignDocumentAccess);

module.exports = router;