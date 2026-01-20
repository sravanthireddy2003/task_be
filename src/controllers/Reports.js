const express = require('express');
const router = express.Router();
const logger = require(__root + 'logger');
const { generateProjectReport, projectLookupDiagnostic } = require(__root + 'services/reportService');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');

router.use(requireAuth);

// POST /api/reports/project
router.post('/project', async (req, res) => {
  try {
    const { projectId, startDate, endDate } = req.body || {};
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'projectId, startDate and endDate are required' });
    }

    const sd = new Date(startDate);
    const ed = new Date(endDate);
    if (isNaN(sd.getTime()) || isNaN(ed.getTime()) || sd > ed) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    const report = await generateProjectReport(req.user, projectId, startDate, endDate);
    return res.json({ success: true, data: report });
  } catch (err) {
    logger.error('Generate project report error:', err && err.stack ? err.stack : err);
    if (err && err.status) {
      const payload = { success: false, message: err.message };
      if (err.diagnostic) payload.diagnostic = err.diagnostic;
      return res.status(err.status).json(payload);
    }
    return res.status(500).json({ success: false, message: err && err.message ? err.message : 'Failed generating project report' });
  }
});

// DEBUG: GET /api/reports/debug-project?projectId=...
// Returns which lookup strategies succeeded/failed. Restricted to Admin/Manager.
router.get('/debug-project', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const projectId = req.query.projectId || req.query.project_id;
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId required' });
    const diag = await projectLookupDiagnostic(projectId, req.user ? req.user.tenant_id : null);
    return res.json({ success: true, data: diag });
  } catch (err) {
    logger.error('Project lookup diagnostic error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Diagnostic failed', error: err && err.message });
  }
});

module.exports = router;
