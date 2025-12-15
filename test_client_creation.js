const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjNTEwYjJkZDBlMzExZjA4OGMyMDAxNTVkYWVkZjUwIiwiaWF0IjoxNzY0ODQxMzIxLCJleHAiOjE3NjQ4NzAxMjF9.N39Dd_oDeM20NiYHHWeyep-WqCuXxuFZeWRHN92WL5';

const clientData = {
  "name": "Test Client Ashwini",
  "company": "NMIT Solutions",
  "createViewer": true,
  "contacts": [
    {
      "name": "Ashwini M",
      "email": "ashwini.m@nmit-solutions.com"
    }
  ]
};

const postData = JSON.stringify(clientData);

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/clients',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(postData);
req.end();
