const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

async function uploadDocumentToProject() {
  logger.info('🚀 Uploading test document to project...\n');

  try {
    // 1. Login
    logger.info('1. 🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    const authToken = loginResponse.data.token;
    logger.info('✅ Login successful\n');

    // 2. Create test file
    const testFilePath = path.join(__dirname, 'test_project_doc.pdf');
    if (!fs.existsSync(testFilePath)) {
      // Create a dummy PDF content
      fs.writeFileSync(testFilePath, '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n72 720 Td\n/F0 12 Tf\n(Test Document) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000200 00000 n\ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n284\n%%EOF');
    }

    // 3. Upload document to project
    logger.info('3. 📁 Uploading document to project ID 18...');
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

    logger.info('✅ Document uploaded successfully:', uploadResponse.data);
    logger.info('');

    logger.info('4. 📄 Listing documents for project ID 18...');
    const listResponse = await axios.get(`${BASE_URL}/api/documents`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'project-id': '18'
      }
    });

    const docs = (listResponse.data && listResponse.data.data && listResponse.data.data.documents) || listResponse.data.data || [];
    logger.info('✅ Documents found:', Array.isArray(docs) ? docs.length : 'unknown');
    (docs || []).forEach((doc, index) => {
      logger.info(`${index + 1}. ${doc.fileName} - ${doc.entityType}:${doc.entityId} - URL: ${doc.file_url}`);
    });

    const firstDoc = (docs && docs[0]) || null;
    const docId = firstDoc ? (firstDoc.documentId || firstDoc.id || firstDoc.documentId) : null;
    if (docId) {
      logger.info('\n5. 🔎 Fetching preview for documentId', docId);
      try {
        const previewResp = await axios.get(`${BASE_URL}/api/documents/preview/${docId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        logger.info('✅ Preview response:', previewResp.data);
      } catch (e) {
        logger.error('❌ Preview error:', e.response ? e.response.data : e.message);
      }

      logger.info('\n6. ⬇️ Downloading document', docId);
      try {
        const dlResp = await axios.get(`${BASE_URL}/api/documents/download/${docId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
          maxRedirects: 5,
          validateStatus: null,
          responseType: 'stream'
        });
        logger.info('✅ Download status:', dlResp.status, 'headers:', dlResp.headers['content-disposition'] || '');
        if (dlResp.request && dlResp.request.res && dlResp.request.res.responseUrl) {
          logger.info('Final URL:', dlResp.request.res.responseUrl);
        }
        // Consume and discard stream to complete request
        if (dlResp.data && dlResp.data.pipe) {
          dlResp.data.on('end', () => {});
          dlResp.data.resume();
        }
      } catch (e) {
        logger.error('❌ Download error:', e.response ? e.response.data : e.message);
      }
    }

    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }

  } catch (error) {
    logger.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

uploadDocumentToProject();