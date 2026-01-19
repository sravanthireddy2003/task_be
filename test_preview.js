global.__root = __dirname + '/src/';
const service = require('./src/services/documentService');

const id = process.argv[2];
if (!id) { console.error('Usage: node test_preview.js <documentId>'); process.exit(1); }

(async () => {
  try {
    const p = await service.getDocumentPreview({ id, user: { role: 'Admin' } });
    console.log('Preview handle:', p);
  } catch (e) {
    console.error('Error calling getDocumentPreview:', e && e.message, e && e.stack);
  }
})();
