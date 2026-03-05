
const db = require('../db');
const NotificationService = require('../services/notificationService');
let logger;
try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../logger'); } catch (e2) { logger = console; } }

const q = (sql, params = [], connection = db) => new Promise((resolve, reject) => {
    connection.query(sql, params, (err, results) => {
        if (err) return reject(err);
        resolve(results);
    });
});



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


const getApproverRole = async (tenantId, entityType, fromState, toState) => {

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

        logger.warn('[WARN] getApproverRole: fallback due to error querying workflow_definitions:', err && err.message);
    }

    if (entityType === 'TASK' && fromState === 'IN_PROGRESS' && (toState === 'REVIEW' || toState === 'COMPLETED')) {
        return 'Manager';
    }
    if (entityType === 'PROJECT' && fromState === 'ACTIVE' && toState === 'CLOSED') {
        return 'Admin';
    }

    return 'Manager';
};


const requestTransition = async ({ tenantId, entityType, entityId, toState, userId, role, projectId, meta }) => {
    if (entityType === 'TASK' && toState === 'COMPLETED') {
        const fromState = 'IN_PROGRESS';
        const approverRole = await getApproverRole(tenantId, entityType, fromState, 'REVIEW');

        const connection = await beginTransaction();
        try {
            let internalId = entityId;
            let taskProjectId = null;
            let assignedManagerId = null;
            
            if (entityType === 'TASK') {
                const rows = await q('SELECT id, project_id FROM tasks WHERE id = ? OR public_id = ? LIMIT 1', [entityId, entityId]);
                if (rows && rows.length > 0) {
                    internalId = rows[0].id;
                    taskProjectId = rows[0].project_id;
                }
            }

            if (taskProjectId) {
                const projectRows = await q('SELECT project_manager_id FROM projects WHERE id = ? LIMIT 1', [taskProjectId]);
                if (projectRows && projectRows.length > 0 && projectRows[0].project_manager_id) {
                    assignedManagerId = projectRows[0].project_manager_id;
                }
            }

            const normalizeState = (s) => {
                if (!s) return s;
                const up = String(s).toUpperCase().replace(/\s+/g, ' ').replace(/_/g, ' ').trim();
                if (up === 'IN PROGRESS' || up === 'INPROGRESS') return 'In Progress';
                if (up === 'REVIEW') return 'Review';
                if (up === 'COMPLETED') return 'Completed';
                if (up === 'PENDING') return 'Pending';
                if (up === 'ON HOLD' || up === 'ON_HOLD') return 'On Hold';
                return s;
            };

            const reviewState = normalizeState('REVIEW');
            if (await hasColumn('tasks', 'tenant_id')) {
                const updateSql = 'UPDATE tasks SET status = ? WHERE id = ? AND tenant_id = ?';
                await q(updateSql, [reviewState, internalId, tenantId], connection);
            } else {
                const updateSql = 'UPDATE tasks SET status = ? WHERE id = ?';
                await q(updateSql, [reviewState, internalId], connection);
            }

            const hasApproverId = await hasColumn('workflow_requests', 'approver_id');
            if (!hasApproverId) {
                try {
                    await q('ALTER TABLE workflow_requests ADD COLUMN approver_id INT NULL AFTER approver_role', [], connection);
                    logger.info('Added approver_id column to workflow_requests table');
                } catch (e) {
                    logger.warn('Failed to add approver_id column (may already exist): ' + e.message);
                }
            }

            const insertRequestSql = assignedManagerId && hasApproverId ? `
                INSERT INTO workflow_requests 
                (tenant_id, entity_type, entity_id, requested_by_id, approver_role, approver_id, status, from_state, to_state) 
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            ` : `
                INSERT INTO workflow_requests 
                (tenant_id, entity_type, entity_id, requested_by_id, approver_role, status, from_state, to_state) 
                VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `;
            
            const params = assignedManagerId && hasApproverId ? 
                [tenantId, entityType, internalId, userId, approverRole, assignedManagerId, fromState, toState] :
                [tenantId, entityType, internalId, userId, approverRole, fromState, toState];
                
            const requestResult = await q(insertRequestSql, params, connection);
            const requestId = requestResult.insertId;

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

            if (assignedManagerId) {
                try {
                    if (NotificationService && typeof NotificationService.createAndSend === 'function') {
                        await NotificationService.createAndSend(
                            [assignedManagerId],
                            'Task Review Required',
                            `Task #${internalId} has been submitted for your review.`,
                            'TASK_REVIEW_REQUEST',
                            'task',
                            entityId
                        );
                    }
                } catch (nerr) {
                    logger.warn('[WARN] notify assigned manager failed:', nerr && nerr.message);
                }
            }

            // Also notify admins about the workflow request
            try {
                if (NotificationService && typeof NotificationService.createAndSendToRoles === 'function') {
                    await NotificationService.createAndSendToRoles(
                        ['Admin'],
                        'Task Review Requested',
                        `Task #${internalId} has been submitted for manager review and approval.`,
                        'TASK_REVIEW_REQUEST',
                        'task',
                        entityId,
                        tenantId
                    );
                }
            } catch (nerr) {
                logger.warn('[WARN] notify admins about task review failed:', nerr && nerr.message);
            }
            
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


const requestProjectClosure = async ({ tenantId, projectId, reason, userId }) => {
    if (!projectId) throw new Error('projectId is required');

    const prow = await q('SELECT id, status FROM projects WHERE id = ? OR public_id = ? LIMIT 1', [projectId, projectId]);
    if (!prow || prow.length === 0) throw new Error('Project not found');
    const p = prow[0];
    const internalProjectId = p.id;
    if (!p.status || String(p.status).toUpperCase() !== 'ACTIVE') throw new Error('Project must be ACTIVE to request closure');

    let results;
    if (await hasColumn('tasks', 'tenant_id')) {
        results = await q(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed FROM tasks WHERE project_id = ? AND tenant_id = ?`, [internalProjectId, tenantId]);
    } else {
        results = await q(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed FROM tasks WHERE project_id = ?`, [internalProjectId]);
    }
    const { total, completed } = results[0] || { total: 0, completed: 0 };
    if (total === 0) throw new Error('Project has no tasks');
    if (total !== completed) throw new Error('All tasks must be COMPLETED before requesting project closure');

    const connection = await beginTransaction();
    try {

        if (await hasColumn('projects', 'tenant_id')) {
            await q('UPDATE projects SET status = ? WHERE id = ? AND tenant_id = ?', ['PENDING_FINAL_APPROVAL', internalProjectId, tenantId], connection);
        } else {
            await q('UPDATE projects SET status = ? WHERE id = ?', ['PENDING_FINAL_APPROVAL', internalProjectId], connection);
        }


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


const processApproval = async ({ tenantId, requestId, action, reason, userId, userRole }) => {
    const connection = await beginTransaction();
    try {

        const getRequestSql = 'SELECT * FROM workflow_requests WHERE id = ? AND tenant_id = ?';
        const requests = await q(getRequestSql, [requestId, tenantId], connection);
        if (requests.length === 0) throw new Error("Workflow request not found.");
        
        const req = requests[0];
        if (req.status !== 'PENDING') throw new Error(`Request is already ${req.status}.`);

        const hasApproverId = await hasColumn('workflow_requests', 'approver_id');
        if (hasApproverId && req.approver_id) {

            const actingRole = (userRole || '').toUpperCase();
            if (userId !== req.approver_id && actingRole !== 'ADMIN') {
                throw new Error(`Only the assigned manager can ${action.toLowerCase()} this request.`);
            }
        } else {

            const approverRole = (req.approver_role || '').toUpperCase();
            const actingRole = (userRole || '').toUpperCase();
            if (approverRole) {
                if (approverRole !== actingRole && actingRole !== 'ADMIN') {
                    throw new Error(`You do not have permission to ${action.toLowerCase()} this request. Expected role: ${approverRole}`);
                }
            } else {

                if (actingRole !== 'MANAGER' && actingRole !== 'ADMIN') {
                    throw new Error(`You do not have permission to ${action.toLowerCase()} this request.`);
                }
            }
        }

        const { entity_type, entity_id, from_state, to_state } = req;

        let project_id = null;
        if (entity_type === 'TASK') {
            const trows = await q('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [entity_id], connection);
            if (trows && trows.length) project_id = trows[0].project_id;
        } else if (entity_type === 'PROJECT') {
            project_id = entity_id;
        }
        const normalizeState = (s) => {
            if (!s) return s;
            const up = String(s).toUpperCase().replace(/\s+/g, ' ').replace(/_/g, ' ').trim();
            if (up === 'IN PROGRESS' || up === 'INPROGRESS') return 'In Progress';
            if (up === 'REVIEW') return 'Review';
            if (up === 'COMPLETED') return 'Completed';
            if (up === 'PENDING') return 'Pending';
            if (up === 'ON HOLD' || up === 'ON_HOLD') return 'On Hold';
            return s;
        };

        const newStatus = action === 'APPROVE' ? normalizeState(to_state) : (normalizeState(from_state) || 'In Progress');
        const requestStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

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

        // Send notifications after successful approval processing
        try {
            const actionVerb = action === 'APPROVE' ? 'approved' : 'rejected';
            const notificationTitle = action === 'APPROVE' ? `${entity_type} Request Approved` : `${entity_type} Request Rejected`;
            const notificationMessage = `Your ${entity_type.toLowerCase()} request #${requestId} has been ${actionVerb}. Status: ${newStatus}`;

            // Notify the user who made the request
            if (req.requested_by_id) {
                if (NotificationService && typeof NotificationService.createAndSend === 'function') {
                    await NotificationService.createAndSend(
                        [req.requested_by_id],
                        notificationTitle,
                        notificationMessage,
                        entity_type === 'TASK' ? 'TASK_APPROVAL' : 'PROJECT_APPROVAL',
                        entity_type.toLowerCase(),
                        entity_id
                    );
                }
            }

            // Notify admins about the approval action taken
            if (NotificationService && typeof NotificationService.createAndSendToRoles === 'function') {
                const adminNotificationMessage = `${entity_type} request #${requestId} has been ${actionVerb} by ${userRole}.`;
                await NotificationService.createAndSendToRoles(
                    ['Admin'],
                    `Approval Workflow: ${entity_type} ${action}ED`,
                    adminNotificationMessage,
                    entity_type === 'TASK' ? 'TASK_APPROVAL' : 'PROJECT_APPROVAL',
                    entity_type.toLowerCase(),
                    entity_id,
                    tenantId
                );
            }
        } catch (nerr) {
            logger.warn('[WARN] notification on approval processing failed:', nerr && nerr.message);
        }

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

            await q('UPDATE projects SET status = ? WHERE id = ?', ['PENDING_FINAL_APPROVAL', projectId], connection);

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

            } catch (error) {
            await rollbackTransaction(connection);
            logger.error(`[ERROR] Failed to trigger project approval for project ${projectId}:`, error);
        }
    }
};


const getRequests = async ({ tenantId, role, status, userId }) => {

    let processedColumn = null;
    if (await hasColumn('workflow_requests', 'processed_by_id')) processedColumn = 'processed_by_id';
    else if (await hasColumn('workflow_requests', 'approved_by_id')) processedColumn = 'approved_by_id';
    else if (await hasColumn('workflow_requests', 'approved_by')) processedColumn = 'approved_by';

    const processedSelect = processedColumn
        ? `, u2._id as processed_by_id, u2.name as processed_by_name, u2.email as processed_by_email, u2.role as processed_by_role`
        : `, NULL as processed_by_id, NULL as processed_by_name, NULL as processed_by_email, NULL as processed_by_role`;

    const processedJoin = processedColumn ? `LEFT JOIN users u2 ON wr.${processedColumn} = u2._id` : '';

    const hasApproverId = await hasColumn('workflow_requests', 'approver_id');

    const approverSelect = hasApproverId ? `, u_approver._id as approver_user_id, u_approver.name as approver_name, u_approver.email as approver_email` : '';
    const approverJoin = hasApproverId ? `LEFT JOIN users u_approver ON wr.approver_id = u_approver._id` : '';

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
               ${approverSelect}
        FROM workflow_requests wr
        LEFT JOIN users u ON wr.requested_by_id = u._id
        ${processedJoin}
        ${approverJoin}
        LEFT JOIN tasks t ON wr.entity_type = 'TASK' AND wr.entity_id = t.id
        LEFT JOIN projects p ON (wr.entity_type = 'PROJECT' AND wr.entity_id = p.id) OR (wr.entity_type = 'TASK' AND t.project_id = p.id)
        LEFT JOIN clientss c ON p.client_id = c.id
        WHERE wr.tenant_id = ?
    `;
    const params = [tenantId];

    if (userId && role && role.toUpperCase() === 'MANAGER') {
        if (status && status.toUpperCase() === 'PENDING') {

            if (hasApproverId) {
                sql += ' AND (wr.approver_id = ? OR p.project_manager_id = ?) AND wr.approver_role = ?';
                params.push(userId, userId, role);
            } else {
                sql += ' AND p.project_manager_id = ? AND wr.approver_role = ?';
                params.push(userId, role);
            }
        } else if (status && (status.toUpperCase() === 'APPROVED' || status.toUpperCase() === 'REJECTED')) {

            if (processedColumn) {
                sql += ` AND wr.${processedColumn} = ? AND wr.approver_role = ?`;
                params.push(userId, role);
            } else {

                sql += ' AND p.project_manager_id = ? AND wr.approver_role = ?';
                params.push(userId, role);
            }
        } else {

            if (processedColumn && hasApproverId) {
                sql += ` AND ((wr.approver_id = ? OR p.project_manager_id = ? OR wr.${processedColumn} = ?) AND wr.approver_role = ?)`;
                params.push(userId, userId, userId, role);
            } else if (processedColumn) {
                sql += ` AND ((p.project_manager_id = ? OR wr.${processedColumn} = ?) AND wr.approver_role = ?)`;
                params.push(userId, userId, role);
            } else if (hasApproverId) {
                sql += ' AND (wr.approver_id = ? OR p.project_manager_id = ?) AND wr.approver_role = ?';
                params.push(userId, userId, role);
            } else {
                sql += ' AND p.project_manager_id = ? AND wr.approver_role = ?';
                params.push(userId, role);
            }
        }
    } else {
        sql += ' AND wr.approver_role = ?';
        params.push(role);
    }

    if (status && status.toLowerCase() !== 'all') {
        sql += ' AND wr.status = ?';
        params.push(status);
    }
    
    sql += ' ORDER BY wr.created_at DESC';

    const requests = await q(sql, params);

    for (const req of requests) {

        const actionVerb = req.status === 'APPROVED' ? 'approved' : (req.status === 'REJECTED' ? 'rejected' : 'pending approval');
        req.message = `${req.entity_type} request #${req.id} is ${actionVerb}.`;
        
        if (req.status !== 'PENDING') {
            req.newStatus = req.status === 'APPROVED' ? req.to_state : req.from_state;
        }

        const projectId = req.entity_type === 'PROJECT' ? req.entity_id : (req.project_id || (req.entity_type === 'TASK' ? (await q('SELECT project_id FROM tasks WHERE id = ?', [req.entity_id]))[0]?.project_id : null));

        const toStateUpper = String(req.to_state || '').toUpperCase();
        const projectStatusUpper = String(req.project_status || '').toUpperCase();





        
        const isPendingClosure = (toStateUpper === 'CLOSED') && projectStatusUpper === 'PENDING_FINAL_APPROVAL';
        const isProjectClosed = projectStatusUpper === 'CLOSED' || req.project_is_locked === 1;

        req.project_status_info = {

            raw: req.project_status,

            display: isPendingClosure ? 'PENDING_CLOSURE' : (isProjectClosed ? 'CLOSED' : req.project_status || 'ACTIVE'),

            is_closed: isProjectClosed,
            is_pending_closure: isPendingClosure,
            is_locked: req.project_is_locked === 1,

            can_create_tasks: !isProjectClosed && !isPendingClosure,
            can_edit_project: !isProjectClosed && !isPendingClosure,
            can_request_closure: !isProjectClosed && !isPendingClosure
        };

        req.project_effective_status = req.project_status_info.display;
        req.can_create_tasks = req.project_status_info.can_create_tasks;
        req.can_send_request = !isProjectClosed && !isPendingClosure && (req.entity_type !== 'TASK' || req.task_is_locked !== 1);
        req.project_closed = isProjectClosed;

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

            const tasksSql = `
                SELECT t.id, t.title, t.status, t.total_duration, t.priority, t.public_id
                FROM tasks t
                WHERE t.project_id = ?
            `;
            const tasks = await q(tasksSql, [projectId]);

            let totalProjectSeconds = 0;
            for (const task of tasks) {
                totalProjectSeconds += (task.total_duration || 0);

                const assigneesSql = `
                    SELECT u.name, u.email, u.role
                    FROM taskassignments ta
                    JOIN users u ON ta.user_Id = u._id
                    WHERE ta.task_Id = ?
                `;
                task.assignees = await q(assigneesSql, [task.id]);

                const subtasksSql = `
                    SELECT title, status, due_date
                    FROM subtasks
                    WHERE task_Id = ?
                `;
                task.checklists = await q(subtasksSql, [task.id]);

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

