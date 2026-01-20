const axios = require('axios');

async function testProjectDropdown() {
  try {
    const BASE_URL = process.env.BASE_URL || process.env.FRONTEND_URL;
    if (!BASE_URL) {
      console.error('BASE_URL not set. Set BASE_URL or FRONTEND_URL in environment.');
      process.exit(1);
    }

    // Login
    const login = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'korapatiashwini@gmail.com',
      password: 'admin123'  // Assuming default password
    });
    const token = login.data.token;
    console.log('Login successful');

    // Get project dropdown
    const dropdown = await axios.get(`${BASE_URL}/api/projects/projectdropdown`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Projects:', dropdown.data);

    // Test list documents with project public_id
    if (dropdown.data.length > 0) {
      const projectPublicId = dropdown.data[0].id;
      console.log(`Testing documents for project ${projectPublicId}`);
      const docs = await axios.get(`${BASE_URL}/api/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'project-id': projectPublicId
        }
      });
      console.log('Documents:', docs.data);
    }

  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}

testProjectDropdown();