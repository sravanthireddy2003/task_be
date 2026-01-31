
const express = require('express');
const router = express.Router();
const workflowService = require('./workflowService');
const auth = require('../middleware/auth');
const { requireAuth, requireRole } = require('../middleware/roles');
let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { logger = require('../logger'); }

router.use(auth);

router.use((req, res, next) => {
  let tid = req.tenantId || (req.user && req.user.tenant_id) || 1;
  if (typeof tid === 'string' && tid.startsWith('tenant_')) {
    const suffix = tid.replace('tenant_', '');
    if (suffix && !isNaN(suffix)) {
      tid = parseInt(suffix, 10);
    }
  }
  req.normalizedTenantId = tid;
  next();
});

// POST /api/workflow/request
// Employee requests task completion, which moves it to REVIEW
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, toState, projectId, meta } = req.body;
    const tenantId = req.normalizedTenantId;
    const userId = req.user._id;
    const role = req.user.role;

    const result = await workflowService.requestTransition({
      tenantId, 
      entityType, 
      entityId, 
      toState, 
      userId, 
      role, 
      projectId,
      meta
    });
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error("[ERROR] /workflow/request:", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/workflow/project/close-request
// Manager requests project closure when all tasks are completed
router.post('/project/close-request', requireAuth, requireRole(['MANAGER']), async (req, res) => {
  try {
    const { projectId, reason } = req.body;
    const tenantId = req.normalizedTenantId;
    const userId = req.user._id;

    if (!projectId) return res.status(400).json({ success: false, error: 'projectId is required' });

    const result = await workflowService.requestProjectClosure({ tenantId, projectId, reason, userId });
    return res.json({ success: true, message: 'Project closure request sent to admin', data: result });
  } catch (e) {
    logger.error('[ERROR] /workflow/project/close-request:', e);
    return res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/workflow/approve
// Manager/Admin approves or rejects a request
router.post('/approve', requireAuth, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
  try {
    const { requestId, action, reason } = req.body;
    const tenantId = req.normalizedTenantId;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action. Must be 'APPROVE' or 'REJECT'." });
    }

    const result = await workflowService.processApproval({
      tenantId,
      requestId,
      action,
      reason,
      userId,
      userRole
    });
    
    res.json({ 
      success: true, 
      message: result.message,
      data: result 
    });
  } catch (e) {
    logger.error("[ERROR] /workflow/approve:", e);
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/pending
// Returns workflow requests with enriched project/task data
// ⚠️ IMPORTANT: Frontend developers, see docs/WORKFLOW_STATUS_GUIDE.md for status field usage
// Always use `project_status_info.display` for UI, NOT `project_status`
router.get('/pending', requireAuth, async (req, res) => {
  try {
    let role = req.query.role || req.user.role;
    if (role.toUpperCase() === 'ADMIN') role = 'Admin';
    else if (role.toUpperCase() === 'MANAGER') role = 'Manager';

    const requestedStatus = req.query.status || (['Manager', 'Admin'].includes(role) ? 'all' : 'PENDING');
    
    const tenantId = req.normalizedTenantId;
    
    logger.debug(`[DEBUG] Fetching workflow requests: tenantId=${tenantId}, role=${role}, requestedStatus=${requestedStatus}`);

    // Always fetch PENDING requests (ready to approve)
    const pendingRequests = await workflowService.getRequests({ tenantId, role, status: 'PENDING' });
    
    // Always fetch APPROVED requests (already approved)
    const approvedRequests = await workflowService.getRequests({ tenantId, role, status: 'APPROVED' });

    // Filter out requests where project is already CLOSED (shouldn't be in workflow) - only for PENDING
    const filterClosedProjects = (requests) => 
      requests.filter(r => String(r.project_status).toUpperCase() !== 'CLOSED');

    const filteredPendingRequests = filterClosedProjects(pendingRequests);
    // For approved requests, we want to show them even if project is now closed (historical record)
    const filteredApprovedRequests = approvedRequests;

    // Prepare response data
    const responseData = {
      ready_to_approve: filteredPendingRequests.map(r => ({
        ...r,
        requested_by_name: r.requested_by_name || r.requestedByName || null,
        requestedByName: r.requested_by_name || r.requestedByName || null
      })),
      already_approved: filteredApprovedRequests.map(r => ({
        ...r,
        requested_by_name: r.requested_by_name || r.requestedByName || null,
        requestedByName: r.requested_by_name || r.requestedByName || null
      }))
    };

    const totalRequests = responseData.ready_to_approve.length + responseData.already_approved.length;
    const listMessage = totalRequests > 0 
      ? `Fetched ${responseData.ready_to_approve.length} pending and ${responseData.already_approved.length} approved workflow requests.` 
      : "No workflow requests found.";

    res.json({ 
      success: true, 
      message: listMessage,
      data: responseData,
      readOnly: false // Both sections are clearly separated
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/workflow/history/:entityType/:entityId
router.get('/history/:entityType/:entityId', requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const tenantId = req.normalizedTenantId;

    const history = await workflowService.getHistory(tenantId, entityType, entityId);
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
