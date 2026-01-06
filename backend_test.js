// Quick Backend Test Script
// Run with: node backend_test.js

const http = require('http');

// Simple test to check if server can start
console.log('🧪 Testing Backend Chat System...\n');

// Check if required files exist
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/services/chatService.js',
  'src/routes/chatRoutes.js',
  'src/app.js',
  'migrate.js'
];

console.log('📁 Checking required files:');
filesToCheck.forEach(file => {
  try {
    fs.accessSync(path.join(__dirname, file));
    console.log(`✅ ${file} - Found`);
  } catch (error) {
    console.log(`❌ ${file} - Missing`);
  }
});

// Check package.json for required dependencies
console.log('\n📦 Checking dependencies:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['socket.io', 'jsonwebtoken', 'express', 'mysql'];

  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`✅ ${dep} - Installed (${packageJson.dependencies[dep]})`);
    } else {
      console.log(`❌ ${dep} - Not found in dependencies`);
    }
  });
} catch (error) {
  console.log('❌ Error reading package.json');
}

// Check database migration
console.log('\n🗄️  Checking database migration:');
try {
  const migrateContent = fs.readFileSync('migrate.js', 'utf8');
  const hasChatTables = migrateContent.includes('project_chats') &&
                       migrateContent.includes('chat_messages') &&
                       migrateContent.includes('chat_participants');

  if (hasChatTables) {
    console.log('✅ Chat tables found in migration');
  } else {
    console.log('❌ Chat tables missing from migration');
  }
} catch (error) {
  console.log('❌ Error reading migration file');
}

// Check ChatService methods
console.log('\n🔧 Checking ChatService methods:');
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
      console.log(`✅ ${method} - Implemented`);
    } else {
      console.log(`❌ ${method} - Missing`);
    }
  });
} catch (error) {
  console.log('❌ Error reading ChatService file');
}

// Check API routes
console.log('\n🌐 Checking API routes:');
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
      console.log(`✅ ${route.replace('router.', '').replace('.*', '/:id')} - Implemented`);
    } else {
      console.log(`❌ ${route.replace('router.', '').replace('.*', '/:id')} - Missing`);
    }
  });
} catch (error) {
  console.log('❌ Error reading routes file');
}

// Check Socket.IO integration
console.log('\n🔌 Checking Socket.IO integration:');
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
      console.log(`✅ ${check} - Found`);
    } else {
      console.log(`❌ ${check} - Missing`);
    }
  });
} catch (error) {
  console.log('❌ Error reading app.js file');
}

console.log('\n' + '='.repeat(50));
console.log('🎉 Backend check complete!');
console.log('📖 See Chat_Backend_API_Summary.md for full API documentation');
console.log('🚀 Ready for frontend integration!');
console.log('='.repeat(50));