#!/usr/bin/env node

const http = require('http');

const ADMIN_EMAIL = 'korapatiashwini@gmail.com';
const ADMIN_PASSWORD = 'admin123';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         GET USERS ENDPOINT TEST - ADMIN ACCESS             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Step 1: Login as Admin
console.log('🔑 Step 1: Logging in as Admin...');
login(ADMIN_EMAIL, ADMIN_PASSWORD)
  .then(token => {
    if (!token) {
      console.error('❌ Login failed');
      process.exit(1);
    }
    console.log('✅ Login successful');
    console.log(`   Token: ${token.substring(0, 30)}...\n`);

    // Step 2: Get users
    console.log('👥 Step 2: Fetching users list...');
    return getUsers(token);
  })
  .then(users => {
    console.log('✅ Users fetched successfully\n');
    
    if (users && users.length > 0) {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                     USERS LIST                             ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      
      console.table(users.map(u => ({
        'ID': u.id ? u.id.substring(0, 16) + '...' : 'N/A',
        'Name': u.name,
        'Email': u.email,
        'Role': u.role,
        'Phone': u.phone || 'N/A',
        'Active': u.isActive ? '✅' : '❌',
        'Created': new Date(u.createdAt).toLocaleDateString()
      })));

      console.log(`\n📊 Total Users: ${users.length}\n`);
      
      // Show details for admin users
      const admins = users.filter(u => u.role === 'Admin');
      if (admins.length > 0) {
        console.log('👨‍💼 Admin Users:');
        admins.forEach(admin => {
          console.log(`   • ${admin.name} (${admin.email})`);
        });
        console.log();
      }
    } else {
      console.log('No users found in database\n');
    }

    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });

function login(email, password) {
  return new Promise((resolve, reject) => {
    const loginData = JSON.stringify({ email, password });

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.token) {
            resolve(response.token);
          } else {
            reject(new Error(response.message || 'Login failed'));
          }
        } catch (e) {
          reject(new Error('Failed to parse login response'));
        }
      });
    });

    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
}

function getUsers(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/users/getusers',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(response);
          } else {
            reject(new Error(response.message || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('Failed to parse users response'));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}
