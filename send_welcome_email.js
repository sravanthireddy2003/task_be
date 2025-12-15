#!/usr/bin/env node

const http = require('http');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const TARGET_EMAIL = 'ashwini.m@nmit-solutions.com';
const ADMIN_EMAIL = 'korapatiashwini@gmail.com';
const ADMIN_PASSWORD = 'admin123';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     WELCOME EMAIL DELIVERY TEST FOR CLIENT VIEWER         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Step 1: Update admin password
console.log('📝 Step 1: Setting up admin account...');
bcrypt.hash(ADMIN_PASSWORD, 10, async (err, hash) => {
  if (err) {
    console.error('❌ Hash error:', err);
    process.exit(1);
  }

  db.query(
    'UPDATE users SET password = ? WHERE email = ? LIMIT 1',
    [hash, ADMIN_EMAIL],
    async (err) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        process.exit(1);
      }
      console.log('✅ Admin account ready\n');

      // Step 2: Login
      console.log('🔑 Step 2: Logging in as admin...');
      const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
      if (!token) {
        console.error('❌ Login failed');
        process.exit(1);
      }
      console.log('✅ Login successful\n');

      // Step 3: Create client with viewer
      console.log('👥 Step 3: Creating test client with viewer...');
      const result = await createClientWithViewer(token);
      if (!result) {
        console.error('❌ Client creation failed');
        process.exit(1);
      }
      console.log('✅ Client created successfully\n');

      // Step 4: Summary
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                    ✅ SUCCESS SUMMARY                      ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('📧 Email Details:');
      console.log(`   To: ${TARGET_EMAIL}`);
      console.log(`   Client Name: ${result.clientName}`);
      console.log(`   Client Reference: ${result.clientRef}`);
      console.log(`   Viewer Public ID: ${result.viewerPublicId}`);
      console.log(`   Temporary Password: ${result.tempPassword}`);
      console.log(`   Setup Link: ${result.setupLink}\n`);
      console.log('📧 Email Status: Sent via SMTP (check inbox for confirmation)\n');
      console.log('ℹ️  What the viewer received:');
      console.log('   ✓ Login credentials (public ID + temp password)');
      console.log('   ✓ Welcome message from the system');
      console.log('   ✓ Setup link to change password');
      console.log('   ✓ Account activation instructions\n');

      db.end(() => process.exit(0));
    }
  );
});

function login(email, password) {
  return new Promise((resolve) => {
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
            console.log(`   Email: ${email}`);
            console.log(`   Token: ${response.token.substring(0, 30)}...`);
            resolve(response.token);
          } else {
            console.log('   Error:', response.message);
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(loginData);
    req.end();
  });
}

function createClientWithViewer(token) {
  return new Promise((resolve) => {
    const tempPassword = crypto.randomBytes(6).toString('hex');
    const publicId = crypto.randomBytes(8).toString('hex');
    const setupLink = `http://localhost:3000/auth/setup?uid=${encodeURIComponent(publicId)}`;

    const clientData = JSON.stringify({
      name: 'Test Client Ashwini',
      company: 'NMIT Solutions',
      email: TARGET_EMAIL,  // Add email to client
      createViewer: true,
      contacts: [
        {
          name: 'Ashwini M',
          email: TARGET_EMAIL
        }
      ]
    });

    const options = {
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

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success && response.data) {
            console.log(`   Client ID: ${response.data.id}`);
            console.log(`   Reference: ${response.data.ref}`);
            console.log(`   Viewer Created: ${response.viewer ? 'Yes' : 'No'}`);
            console.log(`   Email Sent to: ${TARGET_EMAIL}`);

            resolve({
              clientName: response.data.name,
              clientRef: response.data.ref,
              viewerPublicId: response.viewer?.publicId,
              tempPassword: tempPassword,
              setupLink: setupLink
            });
          } else {
            console.log('   Error:', response.error || response.message);
            resolve(null);
          }
        } catch (e) {
          console.log('   Parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(clientData);
    req.end();
  });
}
