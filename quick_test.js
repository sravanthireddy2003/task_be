let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Test credentials
const TEST_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'admin123'
};

async function quickDocumentTest() {
  logger.info('🚀 Quick Document Upload Test...\n');

  try {
    // 1. Login
    logger.info('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_CREDENTIALS);
    const authToken = loginResponse.data.token;
    logger.info('✅ Login successful\n');

    // 2. Create a simple client first
    logger.info('2. 👥 Creating test client...');
    const clientForm = new FormData();
    clientForm.append('name', `Quick Test Client ${Date.now()}`);
    clientForm.append('email', `quicktest${Date.now()}@example.com`);
    clientForm.append('company', 'Quick Test Company');

    const clientResponse = await axios.post(`${BASE_URL}/api/clients`, clientForm, {
      headers: {
        ...clientForm.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    const clientId = clientResponse.data.data.id;
    logger.info(`✅ Client created with ID: ${clientId}\n`);

    // 3. Create project with document
    logger.info('3. 📁 Creating project with document...');
    const projectForm = new FormData();
    projectForm.append('name', 'Quick Test Project');
    projectForm.append('client_id', clientId);

    // Create test file
    const testFilePath = path.join(__dirname, 'quick_test.txt');
    fs.writeFileSync(testFilePath, 'Quick test document content for API testing.');
    projectForm.append('documents', fs.createReadStream(testFilePath));

    const projectResponse = await axios.post(`${BASE_URL}/api/projects`, projectForm, {
      headers: {
        ...projectForm.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    const projectId = projectResponse.data.data.id;
    logger.info(`✅ Project created with ID: ${projectId}`);
    logger.info(`📎 Documents attached: ${projectResponse.data.data.documents?.length || 0}\n`);

    // 4. List documents
    logger.info('4. 📄 Listing documents...');
    const documentsResponse = await axios.get(`${BASE_URL}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const documents = documentsResponse.data.data;
    logger.info(`✅ Found ${documents.length} documents\n`);

    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    logger.info('🎉 Quick test completed successfully!');

  } catch (error) {
    logger.error('❌ Test failed:', error.response?.data || error.message);
  }
}

quickDocumentTest();