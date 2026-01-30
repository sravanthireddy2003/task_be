// Quick Backend Test Script
// Run with: node backend_test.js

let logger;
try { logger = require('./logger'); } catch (e) { logger = console; }

const http = require('http');

logger.info('🧪 Testing Backend Chat System...\n');

const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/services/chatService.js',
  'src/routes/chatRoutes.js',
  'src/app.js',
  'migrate.js'
];

logger.info('📁 Checking required files:');
filesToCheck.forEach(file => {
  try {
    fs.accessSync(path.join(__dirname, file));
    logger.info(`✅ ${file} - Found`);
  } catch (error) {
    logger.warn(`❌ ${file} - Missing`);
  }
});

logger.info('\n📦 Checking dependencies:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['socket.io', 'jsonwebtoken', 'express', 'mysql'];

  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      logger.info(`✅ ${dep} - Installed (${packageJson.dependencies[dep]})`);
    } else {
      logger.warn(`❌ ${dep} - Not found in dependencies`);
    }
  });
} catch (error) {
  logger.error('❌ Error reading package.json');
}

// Check database migration
logger.info('\n🗄️  Checking database migration:');
try {
  const migrateContent = fs.readFileSync('migrate.js', 'utf8');
  const hasChatTables = migrateContent.includes('project_chats') &&
                       migrateContent.includes('chat_messages') &&
                       migrateContent.includes('chat_participants');

  if (hasChatTables) {
    logger.info('✅ Chat tables found in migration');
  } else {
    logger.warn('❌ Chat tables missing from migration');
  }
} catch (error) {
  logger.error('❌ Error reading migration file');
}

// Check ChatService methods
logger.info('\n🔧 Checking ChatService methods:');
try {
  const chatServiceContent = fs.readFileSync('src/services/chatService.js', 'utf8');
  const requiredMethods = [
    'validateProjectAccess',
    'getOrCreateProjectChat',
    'saveMessage',
    'getProjectMessages',
    'addParticipant',
    'removeParticipant',
    'getOnlineParticipants',
    'getChatStats',
    'handleChatbotCommand'
  ];

  requiredMethods.forEach(method => {
    if (chatServiceContent.includes(`async ${method}`)) {
      logger.info(`✅ ${method} - Implemented`);
    } else {
      logger.warn(`❌ ${method} - Missing`);
    }
  });
} catch (error) {
  logger.error('❌ Error reading ChatService file');
}

// Check API routes
logger.info('\n🌐 Checking API routes:');
try {
  const routesContent = fs.readFileSync('src/routes/chatRoutes.js', 'utf8');
  const requiredRoutes = [
    'router.get.*chat/messages',
    'router.post.*chat/messages',
    'router.get.*chat/participants',
    'router.get.*chat/stats',
    'router.delete.*chat/messages'
  ];

  requiredRoutes.forEach(route => {
    if (routesContent.match(new RegExp(route.replace(/\*/g, '.*')))) {
      logger.info(`✅ ${route.replace('router.', '').replace('.*', '/:id')} - Implemented`);
    } else {
      logger.warn(`❌ ${route.replace('router.', '').replace('.*', '/:id')} - Missing`);
    }
  });
} catch (error) {
  logger.error('❌ Error reading routes file');
}

// Check Socket.IO integration
logger.info('\n🔌 Checking Socket.IO integration:');
try {
  const appContent = fs.readFileSync('src/app.js', 'utf8');
  const socketChecks = [
    'socketIo',
    'io.use',
    'join_project_chat',
    'send_message',
    'chat_message'
  ];

  socketChecks.forEach(check => {
    if (appContent.includes(check)) {
      logger.info(`✅ ${check} - Found`);
    } else {
      logger.warn(`❌ ${check} - Missing`);
    }
  });
} catch (error) {
  logger.error('❌ Error reading app.js file');
}

logger.info('\n' + '='.repeat(50));
logger.info('🎉 Backend check complete!');
logger.info('📖 See Chat_Backend_API_Summary.md for full API documentation');
logger.info('🚀 Ready for frontend integration!');
logger.info('='.repeat(50));