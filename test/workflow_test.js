// test/workflow_test.js
// Test script for workflow APIs

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function testWorkflow() {
  console.log('🚀 Testing Workflow Module...\n');

  let authToken = '';
  let taskId = 1; // Assume a task exists

  try {
    // 1. Login as admin
    console.log('1. 🔐 Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    authToken = loginResponse.data.token;
    console.log('✅ Login successful\n');

    const headers = {
      Authorization: `Bearer ${authToken}`,
      'X-Tenant-Id': '1',
      'Content-Type': 'application/json'
    };

    // 2. Request transition for task (EMPLOYEE action)
    console.log('2. 📝 Requesting task transition (Assigned → In Progress)...');
    const requestResponse = await axios.post(`${BASE_URL}/api/workflow/request`, {
      tenantId: 1,
      entityType: 'TASK',
      entityId: taskId,
      toState: 'In Progress',
      meta: { reason: 'Starting work' }
    }, { headers });
    console.log('✅ Request response:', requestResponse.data);
    console.log('');

    // 3. Get pending requests for manager
    console.log('3. 📋 Getting pending requests for manager...');
    const pendingResponse = await axios.get(`${BASE_URL}/api/workflow/pending?role=MANAGER`, { headers });
    console.log('✅ Pending requests:', pendingResponse.data);
    console.log('');

    // If there are pending requests, approve one
    if (pendingResponse.data.data && pendingResponse.data.data.length > 0) {
      const requestId = pendingResponse.data.data[0].id;
      console.log('4. ✅ Approving request...');
      const approveResponse = await axios.post(`${BASE_URL}/api/workflow/approve`, {
        requestId,
        approved: true,
        reason: 'Approved by manager'
      }, { headers });
      console.log('✅ Approve response:', approveResponse.data);
      console.log('');
    }

    // 5. Get history
    console.log('5. 📜 Getting workflow history...');
    const historyResponse = await axios.get(`${BASE_URL}/api/workflow/history/TASK/${taskId}`, { headers });
    console.log('✅ History:', historyResponse.data);
    console.log('');

    console.log('🎉 Workflow tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

if (require.main === module) testWorkflow();

module.exports = { testWorkflow };