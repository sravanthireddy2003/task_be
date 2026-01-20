const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || process.env.FRONTEND_URL;

if (!BASE_URL) {
  console.error('BASE_URL not set. Set BASE_URL or FRONTEND_URL in environment.');
  process.exit(1);
}

// Test credentials
const TEST_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'admin123'
};

async function quickDocumentTest() {
  console.log('🚀 Quick Document Upload Test...\n');

  try {
    // 1. Login
    console.log('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_CREDENTIALS);
    const authToken = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // 2. Create a simple client first
    console.log('2. 👥 Creating test client...');
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
    console.log(`✅ Client created with ID: ${clientId}\n`);

    // 3. Create project with document
    console.log('3. 📁 Creating project with document...');
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
    console.log(`✅ Project created with ID: ${projectId}`);
    console.log(`📎 Documents attached: ${projectResponse.data.data.documents?.length || 0}\n`);

    // 4. List documents
    console.log('4. 📄 Listing documents...');
    const documentsResponse = await axios.get(`${BASE_URL}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const documents = documentsResponse.data.data;
    console.log(`✅ Found ${documents.length} documents\n`);

    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

    console.log('🎉 Quick test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

quickDocumentTest();