// src/workflow/workflowController.js
// APIs for workflow requests, approvals, pending lists, history

const express = require('express');
const router = express.Router();
const workflowService = require('./workflowService');
const auth = require('../middleware/auth');
const { requireAuth } = require('../middleware/roles');

router.use(auth);

// POST /api/workflow/request
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, toState, meta } = req.body;
    const tenantId = req.tenantId || req.user.tenant_id || req.body.tenantId || 1;
    const userId = req.user._id;
    const role = req.user.role;

    const result = await workflowService.requestTransition(tenantId, entityType, entityId, toState, userId, role, meta);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/workflow/approve
router.post('/approve', requireAuth, async (req, res) => {
  try {
    const { requestId, approved, reason } = req.body;
    const userId = req.user._id;
    const role = req.user.role;

    const result = await workflowService.approveRequest(requestId, approved, userId, role, reason);
    res.json({ 
      success: true, 
      message: result.message,
      data: result 
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/pending?role=MANAGER&status=PENDING
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const role = req.query.role || req.user.role;
    // Default to 'all' if manager, so they see history too
    const status = req.query.status || (role === 'MANAGER' || role === 'Admin' ? 'all' : 'PENDING');
    const tenantId = req.tenantId || req.user.tenant_id || 1;
    console.log(`[DEBUG] Fetching workflow requests: tenantId=${tenantId}, role=${role}, status=${status}`);

    const requests = await workflowService.getRequests(tenantId, role, status);
    res.json({ success: true, data: requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/history/:entityType/:entityId
router.get('/history/:entityType/:entityId', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const tenantId = req.tenantId || req.user.tenant_id || 1;

    const history = await workflowService.getHistory(tenantId, entityType, entityId);
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
