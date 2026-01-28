// src/workflow/workflowService.js
// Main service layer for workflow logic

const db = require('../db');
const { canTransition, requiresApproval } = require('./workflowEngine');
const workflowLogs = require('./workflowLogs');
const NotificationService = require('../services/notificationService');

const q = (sql, params = []) => (db.q ? db.q(sql, params) : new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r))));

async function requestTransition(tenantId, entityType, entityId, toState, userId, role, meta = {}) {
  // Get current state from entity table
  const currentState = await getCurrentState(entityType, entityId, tenantId);
  if (!currentState) throw new Error('Entity not found');

  // Check if transition is allowed
  if (!canTransition(entityType, currentState, toState, role)) {
    throw new Error(`Transition from ${currentState} to ${toState} not allowed for role ${role}`);
  }

  // Check if approval is required
  if (requiresApproval(entityType, currentState, toState)) {
    // Create approval request
    const requestId = await createRequest(tenantId, entityType, entityId, currentState, toState, userId, meta.reason);
    await workflowLogs.logAction(requestId, tenantId, entityType, entityId, 'APPROVAL_REQUEST', currentState, toState, userId, meta);
    // Notify approvers
    await notifyApprovers(tenantId, entityType, entityId, toState);
    return { requestId, status: 'PENDING_APPROVAL' };
  } else {
    // Apply directly
    await applyTransition(entityType, entityId, toState, tenantId);
    await workflowLogs.logAction(null, tenantId, entityType, entityId, 'DIRECT_TRANSITION', currentState, toState, userId, meta);
    return { status: 'APPLIED' };
  }
}

async function approveRequest(requestId, approved, userId, role, reason) {
  const request = await getRequest(requestId);
  if (!request) throw new Error('Request not found');

  // Fetch entity details (Task/Project) for a better response/notification
  const entityDetails = await q(
    request.entity_type === 'TASK' 
    ? 'SELECT title as name, public_id FROM tasks WHERE id = ?' 
    : 'SELECT name, public_id FROM projects WHERE id = ?',
    [request.entity_id]
  );
  const entityName = entityDetails[0]?.name || 'Unknown';
  const entityPublicId = entityDetails[0]?.public_id || request.entity_id;

  // Fetch approver/manager details
  const approverDetails = await q('SELECT name FROM users WHERE _id = ?', [userId]);
  const approverName = approverDetails[0]?.name || 'Manager';

  if (approved) {
    // Manager approved -> move to the target state (e.g., Completed)
    // For Tasks, also record who approved it
    if (request.entity_type === 'TASK') {
      await q('UPDATE tasks SET status = ?, approved_by = ?, approved_at = NOW(), completed_at = NOW(), rejection_reason = NULL, rejected_by = NULL, rejected_at = NULL WHERE id = ?', [request.to_state, userId, request.entity_id]);
    } else {
      await applyTransition(request.entity_type, request.entity_id, request.to_state);
    }

    await updateRequest(requestId, 'APPROVED', userId);
    await workflowLogs.logAction(requestId, request.tenant_id, request.entity_type, request.entity_id, 'APPROVED', request.from_state, request.to_state, userId, { reason });
    
    // Clear any previous rejection info since it's now approved
    if (request.entity_type === 'TASK') {
       await q('UPDATE tasks SET rejection_reason = NULL, rejected_by = NULL, rejected_at = NULL WHERE id = ?', [request.entity_id]);
    }

    // Notify requester of approval
    if (NotificationService && NotificationService.createAndSend) {
      await NotificationService.createAndSend(
        [request.requested_by],
        'Workflow Approved',
        `Your request for task "${entityName}" to be marked as Completed has been approved by ${approverName}.`,
        'WORKFLOW_APPROVED',
        request.entity_type,
        entityPublicId
      );
    }
    
    return { 
      status: 'APPROVED',
      entityState: request.to_state,
      message: `Task "${entityName}" has been successfully approved and marked as ${request.to_state} by ${approverName}.`,
      details: {
        taskId: entityPublicId,
        title: entityName,
        approvedBy: approverName,
        approvedById: userId,
        timestamp: new Date()
      }
    };
  } else {
    // Manager rejected -> move back to the previous state (e.g., In Progress)
    const normalizedReason = typeof reason === 'string' ? reason : (reason?.reason || JSON.stringify(reason) || 'No reason provided');
    console.log(`[DEBUG] Rejecting request ${requestId}. Reason: ${normalizedReason}`);

    if (request.entity_type === 'TASK') {
      await q('UPDATE tasks SET status = ?, rejected_by = ?, rejected_at = NOW(), rejection_reason = ? WHERE id = ?', [request.from_state, userId, normalizedReason, request.entity_id]);
    } else {
      await applyTransition(request.entity_type, request.entity_id, request.from_state);
    }

    // Also update the request record itself with the rejection reason
    await q('UPDATE workflow_requests SET status = "REJECTED", approved_by = ?, rejection_reason = ?, rejected_at = NOW(), updated_at = NOW() WHERE id = ?', [userId, normalizedReason, requestId]);

    await workflowLogs.logAction(requestId, request.tenant_id, request.entity_type, request.entity_id, 'REJECTED', request.from_state, request.from_state, userId, { 
      reason: normalizedReason, 
      rework: true,
      rejected_to_state: request.from_state 
    });

    // Notify requester of rejection/rework
    if (NotificationService && NotificationService.createAndSend) {
      await NotificationService.createAndSend(
        [request.requested_by],
        'Rework Required',
        `Your completion request for "${entityName}" was rejected by ${approverName}. Reason: ${normalizedReason}. Please perform necessary rework.`,
        'WORKFLOW_REJECTED',
        request.entity_type,
        entityPublicId
      );
    }

    return { 
      status: 'REJECTED',
      entityState: request.from_state,
      message: `Request for "${entityName}" rejected by ${approverName}. Task moved back to ${request.from_state} for rework. Reason: ${normalizedReason}`,
      details: {
        taskId: entityPublicId,
        title: entityName,
        rejectedBy: approverName,
        reason: normalizedReason,
        timestamp: new Date()
      }
    };
  }
}

