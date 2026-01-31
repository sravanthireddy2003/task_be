let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const axios = require('axios');
require('dotenv').config();

async function testProjectDropdown() {
  try {
    // Login
    const login = await axios.post(`${process.env.BASE_URL || 'http://localhost:4000'}/api/auth/login`, {
      email: 'korapatiashwini@gmail.com',
      password: 'admin123'  // Assuming default password
    });
    const token = login.data.token;
    logger.info('Login successful');

    // Get project dropdown
    const dropdown = await axios.get(`${process.env.BASE_URL || 'http://localhost:4000'}/api/projects/projectdropdown`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    logger.info('Projects:', dropdown.data);

    // Test list documents with project public_id
    if (dropdown.data.length > 0) {
      const projectPublicId = dropdown.data[0].id;
      logger.info(`Testing documents for project ${projectPublicId}`);
      const docs = await axios.get(`${process.env.BASE_URL || 'http://localhost:4000'}/api/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'project-id': projectPublicId
        }
      });
      logger.info('Documents:', docs.data);
    }

  } catch(e) {
    logger.error(e.response ? e.response.data : e.message);
  }
}

testProjectDropdown();