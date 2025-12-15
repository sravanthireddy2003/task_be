const http = require('http');

function attemptLogin(email, password) {
  return new Promise((resolve) => {
    const loginData = JSON.stringify({
      "email": email,
      "password": password
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

    const loginReq = http.request(loginOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, response });
        } catch (e) {
          resolve({ status: res.statusCode, response: data });
        }
      });
    });

    loginReq.on('error', (error) => {
      resolve({ error: error.message });
    });

    loginReq.write(loginData);
    loginReq.end();
  });
}

async function test() {
  const passwords = ['Admin@123', 'admin', 'password', 'Admin@456', '12345678'];
  const email = 'korapatiashwini@gmail.com';
  
  console.log(`Testing login with email: ${email}\n`);
  
  for (const pwd of passwords) {
    console.log(`Trying password: ${pwd}...`);
    const result = await attemptLogin(email, pwd);
    console.log(`Status: ${result.status}`);
    
    if (result.response && result.response.token) {
      console.log('✅ SUCCESS! Token received');
      return result.response.token;
    } else {
      console.log('Response:', JSON.stringify(result.response).substring(0, 100));
    }
    console.log();
  }
  
  console.log('❌ All passwords failed');
  process.exit(1);
}

test();
