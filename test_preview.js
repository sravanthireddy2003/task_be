let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
global.__root = __dirname + '/src/';
const service = require('./src/services/documentService');

const id = process.argv[2];
if (!id) { logger.error('Usage: node test_preview.js <documentId>'); process.exit(1); }

(async () => {
  try {
    const p = await service.getDocumentPreview({ id, user: { role: 'Admin' } });
    logger.info('Preview handle:', p);
  } catch (e) {
    logger.error('Error calling getDocumentPreview:', e && e.message, e && e.stack);
  }
})();
