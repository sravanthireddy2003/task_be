const axios = require('axios');
require('dotenv').config();

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

// Test credentials
const TEST_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'admin123'
};

async function basicDocumentTest() {
  logger.info('🚀 Basic Document Management Test...\n');

  try {
    // 1. Login
    logger.info('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${process.env.BASE_URL || 'http://localhost:4000'}/api/auth/login`, TEST_CREDENTIALS);
    const authToken = loginResponse.data.token;
    logger.info('✅ Login successful\n');

    logger.info('2. 📄 Listing documents...');
    const documentsResponse = await axios.get(`${process.env.BASE_URL || 'http://localhost:4000'}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const documents = documentsResponse.data.data;
    logger.info(`✅ Found ${documents.length} documents`);
    logger.info('Response:', JSON.stringify(documentsResponse.data, null, 2));

  } catch (error) {
    logger.error('❌ Test failed:', error.response?.data || error.message);
  }
}

basicDocumentTest();