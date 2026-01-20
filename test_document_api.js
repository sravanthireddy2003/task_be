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

async function testDocumentManagement() {
  console.log('🚀 Starting Document Management API Tests...\n');

  let authToken = '';
  let projectId = '';
  let clientId = '';

  try {
    // 1. Login
    console.log('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, TEST_CREDENTIALS);
    authToken = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // 2. Create client first (needed for project creation)
    console.log('2. 👥 Creating client for project...');
    const clientForm = new FormData();
    clientForm.append('name', 'Test Client for Project');
    clientForm.append('email', 'testclient@example.com');
    clientForm.append('phone', '+1234567890');
    clientForm.append('company', 'Test Company Ltd');

    const clientResponse = await axios.post(`${BASE_URL}/api/clients`, clientForm, {
      headers: {
        ...clientForm.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    clientId = clientResponse.data.data.id;
    console.log(`✅ Client created with ID: ${clientId}`);
    console.log('');

    // 3. Create project with documents
    console.log('3. 📁 Creating project with documents...');
    const projectForm = new FormData();
    projectForm.append('name', 'Test Project with Documents');
    projectForm.append('description', 'Project created via automated test');
    projectForm.append('priority', 'HIGH');
    projectForm.append('startDate', '2024-01-15');
    projectForm.append('endDate', '2024-03-15');
    projectForm.append('budget', '75000');
    projectForm.append('client_id', clientId); // Required by business rules
    projectForm.append('departmentNames', JSON.stringify(['Development', 'Testing']));

    // Create a dummy PDF file for testing
    const testPdfPath = path.join(__dirname, 'test_document.pdf');
    if (!fs.existsSync(testPdfPath)) {
      // Create a simple text file as placeholder
      fs.writeFileSync(testPdfPath, 'This is a test document for API testing.');
    }
    projectForm.append('documents', fs.createReadStream(testPdfPath));

    const projectResponse = await axios.post(`${BASE_URL}/api/projects`, projectForm, {
      headers: {
        ...projectForm.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    projectId = projectResponse.data.data.id;
    console.log(`✅ Project created with ID: ${projectId}`);
    if (projectResponse.data.data.documents) {
      console.log(`📎 Documents attached: ${projectResponse.data.data.documents.length}`);
    }
    console.log('');

    // 4. Create client with documents
    console.log('4. 👥 Creating client with documents...');
    const clientForm2 = new FormData();
    clientForm2.append('name', 'Test Client with Documents');
    clientForm2.append('email', 'testclient2@example.com');
    clientForm2.append('phone', '+1234567890');
    clientForm2.append('company', 'Test Company Ltd');
    clientForm2.append('address', '123 Test Street, Test City, TC 12345');
    clientForm2.append('industry', 'Technology');

    // Attach the same test document
    clientForm2.append('documents', fs.createReadStream(testPdfPath));

    const clientResponse2 = await axios.post(`${BASE_URL}/api/clients`, clientForm2, {
      headers: {
        ...clientForm2.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    const clientId2 = clientResponse2.data.data.id;
    console.log(`✅ Client created with ID: ${clientId2}`);
    if (clientResponse2.data.data.documents) {
      console.log(`📎 Documents attached: ${clientResponse2.data.data.documents.length}`);
    }
    console.log('');

    // 5. List documents
    console.log('5. 📄 Listing all documents...');
    const documentsResponse = await axios.get(`${BASE_URL}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const documents = documentsResponse.data.data;
    console.log(`✅ Found ${documents.length} documents:`);
    documents.forEach((doc, index) => {
      console.log(`   ${index + 1}. ${doc.fileName} (${doc.fileType}) - ${doc.entityType}:${doc.entityId}`);
    });
    console.log('');

    // 6. Test document preview/download (if documents exist)
    if (documents.length > 0) {
      const firstDoc = documents[0];
      console.log(`6. 👁️ Testing document preview for ${firstDoc.fileName}...`);

      try {
        const previewResponse = await axios.get(`${BASE_URL}/api/documents/${firstDoc.documentId}/preview`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        console.log('✅ Document preview successful');
      } catch (error) {
        console.log('⚠️ Document preview failed:', error.response?.data?.error || error.message);
      }

      console.log(`7. 📥 Testing document download for ${firstDoc.fileName}...`);
      try {
        const downloadResponse = await axios.get(`${BASE_URL}/api/documents/${firstDoc.documentId}/download`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          responseType: 'stream'
        });
        console.log('✅ Document download successful');
      } catch (error) {
        console.log('⚠️ Document download failed:', error.response?.data?.error || error.message);
      }
    }

    // Cleanup test file
    if (fs.existsSync(testPdfPath)) {
      fs.unlinkSync(testPdfPath);
    }

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testDocumentManagement();
}

module.exports = { testDocumentManagement };