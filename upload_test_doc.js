const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4000';

async function uploadDocumentToProject() {
  console.log('🚀 Uploading test document to project...\n');

  try {
    // 1. Login
    console.log('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    const authToken = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // 2. Create test file
    const testFilePath = path.join(__dirname, 'test_project_doc.pdf');
    if (!fs.existsSync(testFilePath)) {
      // Create a dummy PDF content
      fs.writeFileSync(testFilePath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n72 720 Td\n/F0 12 Tf\n(Test Document) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000200 00000 n\ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n284\n%%EOF');
    }

    // 3. Upload document to project
    console.log('3. 📁 Uploading document to project ID 18...');
    const form = new FormData();
    form.append('document', fs.createReadStream(testFilePath));
    form.append('entityType', 'PROJECT');
    form.append('entityId', '18');

    const uploadResponse = await axios.post(`${BASE_URL}/api/documents/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('✅ Document uploaded successfully:', uploadResponse.data);
    console.log('');

    // 4. List documents for project
    console.log('4. 📄 Listing documents for project ID 18...');
    const listResponse = await axios.get(`${BASE_URL}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'project-id': '18'
      }
    });

    console.log('✅ Documents found:', listResponse.data.data.length);
    listResponse.data.data.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.fileName} - ${doc.entityType}:${doc.entityId}`);
    });

    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

uploadDocumentToProject();