async function getRequests(tenantId, role, status = 'PENDING') {
  console.log(`[DEBUG] getRequests: tenantId=${tenantId}, role=${role}, status=${status}`);
  
  let statusFilter = 'wr.status = ?';
  let queryParams = [tenantId, status];

  if (status === 'all') {
    statusFilter = '1=1';
    queryParams = [tenantId];
  } else if (status.includes(',')) {
    const statuses = status.split(',').map(s => s.trim());
    statusFilter = `wr.status IN (${statuses.map(() => '?').join(',')})`;
    queryParams = [tenantId, ...statuses];
  }

  const query = `
    SELECT wr.*, 
           u.name as requester_name,
           u.name as requesterName,
           wr.id as requestId,
           wr.entity_type as entityType,
           wr.entity_id as entityId,
           wr.from_state as fromState,
           wr.to_state as toState,
           wr.requested_by as requestedById,
           CASE 
             WHEN wr.entity_type = 'TASK' THEN t.title
             WHEN wr.entity_type = 'PROJECT' THEN p.name
           END as entity_name,
           CASE 
             WHEN wr.entity_type = 'TASK' THEN t.title
             WHEN wr.entity_type = 'PROJECT' THEN p.name
           END as entityName,
           CASE 
             WHEN wr.entity_type = 'TASK' THEN t.public_id
             WHEN wr.entity_type = 'PROJECT' THEN p.public_id
           END as entity_public_id,
           CASE 
             WHEN wr.entity_type = 'TASK' THEN t.public_id
             WHEN wr.entity_type = 'PROJECT' THEN p.public_id
           END as entityPublicId,
           CASE
             WHEN wr.entity_type = 'TASK' THEN t.status
             WHEN wr.entity_type = 'PROJECT' THEN p.status
           END as currentStatus,
           rj.name as rejectedByName,
           ap.name as approvedByName
    FROM workflow_requests wr
    LEFT JOIN users u ON wr.requested_by = u._id
    LEFT JOIN users rj ON wr.approved_by = rj._id AND wr.status = 'REJECTED'
    LEFT JOIN users ap ON wr.approved_by = ap._id AND wr.status = 'APPROVED'
    LEFT JOIN tasks t ON wr.entity_type = 'TASK' AND wr.entity_id = t.id
    LEFT JOIN projects p ON wr.entity_type = 'PROJECT' AND wr.entity_id = p.id
    WHERE (wr.tenant_id = ? OR wr.tenant_id = 1) AND ${statusFilter} 
    ORDER BY wr.created_at DESC
  `;
  const rows = await q(query, queryParams);
  console.log(`[DEBUG] Found ${rows.length} requests for status ${status}`);
  return rows;
}

