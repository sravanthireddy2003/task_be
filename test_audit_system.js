// =====================================================
// Test Script for Audit Logger Service
// =====================================================

const auditLogger = require('./src/services/auditLogger');

async function runTests() {
    console.log('Starting Audit Logger Tests...\n');

    // Test 1: Basic audit log
    console.log('Test 1: Basic Audit Log');
    await auditLogger.logAudit({
        action: 'TEST_ACTION',
        tenant_id: 1,
        actor_id: 'test_user_123',
        module: 'Test',
        entity: 'TestEntity',
        entity_id: 'entity_001',
        ip_address: '192.168.1.100',
        user_agent: 'Test Agent',
        correlation_id: 'test-correlation-123',
        details: {
            testField: 'test value',
            timestamp: new Date()
        }
    });
    console.log('✓ Basic audit log created\n');

    // Test 2: Login success
    console.log('Test 2: Login Success');
    await auditLogger.logAudit({
        action: 'LOGIN_SUCCESS',
        tenant_id: 1,
        actor_id: 'user_456',
        module: 'Auth',
        entity: 'User',
        entity_id: 'user_456',
        ip_address: '192.168.1.101',
        user_agent: 'Mozilla/5.0',
        details: {
            email: 'test@example.com',
            role: 'Manager',
            loginMethod: 'email_password'
        }
    });
    console.log('✓ Login success logged\n');

    // Test 3: Login failure
    console.log('Test 3: Login Failure');
    await auditLogger.logAudit({
        action: 'LOGIN_FAILED',
        tenant_id: null,
        actor_id: 'anonymous',
        module: 'Auth',
        entity: 'User',
        entity_id: null,
        ip_address: '192.168.1.102',
        user_agent: 'Mozilla/5.0',
        details: {
            email: 'hacker@example.com',
            reason: 'Invalid credentials',
            attemptsLeft: 3
        }
    });
    console.log('✓ Login failure logged\n');

    // Test 4: Task creation with previous/new values
    console.log('Test 4: Task Created with State Tracking');
    await auditLogger.logAudit({
        action: 'TASK_CREATED',
        tenant_id: 1,
        actor_id: 'manager_789',
        module: 'Tasks',
        entity: 'Task',
        entity_id: 'task_001',
        ip_address: '192.168.1.103',
        user_agent: 'Chrome/90.0',
        details: {
            taskName: 'Implement Audit System',
            assignedTo: 'employee_111',
            projectId: 'project_555'
        },
        new_value: {
            status: 'Open',
            priority: 'High',
            assignedTo: 'employee_111'
        }
    });
    console.log('✓ Task creation logged\n');

    // Test 5: Task status change
    console.log('Test 5: Task Status Changed');
    await auditLogger.logAudit({
        action: 'TASK_STATUS_CHANGED',
        tenant_id: 1,
        actor_id: 'employee_111',
        module: 'Tasks',
        entity: 'Task',
        entity_id: 'task_001',
        ip_address: '192.168.1.104',
        user_agent: 'Chrome/90.0',
        details: {
            taskName: 'Implement Audit System',
            changedBy: 'Employee One'
        },
        previous_value: {
            status: 'Open'
        },
        new_value: {
            status: 'In Progress'
        }
    });
    console.log('✓ Task status change logged\n');

    // Test 6: Approval granted
    console.log('Test 6: Approval Granted');
    await auditLogger.logAudit({
        action: 'APPROVAL_GRANTED',
        tenant_id: 1,
        actor_id: 'manager_789',
        module: 'Approvals',
        entity: 'WorkflowRequest',
        entity_id: 'request_001',
        ip_address: '192.168.1.105',
        user_agent: 'Chrome/90.0',
        details: {
            requestType: 'TASK',
            requestEntityId: 'task_001',
            fromState: 'In Progress',
            toState: 'Completed',
            requestedBy: 'employee_111',
            approvedBy: 'manager_789',
            reason: 'All requirements met'
        },
        previous_value: {
            status: 'PENDING'
        },
        new_value: {
            status: 'APPROVED',
            approvedBy: 'manager_789',
            approvedAt: new Date()
        }
    });
    console.log('✓ Approval logged\n');

    // Test 7: Batch logging
    console.log('Test 7: Batch Logging (5 events)');
    const batchEvents = [];
    for (let i = 1; i <= 5; i++) {
        batchEvents.push({
            action: 'BATCH_TEST_ACTION',
            tenant_id: 1,
            actor_id: `user_${i}`,
            module: 'Test',
            entity: 'BatchEntity',
            entity_id: `batch_${i}`,
            ip_address: `192.168.1.${200 + i}`,
            details: {
                batchNumber: i,
                timestamp: new Date()
            }
        });
    }
    await auditLogger.logBatch(batchEvents);
    console.log('✓ Batch of 5 events logged\n');

    // Test 8: Multi-tenant test
    console.log('Test 8: Multi-Tenant Logging');
    for (let tenantId = 1; tenantId <= 3; tenantId++) {
        await auditLogger.logAudit({
            action: 'TENANT_TEST_ACTION',
            tenant_id: tenantId,
            actor_id: `tenant${tenantId}_user`,
            module: 'Test',
            entity: 'TenantEntity',
            entity_id: `entity_tenant_${tenantId}`,
            ip_address: '192.168.1.210',
            details: {
                tenantName: `Tenant ${tenantId}`,
                testData: `Data for tenant ${tenantId}`
            }
        });
    }
    console.log('✓ Multi-tenant events logged (3 tenants)\n');

    console.log('All tests completed successfully!');
    console.log('\nVerify in MySQL:');
    console.log('  SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 20;\n');
    console.log('Wait 1-2 minutes, then verify in Elasticsearch:');
    console.log('  curl -X GET "localhost:9200/audit-logs-*/_search?pretty&size=20"\n');
}

runTests()
    .then(() => {
        console.log('Test script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Test script failed:', error);
        process.exit(1);
    });
