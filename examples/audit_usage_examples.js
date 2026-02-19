// =====================================================
// 2C) EXAMPLE USAGE IN CONTROLLERS
// =====================================================

const auditLogger = require('../src/services/auditLogger');

// ========================================
// EXAMPLE 1: Login Success
// ========================================
async function loginSuccess(req, res) {
    // ... authentication logic ...

    await auditLogger.logAudit({
        action: 'LOGIN_SUCCESS',
        tenant_id: user.tenant_id,
        actor_id: user._id,
        module: 'Auth',
        entity: 'User',
        entity_id: user._id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            email: user.email,
            role: user.role,
            loginMethod: 'email_password'
        }
    });

    res.json({ success: true, token: '...' });
}

// ========================================
// EXAMPLE 2: Login Failure
// ========================================
async function loginFailure(req, res) {
    await auditLogger.logAudit({
        action: 'LOGIN_FAILED',
        tenant_id: null,
        actor_id: 'anonymous',
        module: 'Auth',
        entity: 'User',
        entity_id: null,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            email: req.body.email,
            reason: 'Invalid credentials',
            attemptsLeft: 3
        }
    });

    res.status(401).json({ success: false, error: 'Invalid credentials' });
}

// ========================================
// EXAMPLE 3: Task Created
// ========================================
async function createTask(req, res) {
    // ... task creation logic ...

    await auditLogger.logAudit({
        action: 'TASK_CREATED',
        tenant_id: req.user.tenant_id,
        actor_id: req.user._id,
        module: 'Tasks',
        entity: 'Task',
        entity_id: newTask.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            taskName: newTask.name,
            assignedTo: newTask.assigned_to,
            projectId: newTask.project_id,
            priority: newTask.priority
        },
        new_value: {
            status: newTask.status,
            priority: newTask.priority,
            assignedTo: newTask.assigned_to
        }
    });

    res.json({ success: true, task: newTask });
}

// ========================================
// EXAMPLE 4: Task Completed
// ========================================
async function completeTask(req, res) {
    const taskBefore = await getTask(req.params.id);

    // ... update task status ...

    await auditLogger.logAudit({
        action: 'TASK_COMPLETED',
        tenant_id: req.user.tenant_id,
        actor_id: req.user._id,
        module: 'Tasks',
        entity: 'Task',
        entity_id: req.params.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            taskName: taskBefore.name,
            completedBy: req.user.name,
            completedAt: new Date()
        },
        previous_value: {
            status: taskBefore.status,
            progress: taskBefore.progress
        },
        new_value: {
            status: 'Completed',
            progress: 100
        }
    });

    res.json({ success: true });
}

// ========================================
// EXAMPLE 5: Task Status Changed
// ========================================
async function changeTaskStatus(req, res) {
    const taskBefore = await getTask(req.params.id);
    const { status: newStatus } = req.body;

    // ... update task status ...

    await auditLogger.logAudit({
        action: 'TASK_STATUS_CHANGED',
        tenant_id: req.user.tenant_id,
        actor_id: req.user._id,
        module: 'Tasks',
        entity: 'Task',
        entity_id: req.params.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            taskName: taskBefore.name,
            previousStatus: taskBefore.status,
            newStatus: newStatus,
            changedBy: req.user.name
        },
        previous_value: {
            status: taskBefore.status
        },
        new_value: {
            status: newStatus
        }
    });

    res.json({ success: true });
}

// ========================================
// EXAMPLE 6: Project Created
// ========================================
async function createProject(req, res) {
    // ... project creation logic ...

    await auditLogger.logAudit({
        action: 'PROJECT_CREATED',
        tenant_id: req.user.tenant_id,
        actor_id: req.user._id,
        module: 'Projects',
        entity: 'Project',
        entity_id: newProject.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            projectName: newProject.name,
            managerId: newProject.manager_id,
            clientId: newProject.client_id,
            budget: newProject.budget
        },
        new_value: {
            name: newProject.name,
            status: newProject.status,
            budget: newProject.budget
        }
    });

    res.json({ success: true, project: newProject });
}

// ========================================
// EXAMPLE 7: Approval Granted
// ========================================
async function grantApproval(req, res) {
    const request = await getApprovalRequest(req.params.id);

    // ... approval logic ...

    await auditLogger.logAudit({
        action: 'APPROVAL_GRANTED',
        tenant_id: req.user.tenant_id,
        actor_id: req.user._id,
        module: 'Approvals',
        entity: 'WorkflowRequest',
        entity_id: req.params.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        correlation_id: req.correlationId,
        details: {
            requestType: request.entity_type,
            requestEntityId: request.entity_id,
            fromState: request.from_state,
            toState: request.to_state,
            requestedBy: request.requested_by,
            approvedBy: req.user._id,
            reason: req.body.reason
        },
        previous_value: {
            status: 'PENDING'
        },
        new_value: {
            status: 'APPROVED',
            approvedBy: req.user._id,
            approvedAt: new Date()
        }
    });

    res.json({ success: true });
}

// ========================================
// USAGE WITH MIDDLEWARE
// ========================================
const { auditMiddleware } = require('../src/middleware/auditLogger');
const express = require('express');
const router = express.Router();

// Apply middleware globally or per route
router.use(auditMiddleware());

// Use req.audit.log() in routes
router.post('/tasks', async (req, res) => {
    // ... create task ...

    await req.audit.log({
        action: 'TASK_CREATED',
        module: 'Tasks',
        entity: 'Task',
        entity_id: newTask.id,
        details: { taskName: newTask.name }
    });

    res.json({ success: true });
});

module.exports = {
    loginSuccess,
    loginFailure,
    createTask,
    completeTask,
    changeTaskStatus,
    createProject,
    grantApproval
};