async function getHistory(tenantId, entityType, entityId) {
  return await workflowLogs.getHistory(tenantId, entityType, entityId);
}

async function getCurrentState(entityType, entityId, tenantId) {
  const table = entityType === 'TASK' ? 'tasks' : 'projects';
  // For tasks, tenant_id may not exist, so don't filter by tenant
  const tenantFilter = entityType === 'TASK' ? '' : ' AND tenant_id = ?';
  const params = entityType === 'TASK' ? [entityId] : [entityId, tenantId];
  const rows = await q(`SELECT status FROM ${table} WHERE id = ?${tenantFilter}`, params);
  return rows && rows[0] ? rows[0].status : null;
}

async function applyTransition(entityType, entityId, toState, tenantId) {
  const table = entityType === 'TASK' ? 'tasks' : 'projects';
  
  if (entityType === 'TASK') {
    // If moving AWAY from Completed or reviewing, clear approval metadata
    // If moving TO Completed, it's usually handled in approveRequest, but let's be safe
    let extraFields = '';
    if (toState !== 'Completed') {
      extraFields = ', approved_by = NULL, approved_at = NULL, completed_at = NULL';
    }
    await q(`UPDATE tasks SET status = ?${extraFields} WHERE id = ?`, [toState, entityId]);
  } else {
    const tenantFilter = ' AND tenant_id = ?';
    await q(`UPDATE projects SET status = ? WHERE id = ?${tenantFilter}`, [toState, entityId, tenantId]);
  }
}

async function createRequest(tenantId, entityType, entityId, fromState, toState, userId, reason) {
  const res = await q(
    'INSERT INTO workflow_requests (tenant_id, entity_type, entity_id, from_state, to_state, requested_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [tenantId, entityType, entityId, fromState, toState, userId, reason]
  );
  return res.insertId;
}

async function updateRequest(requestId, status, approvedBy) {
  await q(
    'UPDATE workflow_requests SET status = ?, approved_by = ?, updated_at = NOW() WHERE id = ?',
    [status, approvedBy, requestId]
  );
}

async function getRequest(requestId) {
  const rows = await q('SELECT * FROM workflow_requests WHERE id = ?', [requestId]);
  return rows && rows[0];
}

async function notifyApprovers(tenantId, entityType, entityId, toState) {
  // Logic to notify MANAGERS or ADMINS based on entityType and toState
  const roles = ['MANAGER', 'ADMIN'];
  if (NotificationService && typeof NotificationService.createAndSendToRoles === 'function') {
    await NotificationService.createAndSendToRoles(
      roles,
      'Workflow Approval Required',
      `Approval needed for ${entityType} ${entityId} to ${toState}`,
      'WORKFLOW_APPROVAL',
      entityType,
      entityId,
      tenantId
    );
  }
}

module.exports = {
  requestTransition,
  approveRequest,
  getRequests,
  getHistory
};
