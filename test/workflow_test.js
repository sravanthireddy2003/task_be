// test/workflow_test.js

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testWorkflow() {
  logger.info('🚀 Testing Workflow Module...\n');

  let authToken = '';
  let taskId = 1; // Assume a task exists

  try {
    // 1. Login as admin
    logger.info('1. 🔐 Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.data.token;
    logger.info('✅ Login successful\n');

    const headers = {
      Authorization: `Bearer ${authToken}`,
      'X-Tenant-Id': '1',
      'Content-Type': 'application/json'
    };

    logger.info('2. 📝 Requesting task transition (Assigned → In Progress)...');
    const requestResponse = await axios.post(`${BASE_URL}/api/workflow/request`, {
      tenantId: 1,
      entityType: 'TASK',
      entityId: taskId,
      toState: 'In Progress',
      meta: { reason: 'Starting work' }
    }, { headers });
    logger.info('✅ Request response:', requestResponse.data);
    logger.info('');

    logger.info('3. 📋 Getting pending requests for manager...');
    const pendingResponse = await axios.get(`${BASE_URL}/api/workflow/pending?role=MANAGER`, { headers });
    logger.info('✅ Pending requests:', pendingResponse.data);
    logger.info('');

    // If there are pending requests, approve one
    if (pendingResponse.data.data && pendingResponse.data.data.length > 0) {
      const requestId = pendingResponse.data.data[0].id;
      logger.info('4. ✅ Approving request...');
      const approveResponse = await axios.post(`${BASE_URL}/api/workflow/approve`, {
        requestId,
        approved: true,
        reason: 'Approved by manager'
      }, { headers });
      logger.info('✅ Approve response:', approveResponse.data);
      logger.info('');
    }

    // 5. Get history
    logger.info('5. 📜 Getting workflow history...');
    const historyResponse = await axios.get(`${BASE_URL}/api/workflow/history/TASK/${taskId}`, { headers });
    logger.info('✅ History:', historyResponse.data);
    logger.info('');

    logger.info('🎉 Workflow tests completed successfully!');
  } catch (error) {
    logger.error('❌ Test failed:', error.message);
    if (error.response) {
      logger.error('Response status:', error.response.status);
      logger.error('Response data:', error.response.data);
    }
  }
}

if (require.main === module) testWorkflow();

module.exports = { testWorkflow };