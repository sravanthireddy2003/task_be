const axios = require('axios');

// Test credentials
const TEST_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'admin123'
};

async function basicDocumentTest() {
  console.log('🚀 Basic Document Management Test...\n');

  try {
    // 1. Login
    console.log('1. 🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', TEST_CREDENTIALS);
    const authToken = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // 2. List documents (should return empty array initially)
    console.log('2. 📄 Listing documents...');
    const documentsResponse = await axios.get('http://localhost:3000/api/documents', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const documents = documentsResponse.data.data;
    console.log(`✅ Found ${documents.length} documents`);
    console.log('Response:', JSON.stringify(documentsResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

basicDocumentTest();