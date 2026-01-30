// Chat Backend API Test Script
// Run with: node chat_api_test.js

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

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
    logger.info('🧪 Testing REST APIs...\n');

    try {
      // Test 1: Get chat messages
      logger.info('1. Testing GET /api/projects/:projectId/chat/messages');
      const messagesResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/messages`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        logger.info('✅ Messages retrieved:', messagesData.data?.length || 0, 'messages');
      } else {
        logger.warn('❌ Failed to get messages:', messagesResponse.status, messagesResponse.statusText);
      }

      // Test 2: Send a message
      logger.info('\n2. Testing POST /api/projects/:projectId/chat/messages');
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
        logger.info('✅ Message sent:', sendData.data?.id);
      } else {
        logger.warn('❌ Failed to send message:', sendResponse.status, sendResponse.statusText);
      }

      // Test 3: Get participants
      logger.info('\n3. Testing GET /api/projects/:projectId/chat/participants');
      const participantsResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/participants`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (participantsResponse.ok) {
        const participantsData = await participantsResponse.json();
        logger.info('✅ Participants retrieved:', participantsData.data?.length || 0, 'online');
      } else {
        logger.warn('❌ Failed to get participants:', participantsResponse.status, participantsResponse.statusText);
      }

      // Test 4: Get chat statistics
      logger.info('\n4. Testing GET /api/projects/:projectId/chat/stats');
      const statsResponse = await fetch(`${BASE_URL}/api/projects/${PROJECT_ID}/chat/stats`, {
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`
        }
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        logger.info('✅ Chat stats:', statsData.data);
      } else {
        logger.warn('❌ Failed to get stats:', statsResponse.status, statsResponse.statusText);
      }

    } catch (error) {
      logger.error('❌ REST API test error:', error.message);
    }
  }

  // Test Socket.IO real-time features
  async testSocketIO() {
    logger.info('\n🔌 Testing Socket.IO...\n');

    return new Promise((resolve) => {
      // Connect to Socket.IO
      this.socket = io(BASE_URL, {
        auth: { token: JWT_TOKEN }
      });

      this.socket.on('connect', () => {
        logger.info('✅ Connected to Socket.IO server');

        // Test 1: Join project chat
        logger.info('1. Joining project chat...');
        this.socket.emit('join_project_chat', PROJECT_ID);
      });

      this.socket.on('online_participants', (participants) => {
        logger.info('✅ Online participants received:', participants.length, 'users');

        // Test 2: Send a message
        setTimeout(() => {
          logger.info('2. Sending test message...');
          this.socket.emit('send_message', {
            projectId: PROJECT_ID,
            message: `Real-time test message at ${new Date().toLocaleTimeString()}`
          });
        }, 1000);

        // Test 3: Test chatbot command
        setTimeout(() => {
          logger.info('3. Testing chatbot command...');
          this.socket.emit('chatbot_command', {
            projectId: PROJECT_ID,
            command: '/help'
          });
        }, 2000);

        // Test 4: Test typing indicators
        setTimeout(() => {
          logger.info('4. Testing typing indicators...');
          this.socket.emit('typing_start', PROJECT_ID);

          setTimeout(() => {
            this.socket.emit('typing_stop', PROJECT_ID);
          }, 1000);
        }, 3000);
      });

      this.socket.on('chat_message', (message) => {
        logger.info('📨 Message received:', message.sender_name, ':', message.message.substring(0, 50) + '...');
      });

      this.socket.on('user_typing', (data) => {
        logger.info('⌨️  Typing status:', data.userName, data.isTyping ? 'started' : 'stopped');
      });

      this.socket.on('error', (error) => {
        logger.error('❌ Socket error:', error.message);
      });

      // Disconnect after 10 seconds
      setTimeout(() => {
        logger.info('5. Leaving project chat...');
        this.socket.emit('leave_project_chat', PROJECT_ID);

        setTimeout(() => {
          logger.info('6. Disconnecting...');
          this.socket.disconnect();
          resolve();
        }, 1000);
      }, 10000);
    });
  }

  // Run all tests
  async runAllTests() {
    logger.info('🚀 Starting Chat Backend API Tests\n');
    logger.info('=' .repeat(50));

    try {
      await this.testRESTAPIs();
      await this.testSocketIO();

      logger.info('\n' + '=' .repeat(50));
      logger.info('✅ All tests completed!');
      logger.info('\n📝 Notes:');
      logger.info('- Make sure the server is running on', BASE_URL);
      logger.info('- Replace JWT_TOKEN with a valid token');
      logger.info('- Replace PROJECT_ID with an actual project ID');
      logger.info('- Check server logs for detailed error information');

    } catch (error) {
      logger.error('❌ Test suite error:', error.message);
    }
  }
}

if (require.main === module) {
  const tester = new ChatAPITester();
  tester.runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = ChatAPITester;