// src/workflow/workflowService.js
const db = require('../db');
const NotificationService = require('../services/notificationService');
let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../logger'); } catch (e2) { logger = console; } }

// Promisified db.query
const q = (sql, params = [], connection = db) => new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
        if (err) return reject(err);
        resolve(results);
    });
});

// =========================================
// DATABASE TRANSACTION HELPERS
// =========================================
const beginTransaction = () => new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
        if (err) return reject(err);
        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return reject(err);
            }
            resolve(connection);
        });
    });
});

const commitTransaction = (connection) => new Promise((resolve, reject) => {
    connection.commit(err => {
        if (err) return rollbackTransaction(connection).then(() => reject(err));
        connection.release();
        resolve();
    });
});

const rollbackTransaction = (connection) => new Promise((resolve, reject) => {
    connection.rollback(() => {
        connection.release();
        resolve(); // Resolve even on rollback to not throw another error
    });
});

// Simple cached column existence checker
const _columnCache = {};
const hasColumn = async (table, column) => {
    const key = `${table}::${column}`;
    if (_columnCache[key] !== undefined) return _columnCache[key];
    try {
        const rows = await q(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        `, [table, column]);
        _columnCache[key] = Array.isArray(rows) && rows.length > 0;
        return _columnCache[key];
    } catch (e) {
        _columnCache[key] = false;
        return false;
    }
};

/**
 * Finds the correct approver role for a given transition.
 * @param {number} tenantId - The tenant ID.
 * @param {string} entityType - e.g., 'TASK' or 'PROJECT'.
 * @param {string} fromState - The starting state.
 * @param {string} toState - The target state.
 * @returns {string} The role required for approval (e.g., 'MANAGER', 'ADMIN').
 */
const getApproverRole = async (tenantId, entityType, fromState, toState) => {
    // fall back to sensible defaults: TASK reviews need MANAGER, PROJECT closures need ADMIN.
    try {
        const sql = `
            SELECT approver_role 
            FROM workflow_definitions 
            WHERE tenant_id = ? AND entity_type = ? AND from_state = ? AND to_state = ?
        `;
        const results = await q(sql, [tenantId, entityType, fromState, toState]);
        if (results && results.length && results[0].approver_role) {
            return results[0].approver_role;
        }
    } catch (err) {
        // If the column doesn't exist or query fails, we'll fallback to defaults below
        logger.warn('[WARN] getApproverRole: fallback due to error querying workflow_definitions:', err && err.message);
    }

    // Fallback defaults
    if (entityType === 'TASK' && fromState === 'IN_PROGRESS' && (toState === 'REVIEW' || toState === 'COMPLETED')) {
        return 'Manager';
    }
    if (entityType === 'PROJECT' && fromState === 'ACTIVE' && toState === 'CLOSED') {
        return 'Admin';
    }

    // Last resort
    return 'Manager';
};

/**
 * Handles an employee's request to transition a task or other entity.
 * For a task moving from IN_PROGRESS to COMPLETED, this creates a PENDING manager approval.
 */
const requestTransition = async ({ tenantId, entityType, entityId, toState, userId, role, projectId, meta }) => {
    if (entityType === 'TASK' && toState === 'COMPLETED') {
        const fromState = 'IN_PROGRESS';
        const approverRole = await getApproverRole(tenantId, entityType, fromState, 'REVIEW');

        const connection = await beginTransaction();
        try {
            let internalId = entityId;
            if (entityType === 'TASK') {
                const rows = await q('SELECT id FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [entityId, entityId]);
                if (rows && rows.length > 0) {
                    internalId = rows[0].id;
                }
            }

            // 1. Update task status to 'REVIEW'
            if (await hasColumn('tasks', 'tenant_id')) {
                const updateSql = 'UPDATE tasks SET status = ? WHERE id = ? AND tenant_id = ?';
                await q(updateSql, ['REVIEW', internalId, tenantId], connection);
            } else {
                const updateSql = 'UPDATE tasks SET status = ? WHERE id = ?';
                await q(updateSql, ['REVIEW', internalId], connection);
            }

            const insertRequestSql = `
                INSERT INTO workflow_requests 
                (tenant_id, entity_type, entity_id, requested_by_id, approver_role, status, from_state, to_state) 
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `;
            const requestResult = await q(insertRequestSql, [tenantId, entityType, internalId, userId, approverRole, fromState, toState], connection);
            const requestId = requestResult.insertId;

            // 3. Log the initial request event (store details as JSON in `details`)
            const logSql = `
                INSERT INTO workflow_logs (request_id, tenant_id, entity_type, entity_id, action, from_state, to_state, user_id, details) 
                VALUES (?, ?, ?, ?, 'REQUEST', ?, ?, ?, ?)
            `;
            await q(logSql, [
                requestId,
                tenantId,
                entityType,
                internalId,
                fromState,
                toState,
                userId,
                JSON.stringify({ reason: meta?.reason || 'Task submitted for review' })
            ], connection);

            await commitTransaction(connection);
            
            // TODO: Notify manager via NotificationService
            
            return {
                message: "Task submitted for review. Awaiting manager approval.",
                requestId: requestId,
                taskStatus: 'REVIEW'
            };

        } catch (error) {
            await rollbackTransaction(connection);
            throw error;
        }
    }
    throw new Error("This transition is not supported or requires a different flow.");
};

/**
 * Manager requests a project closure. Verifies all tasks are completed and creates a workflow request for ADMIN.
 */
const requestProjectClosure = async ({ tenantId, projectId, reason, userId }) => {
    if (!projectId) throw new Error('projectId is required');

    // 1. Verify project exists and is ACTIVE. Resolve from ID or public_id.
    const prow = await q('SELECT id, status FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
    if (!prow || prow.length === 0) throw new Error('Project not found');
    const p = prow[0];
    const internalProjectId = p.id;
    if (!p.status || String(p.status).toUpperCase() !== 'ACTIVE') throw new Error('Project must be ACTIVE to request closure');

    // 2. Verify all tasks under project are COMPLETED
    let results;
    if (await hasColumn('tasks', 'tenant_id')) {
        results = await q(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed FROM tasks WHERE project_id = ? AND tenant_id = ?`, [internalProjectId, tenantId]);
    } else {
        results = await q(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed FROM tasks WHERE project_id = ?`, [internalProjectId]);
    }
    const { total, completed } = results[0] || { total: 0, completed: 0 };
    if (total === 0) throw new Error('Project has no tasks');
    if (total !== completed) throw new Error('All tasks must be COMPLETED before requesting project closure');

    // 3. Create workflow request and set project status to PENDING_FINAL_APPROVAL
    const connection = await beginTransaction();
    try {
        // update project status
        if (await hasColumn('projects', 'tenant_id')) {
            await q('UPDATE projects SET status = ? WHERE id = ? AND tenant_id = ?', ['PENDING_FINAL_APPROVAL', internalProjectId, tenantId], connection);
        } else {
            await q('UPDATE projects SET status = ? WHERE id = ?', ['PENDING_FINAL_APPROVAL', internalProjectId], connection);
        }

        // When a project closure is requested, lock the project (and its tasks) so no further edits happen
        // while final approval is pending.
        if (await hasColumn('projects', 'is_locked')) {
            if (await hasColumn('projects', 'tenant_id')) {
                await q('UPDATE projects SET is_locked = 1 WHERE id = ? AND tenant_id = ?', [internalProjectId, tenantId], connection);
            } else {
                await q('UPDATE projects SET is_locked = 1 WHERE id = ?', [internalProjectId], connection);
            }
        }
        if (await hasColumn('tasks', 'is_locked')) {
            if (await hasColumn('tasks', 'tenant_id')) {
                await q('UPDATE tasks SET is_locked = 1 WHERE project_id = ? AND tenant_id = ?', [internalProjectId, tenantId], connection);
            } else {
                await q('UPDATE tasks SET is_locked = 1 WHERE project_id = ?', [internalProjectId], connection);
            }
        }

        const approverRole = await getApproverRole(tenantId, 'PROJECT', 'ACTIVE', 'CLOSED');
        const insertRequestSql = `
            INSERT INTO workflow_requests (tenant_id, entity_type, entity_id, project_id, requested_by_id, approver_role, status, from_state, to_state, reason)
            VALUES (?, 'PROJECT', ?, ?, ?, ?, 'PENDING', 'ACTIVE', 'CLOSED', ?)
        `;
        const rr = await q(insertRequestSql, [tenantId, internalProjectId, internalProjectId, userId, approverRole, reason || null], connection);
        const requestId = rr.insertId;

        const logSql = `
            INSERT INTO workflow_logs (request_id, tenant_id, entity_type, entity_id, action, from_state, to_state, user_id, details)
            VALUES (?, ?, 'PROJECT', ?, 'REQUEST', 'ACTIVE', 'CLOSED', ?, ?)
        `;
        await q(logSql, [requestId, tenantId, internalProjectId, userId, JSON.stringify({ reason: reason || 'Manager requested project closure' })], connection);

        await commitTransaction(connection);

        // Notify Admins (best-effort)
        try {
            if (NotificationService && typeof NotificationService.createAndSendToRoles === 'function') {
                await NotificationService.createAndSendToRoles(['Admin'], 'Project Closure Requested', `Project ${internalProjectId} submitted for final approval.`, 'PROJECT_CLOSE_REQUEST', 'project', internalProjectId, tenantId);
            }
        } catch (nerr) { logger.warn('[WARN] notify admins failed:', nerr && nerr.message); }

        return { projectId: internalProjectId, projectStatus: 'PENDING_FINAL_APPROVAL', requestId };
    } catch (e) {
        await rollbackTransaction(connection);
        throw e;
    }
};

/**
 * Processes an approval or rejection action from a Manager or Admin.
 * This is a transactional operation that updates the entity, the request, and logs the event.
 */
const processApproval = async ({ tenantId, requestId, action, reason, userId, userRole }) => {
    const connection = await beginTransaction();
    try {
        // 1. Get the original request
        const getRequestSql = 'SELECT * FROM workflow_requests WHERE id = ? AND tenant_id = ?';
        const requests = await q(getRequestSql, [requestId, tenantId], connection);
        if (requests.length === 0) throw new Error("Workflow request not found.");
        
        const req = requests[0];
        if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}.`);
        const approverRole = (req.approver_role || '').toUpperCase();
        const actingRole = (userRole || '').toUpperCase();
        if (approverRole) {
            if (approverRole !== actingRole && actingRole !== 'ADMIN') {
                throw new Error(`You do not have permission to ${action.toLowerCase()} this request. Expected role: ${approverRole}`);
            }
        } else {
            // If approver_role was not set in the request row, allow Manager/MANAGER or Admin/ADMIN to act.
            if (actingRole !== 'MANAGER' && actingRole !== 'ADMIN') {
                throw new Error(`You do not have permission to ${action.toLowerCase()} this request.`);
            }
        }

        const { entity_type, entity_id, from_state, to_state } = req;
        // Resolve project_id dynamically when needed (workflow_requests table may not store it)
        let project_id = null;
        if (entity_type === 'TASK') {
            const trows = await q('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [entity_id], connection);
            if (trows && trows.length) project_id = trows[0].project_id;
        } else if (entity_type === 'PROJECT') {
            project_id = entity_id;
        }
        const newStatus = action === 'APPROVE' ? to_state : from_state;
        const requestStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

        // 2. Update the entity's status (task or project)
        const table = entity_type.toLowerCase() + 's'; // tasks or projects
        if (await hasColumn(table, 'tenant_id')) {
            const updateEntitySql = `UPDATE ${table} SET status = ? WHERE id = ? AND tenant_id = ?`;
            await q(updateEntitySql, [newStatus, entity_id, tenantId], connection);
            if (entity_type === 'PROJECT' && action === 'APPROVE') {
                if (await hasColumn('projects', 'is_locked')) {
                    await q('UPDATE projects SET is_locked = 1 WHERE id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
                if (await hasColumn('projects', 'closed_at')) {
                    await q('UPDATE projects SET closed_at = NOW() WHERE id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
                if (await hasColumn('tasks', 'is_locked')) {
                    await q('UPDATE tasks SET is_locked = 1 WHERE project_id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
            }
            if (entity_type === 'PROJECT' && action === 'REJECT') {
                if (await hasColumn('projects', 'is_locked')) {
                    await q('UPDATE projects SET is_locked = 0 WHERE id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
                if (await hasColumn('projects', 'closed_at')) {
                    await q('UPDATE projects SET closed_at = NULL WHERE id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
                if (await hasColumn('tasks', 'is_locked')) {
                    await q('UPDATE tasks SET is_locked = 0 WHERE project_id = ? AND tenant_id = ?', [entity_id, tenantId], connection);
                }
            }
        } else {
            const updateEntitySql = `UPDATE ${table} SET status = ? WHERE id = ?`;
            await q(updateEntitySql, [newStatus, entity_id], connection);
            if (entity_type === 'PROJECT' && action === 'APPROVE') {
                if (await hasColumn('projects', 'is_locked')) {
                    await q('UPDATE projects SET is_locked = 1 WHERE id = ?', [entity_id], connection);
                }
                if (await hasColumn('projects', 'closed_at')) {
                    await q('UPDATE projects SET closed_at = NOW() WHERE id = ?', [entity_id], connection);
                }
                if (await hasColumn('tasks', 'is_locked')) {
                    await q('UPDATE tasks SET is_locked = 1 WHERE project_id = ?', [entity_id], connection);
                }
            }
            if (entity_type === 'PROJECT' && action === 'REJECT') {
                if (await hasColumn('projects', 'is_locked')) {
                    await q('UPDATE projects SET is_locked = 0 WHERE id = ?', [entity_id], connection);
                }
                if (await hasColumn('projects', 'closed_at')) {
                    await q('UPDATE projects SET closed_at = NULL WHERE id = ?', [entity_id], connection);
                }
                if (await hasColumn('tasks', 'is_locked')) {
                    await q('UPDATE tasks SET is_locked = 0 WHERE project_id = ?', [entity_id], connection);
                }
            }
        }

        // 3. Update the workflow request itself
        let processedColumn = null;
        if (await hasColumn('workflow_requests', 'processed_by_id')) processedColumn = 'processed_by_id';
        else if (await hasColumn('workflow_requests', 'approved_by')) processedColumn = 'approved_by';
        else if (await hasColumn('workflow_requests', 'approved_by_id')) processedColumn = 'approved_by_id';

        if (processedColumn) {
            const updateRequestSql = `UPDATE workflow_requests SET status = ?, ${processedColumn} = ? WHERE id = ?`;
            await q(updateRequestSql, [requestStatus, userId, requestId], connection);
        } else {
            const updateRequestSql = `UPDATE workflow_requests SET status = ? WHERE id = ?`;
            await q(updateRequestSql, [requestStatus, requestId], connection);
        }

        // 4. Log the approval/rejection event (store details as JSON in `details`)
        const logSql = `
            INSERT INTO workflow_logs (request_id, tenant_id, entity_type, entity_id, action, from_state, to_state, user_id, details) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await q(logSql, [
            requestId,
            tenantId,
            entity_type,
            entity_id,
            action,
            from_state,
            to_state,
            userId,
            JSON.stringify({ reason: reason || `${action}D` })
        ], connection);

        await commitTransaction(connection);

        if (entity_type === 'TASK' && action === 'APPROVE') {
            await checkAndTriggerProjectApproval(tenantId, project_id, userId);
        }
        
        // TODO: Notify original requestor
        const actionVerb = action === 'APPROVE' ? 'approved' : 'rejected';
        return {
            message: `${entity_type} request #${requestId} has been ${actionVerb}.`,
            newStatus: newStatus
        };

    } catch (error) {
        await rollbackTransaction(connection);
        throw error;
    }
};

/**
 * Checks if all tasks in a project are COMPLETED. If so, triggers a final approval request for the Admin.
 */
const checkAndTriggerProjectApproval = async (tenantId, projectId, systemUserId) => {
    if (!projectId) return;

    let results;
    if (await hasColumn('tasks', 'tenant_id')) {
        const sql = `
            SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
            FROM tasks
            WHERE project_id = ? AND tenant_id = ?
        `;
        results = await q(sql, [projectId, tenantId]);
    } else {
        const sql = `
            SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
            FROM tasks
            WHERE project_id = ?
        `;
        results = await q(sql, [projectId]);
    }
    const { total, completed } = results[0];

    if (total > 0 && total === completed) {
        const connection = await beginTransaction();
        try {
            // 1. Update project status
            await q('UPDATE projects SET status = ? WHERE id = ?', ['PENDING_FINAL_APPROVAL', projectId], connection);

            // Lock project/tasks while pending final approval
            if (await hasColumn('projects', 'is_locked')) {
                await q('UPDATE projects SET is_locked = 1 WHERE id = ?', [projectId], connection);
            }
            if (await hasColumn('tasks', 'is_locked')) {
                await q('UPDATE tasks SET is_locked = 1 WHERE project_id = ?', [projectId], connection);
            }

            const approverRole = await getApproverRole(tenantId, 'PROJECT', 'ACTIVE', 'CLOSED');
            const insertRequestSql = `
                INSERT INTO workflow_requests 
                (tenant_id, entity_type, entity_id, requested_by_id, approver_role, status, from_state, to_state) 
                VALUES (?, 'PROJECT', ?, ?, ?, 'PENDING', 'ACTIVE', 'CLOSED')
            `;
            const requestResult = await q(insertRequestSql, [tenantId, projectId, systemUserId, approverRole], connection);
            const requestId = requestResult.insertId;

            // 3. Log the system event
            const logSql = `
                INSERT INTO workflow_logs (request_id, tenant_id, entity_type, entity_id, action, from_state, to_state, user_id, details) 
                VALUES (?, ?, 'PROJECT', ?, 'REQUEST', 'ACTIVE', 'CLOSED', ?, ?)
            `;
            await q(logSql, [
                requestId,
                tenantId,
                projectId,
                systemUserId,
                JSON.stringify({ message: 'All tasks completed. Project submitted for final closure.' })
            ], connection);

            await commitTransaction(connection);
            logger.info(`[INFO] Project ${projectId} submitted for final admin approval.`);
            // TODO: Notify Admin
            } catch (error) {
            await rollbackTransaction(connection);
            logger.error(`[ERROR] Failed to trigger project approval for project ${projectId}:`, error);
        }
    }
};

/**
 * Retrieves a list of workflow requests based on role and status.
 * Enrich with deep productivity data for project closure requests.
 */
const getRequests = async ({ tenantId, role, status }) => {
    // workflow_requests may store the processor in different columns across schemas
    let processedColumn = null;
    if (await hasColumn('workflow_requests', 'processed_by_id')) processedColumn = 'processed_by_id';
    else if (await hasColumn('workflow_requests', 'approved_by_id')) processedColumn = 'approved_by_id';
    else if (await hasColumn('workflow_requests', 'approved_by')) processedColumn = 'approved_by';

    const processedSelect = processedColumn
        ? `, u2._id as processed_by_id, u2.name as processed_by_name, u2.email as processed_by_email, u2.role as processed_by_role`
        : `, NULL as processed_by_id, NULL as processed_by_name, NULL as processed_by_email, NULL as processed_by_role`;

    const processedJoin = processedColumn ? `LEFT JOIN users u2 ON wr.${processedColumn} = u2._id` : '';

    let sql = `
        SELECT wr.*, 
               u.name as requested_by_name, 
               u.email as requested_by_email,
               u.role as requested_by_role,
               p.name as project_name, 
               p.public_id as project_public_id,
               p.status as project_status,
               p.is_locked as project_is_locked,
               t.title as task_name,
               t.status as task_status,
               t.is_locked as task_is_locked,
               c.name as client_name,
               c.company as client_company,
               c.email as client_email
               ${processedSelect}
        FROM workflow_requests wr
        LEFT JOIN users u ON wr.requested_by_id = u._id
        ${processedJoin}
        LEFT JOIN tasks t ON wr.entity_type = 'TASK' AND wr.entity_id = t.id
        LEFT JOIN projects p ON (wr.entity_type = 'PROJECT' AND wr.entity_id = p.id) OR (wr.entity_type = 'TASK' AND t.project_id = p.id)
        LEFT JOIN clientss c ON p.client_id = c.id
        WHERE wr.tenant_id = ? AND wr.approver_role = ?
    `;
    const params = [tenantId, role];

    if (status && status.toLowerCase() !== 'all') {
        sql += ' AND wr.status = ?';
        params.push(status);
    }
    
    sql += ' ORDER BY wr.created_at DESC';

    const requests = await q(sql, params);

    for (const req of requests) {
        // 1. Status acknowledgement message
        const actionVerb = req.status === 'APPROVED' ? 'approved' : (req.status === 'REJECTED' ? 'rejected' : 'pending approval');
        req.message = `${req.entity_type} request #${req.id} is ${actionVerb}.`;
        
        if (req.status !== 'PENDING') {
            req.newStatus = req.status === 'APPROVED' ? req.to_state : req.from_state;
        }

        // 2. Determine project context
        const projectId = req.entity_type === 'PROJECT' ? req.entity_id : (req.project_id || (req.entity_type === 'TASK' ? (await q('SELECT project_id FROM tasks WHERE id = ?', [req.entity_id]))[0]?.project_id : null));
        
        // 3. Add Lock & Restriction Info
        const toStateUpper = String(req.to_state || '').toUpperCase();
        const projectStatusUpper = String(req.project_status || '').toUpperCase();

        // Treat "PENDING_FINAL_APPROVAL" (or any close-request) as closed/locked for all downstream behavior.
        const isPendingClosure = (toStateUpper === 'CLOSED') && projectStatusUpper === 'PENDING_FINAL_APPROVAL';
        const isProjectClosed = projectStatusUpper === 'CLOSED' || req.project_is_locked === 1 || isPendingClosure;

        // Present an effective project status for clients that only understand CLOSED/ACTIVE.
        if (isPendingClosure && projectStatusUpper !== 'CLOSED') {
            req.project_status_raw = req.project_status;
            req.project_status = 'CLOSED';
        }

        req.project_effective_status = (isProjectClosed ? 'CLOSED' : (req.project_status || 'ACTIVE'));
        req.can_create_tasks = !isProjectClosed;
        req.can_send_request = !isProjectClosed && (req.entity_type !== 'TASK' || req.task_is_locked !== 1);
        req.project_closed = !!isProjectClosed;

        // Normalize requested/processed user objects (avoid nulls in UI)
        if (req.requested_by_id) {
            req.requested_by = {
                id: req.requested_by_id,
                name: req.requested_by_name || null,
                email: req.requested_by_email || null,
                role: req.requested_by_role || null
            };
        }
        if (req.processed_by_id) {
            req.approved_by = {
                id: req.processed_by_id,
                name: req.processed_by_name || null,
                email: req.processed_by_email || null,
                role: req.processed_by_role || null
            };
        }

        if (projectId) {
            req.client_details = {
                name: req.client_name,
                company: req.client_company,
                email: req.client_email
            };

            // 4. Fetch Tasks with Productivity and Assignees
            const tasksSql = `
                SELECT t.id, t.title, t.status, t.total_duration, t.priority, t.public_id
                FROM tasks t
                WHERE t.project_id = ?
            `;
            const tasks = await q(tasksSql, [projectId]);

            let totalProjectSeconds = 0;
            for (const task of tasks) {
                totalProjectSeconds += (task.total_duration || 0);

                // Fetch Assignees
                const assigneesSql = `
                    SELECT u.name, u.email, u.role
                    FROM taskassignments ta
                    JOIN users u ON ta.user_Id = u._id
                    WHERE ta.task_Id = ?
                `;
                task.assignees = await q(assigneesSql, [task.id]);

                // Fetch Checklists (Subtasks)
                const subtasksSql = `
                    SELECT title, status, due_date
                    FROM subtasks
                    WHERE task_Id = ?
                `;
                task.checklists = await q(subtasksSql, [task.id]);

                // Fetch Task Attachments
                const docSql = `
                    SELECT fileName, filePath, mimeType, fileSize
                    FROM documents
                    WHERE entityType = 'TASK' AND (entityId = ? OR entityId = ?)
                `;
                task.attachments = await q(docSql, [task.id.toString(), task.public_id]);
            }

            req.tasks = tasks;
            req.total_project_hours = (totalProjectSeconds / 3600).toFixed(2);
            req.productivity_score = tasks.length > 0
                ? (tasks.filter(t => String(t.status || '').toUpperCase() === 'COMPLETED').length / tasks.length * 100).toFixed(0) + '%'
                : '0%';

            // 5. Project Level Attachments
            const projectDocSql = `
                SELECT fileName, filePath, mimeType, fileSize
                FROM documents
                WHERE entityType = 'PROJECT' AND (entityId = ? OR entityId = ?)
            `;
            req.attachments = await q(projectDocSql, [projectId.toString(), req.project_public_id]);
        }
    }

    return requests;
};

/**
 * Retrieves the full history for a given entity (task or project).
 */
const getHistory = async (tenantId, entityType, entityId) => {
    const sql = `
        SELECT wl.*, u.name as actor_name
        FROM workflow_logs wl
        JOIN workflow_requests wr ON wl.request_id = wr.id
        JOIN users u ON wl.actor_id = u._id
        WHERE wr.tenant_id = ? AND wr.entity_type = ? AND wr.entity_id = ?
        ORDER BY wl.created_at ASC
    `;
    return await q(sql, [tenantId, entityType, entityId]);
};


module.exports = {
    requestTransition,
    requestProjectClosure,
    processApproval,
    checkAndTriggerProjectApproval,
    getRequests,
    getHistory,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};
