// Chat Backend API Test Script
// Run with: node chat_api_test.js

const io = require('socket.io-client');
const fetch = require('node-fetch'); // npm install node-fetch

// Configuration
const BASE_URL = 'http://localhost:4000';
const PROJECT_ID = 'TEST_PROJECT_123'; // Replace with actual project ID
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual token

class ChatAPITester {
  constructor() {
    this.socket = null;
  }

  // Test REST API endpoints
  async testRESTAPIs() {
    console.log('🧪 Testing REST APIs...\n');

    try {
      // Test 1: Get chat messages
      console.log('1. Testing GET /api/projects/:projectId/chat/messages');
      const messagesResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/messages`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        console.log('✅ Messages retrieved:', messagesData.data?.length || 0, 'messages');
      } else {
        console.log('❌ Failed to get messages:', messagesResponse.status, messagesResponse.statusText);
      }

      // Test 2: Send a message
      console.log('\n2. Testing POST /api/projects/:projectId/chat/messages');
      const sendResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Test message from API at ${new Date().toISOString()}`
        })
      });

      if (sendResponse.ok) {
        const sendData = await sendResponse.json();
        console.log('✅ Message sent:', sendData.data?.id);
      } else {
        console.log('❌ Failed to send message:', sendResponse.status, sendResponse.statusText);
      }

      // Test 3: Get participants
      console.log('\n3. Testing GET /api/projects/:projectId/chat/participants');
      const participantsResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/participants`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (participantsResponse.ok) {
        const participantsData = await participantsResponse.json();
        console.log('✅ Participants retrieved:', participantsData.data?.length || 0, 'online');
      } else {
        console.log('❌ Failed to get participants:', participantsResponse.status, participantsResponse.statusText);
      }

      // Test 4: Get chat statistics
      console.log('\n4. Testing GET /api/projects/:projectId/chat/stats');
      const statsResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/stats`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        console.log('✅ Chat stats:', statsData.data);
      } else {
        console.log('❌ Failed to get stats:', statsResponse.status, statsResponse.statusText);
      }

    } catch (error) {
      console.error('❌ REST API test error:', error.message);
    }
  }

  // Test Socket.IO real-time features
  async testSocketIO() {
    console.log('\n🔌 Testing Socket.IO...\n');

    return new Promise((resolve) => {
      // Connect to Socket.IO
      this.socket = io(BASE_URL, {
        auth: { token: JWT_TOKEN }
      });

      this.socket.on('connect', () => {
        console.log('✅ Connected to Socket.IO server');

        // Test 1: Join project chat
        console.log('1. Joining project chat...');
        this.socket.emit('join_project_chat', PROJECT_ID);
      });

      this.socket.on('online_participants', (participants) => {
        console.log('✅ Online participants received:', participants.length, 'users');

        // Test 2: Send a message
        setTimeout(() => {
          console.log('2. Sending test message...');
          this.socket.emit('send_message', {
            projectId: PROJECT_ID,
            message: `Real-time test message at ${new Date().toLocaleTimeString()}`
          });
        }, 1000);

        // Test 3: Test chatbot command
        setTimeout(() => {
          console.log('3. Testing chatbot command...');
          this.socket.emit('chatbot_command', {
            projectId: PROJECT_ID,
            command: '/help'
          });
        }, 2000);

        // Test 4: Test typing indicators
        setTimeout(() => {
          console.log('4. Testing typing indicators...');
          this.socket.emit('typing_start', PROJECT_ID);

          setTimeout(() => {
            this.socket.emit('typing_stop', PROJECT_ID);
          }, 1000);
        }, 3000);
      });

      this.socket.on('chat_message', (message) => {
        console.log('📨 Message received:', message.sender_name, ':', message.message.substring(0, 50) + '...');
      });

      this.socket.on('user_typing', (data) => {
        console.log('⌨️  Typing status:', data.userName, data.isTyping ? 'started' : 'stopped');
      });

      this.socket.on('error', (error) => {
        console.log('❌ Socket error:', error.message);
      });

      // Disconnect after 10 seconds
      setTimeout(() => {
        console.log('5. Leaving project chat...');
        this.socket.emit('leave_project_chat', PROJECT_ID);

        setTimeout(() => {
          console.log('6. Disconnecting...');
          this.socket.disconnect();
          resolve();
        }, 1000);
      }, 10000);
    });
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Chat Backend API Tests\n');
    console.log('=' .repeat(50));

    try {
      await this.testRESTAPIs();
      await this.testSocketIO();

      console.log('\n' + '=' .repeat(50));
      console.log('✅ All tests completed!');
      console.log('\n📝 Notes:');
      console.log('- Make sure the server is running on', BASE_URL);
      console.log('- Replace JWT_TOKEN with a valid token');
      console.log('- Replace PROJECT_ID with an actual project ID');
      console.log('- Check server logs for detailed error information');

    } catch (error) {
      console.error('❌ Test suite error:', error.message);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new ChatAPITester();
  tester.runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = ChatAPITester;