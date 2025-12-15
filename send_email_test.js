const http = require('http');

// Step 1: Login to get a fresh token
const loginData = JSON.stringify({
  "email": "korapatiaswini@gmail.com",
  "password": "Admin@123"
});

const loginOptions = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

console.log('Step 1: Logging in to get token...\n');

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Login Response Status:', res.statusCode);
      
      if (response.token) {
        console.log('✅ Got token:', response.token.substring(0, 30) + '...\n');
        
        // Step 2: Create client with viewer
        createClientWithViewer(response.token);
      } else {
        console.log('❌ No token in response:', response);
        process.exit(1);
      }
    } catch (e) {
      console.error('Error parsing response:', e.message);
      console.log('Raw response:', data);
      process.exit(1);
    }
  });
});

loginReq.on('error', (error) => {
  console.error('Login Error:', error.message);
  process.exit(1);
});

loginReq.write(loginData);
loginReq.end();

// Create client with viewer
function createClientWithViewer(token) {
  console.log('Step 2: Creating test client and sending email...\n');
  
  const clientData = JSON.stringify({
    "name": "Test Client Ashwini",
    "company": "NMIT Solutions",
    "createViewer": true,
    "contacts": [
      {
        "name": "Ashwini M",
        "email": "ashwini.m@nmit-solutions.com"
      }
    ]
  });

  const clientOptions = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/clients',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(clientData),
      'Authorization': `Bearer ${token}`
    }
  };

  const clientReq = http.request(clientOptions, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('Client Creation Status:', res.statusCode);
      try {
        const response = JSON.parse(data);
        console.log('\nResponse:');
        console.log(JSON.stringify(response, null, 2));
        
        if (response.success) {
          console.log('\n✅ SUCCESS: Client created and email sent to ashwini.m@nmit-solutions.com');
          console.log('Client ID:', response.data.id);
          console.log('Reference:', response.data.ref);
          console.log('Viewer Public ID:', response.viewer?.publicId);
        } else {
          console.log('\n❌ Failed:', response.error);
        }
        process.exit(0);
      } catch (e) {
        console.error('Error parsing response:', e.message);
        console.log('Raw response:', data);
        process.exit(1);
      }
    });
  });

  clientReq.on('error', (error) => {
    console.error('Client Creation Error:', error.message);
    process.exit(1);
  });

  clientReq.write(clientData);
  clientReq.end();
}
