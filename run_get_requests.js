const svc = require('./src/workflow/workflowService');

(async () => {
  try {
    const rows = await svc.getRequests({ tenantId: 1, role: 'ADMIN', status: 'PENDING' });
    console.log('RESULTS:', rows.length, rows[0] || null);
    process.exit(0);
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  }
})();
