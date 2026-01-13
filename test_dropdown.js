const axios = require('axios');

async function testProjectDropdown() {
  try {
    // Login
    const login = await axios.post('http://localhost:4000/api/auth/login', {
      email: 'korapatiashwini@gmail.com',
      password: 'admin123'  // Assuming default password
    });
    const token = login.data.token;
    console.log('Login successful');

    // Get project dropdown
    const dropdown = await axios.get('http://localhost:4000/api/projects/projectdropdown', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Projects:', dropdown.data);

    // Test list documents with project public_id
    if (dropdown.data.length > 0) {
      const projectPublicId = dropdown.data[0].id;
      console.log(`Testing documents for project ${projectPublicId}`);
      const docs = await axios.get('http://localhost:4000/api/documents', {
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