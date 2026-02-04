const express = require('express');
const router = express.Router();

const auth = require(__root + 'middleware/auth');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const DocumentController = require(__root + 'controllers/documentController');

router.use(auth);

router.use(ruleEngine('DOCUMENT_VIEW'));

router.post('/upload', ruleEngine('DOCUMENT_UPLOAD'), DocumentController.uploadDocument);

router.get('/', DocumentController.listDocuments);

router.get('/my', DocumentController.getMyDocuments);

router.get('/project/:projectId/members', DocumentController.getProjectMembers);

router.get('/:id/preview', ruleEngine('DOCUMENT_PREVIEW'), DocumentController.getDocumentPreview);
router.get('/:id/download', ruleEngine('DOCUMENT_DOWNLOAD'), DocumentController.downloadDocument);

router.get('/preview/:id', ruleEngine('DOCUMENT_PREVIEW'), DocumentController.getDocumentPreview);
router.get('/download/:id', ruleEngine('DOCUMENT_DOWNLOAD'), DocumentController.downloadDocument);

router.post('/:id/assign-access', ruleEngine('DOCUMENT_ASSIGN_ACCESS'), DocumentController.assignDocumentAccess);

router.post('/access', ruleEngine('DOCUMENT_ASSIGN_ACCESS'), DocumentController.assignDocumentAccess);

module.exports = router;