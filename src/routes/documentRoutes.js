const express = require('express');
const router = express.Router();

const auth = require(__root + 'middleware/auth');
const ruleEngine = require(__root + 'middleware/ruleEngine');
const DocumentController = require(__root + 'controllers/documentController');

// Authentication first (sets req.user)
router.use(auth);

// Default rule applied to listing/viewing documents — route-specific ruleEngine checks
router.use(ruleEngine('DOCUMENT_VIEW'));

// Upload: rule engine will determine if user may upload
router.post('/upload', ruleEngine('DOCUMENT_UPLOAD'), DocumentController.uploadDocument);

// List documents (supports project-id header for backward compatibility)
router.get('/', DocumentController.listDocuments);

// Preview and Download routes — rule engine checks applied per-route
router.get('/:id/preview', ruleEngine('DOCUMENT_PREVIEW'), DocumentController.getDocumentPreview);
router.get('/:id/download', ruleEngine('DOCUMENT_DOWNLOAD'), DocumentController.downloadDocument);

// Compatibility routes (older clients may call these patterns)
router.get('/preview/:id', ruleEngine('DOCUMENT_PREVIEW'), DocumentController.getDocumentPreview);
router.get('/download/:id', ruleEngine('DOCUMENT_DOWNLOAD'), DocumentController.downloadDocument);

// Assign access — rule engine decides whether this user may assign access
router.post('/:id/assign-access', ruleEngine('DOCUMENT_ASSIGN_ACCESS'), DocumentController.assignDocumentAccess);

module.exports = router;