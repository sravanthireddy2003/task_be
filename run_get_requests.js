const svc = require('./src/workflow/workflowService');
let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

(async () => {
  try {
    const rows = await svc.getRequests({ tenantId: 1, role: 'ADMIN', status: 'PENDING' });
    logger.info('RESULTS:', rows.length, rows[0] || null);
    process.exit(0);
  } catch (e) {
    logger.error('ERROR', e);
    process.exit(1);
  }
})();
