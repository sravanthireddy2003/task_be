# Real-Time Project Chat Backend API - Complete Reference

## Overview

Your backend already includes a comprehensive real-time chat system with the following components:

- **ChatService** (`src/services/chatService.js`) - Business logic for chat operations
- **Chat Routes** (`src/routes/chatRoutes.js`) - REST API endpoints
- **Socket.IO Integration** (`src/app.js`) - Real-time messaging
- **Database Tables** - `project_chats`, `chat_messages`, `chat_participants`

## Database Schema

```sql
-- Project chat rooms
CREATE TABLE project_chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  room_name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_id (project_id),
  INDEX idx_room_name (room_name)
);

-- Chat messages
CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  sender_id INT NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_type ENUM('text', 'system', 'bot') DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(_id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_sender_id (sender_id),
  INDEX idx_created_at (created_at),
  INDEX idx_message_type (message_type)
);

-- Online participants tracking
CREATE TABLE chat_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE,
  UNIQUE KEY unique_project_user (project_id, user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_is_online (is_online)
);
```

## REST API Endpoints

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### 1. Get Chat Messages
**GET** `/api/projects/:projectId/chat/messages`

**Query Parameters:**
- `limit` (optional): Number of messages (default: 50, max: 100)
- `offset` (optional): Skip messages (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": "PROJ_123",
      "sender_id": 45,
      "sender_name": "John Doe",
      "message": "Hello team!",
      "message_type": "text",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0
  }
}
```

**Error (403):**
```json
{
  "success": false,
  "error": "You do not have access to this project chat"
}
```

### 2. Send Chat Message
**POST** `/api/projects/:projectId/chat/messages`

**Request Body:**
```json
{
  "message": "Your message here"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 157,
    "project_id": "PROJ_123",
    "sender_id": 45,
    "sender_name": "John Doe",
    "message": "Your message here",
    "message_type": "text",
    "created_at": "2024-01-15T14:30:00.000Z"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "Message cannot be empty"
}
```

### 3. Get Online Participants
**GET** `/api/projects/:projectId/chat/participants`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "user_id": 45,
      "user_name": "John Doe",
      "user_role": "Manager",
      "last_seen": "2024-01-15T14:30:00.000Z"
    }
  ]
}
```

### 4. Get Chat Statistics
**GET** `/api/projects/:projectId/chat/stats`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_messages": 156,
    "unique_senders": 8,
    "bot_messages": 12,
    "online_participants": 2,
    "last_message_time": "2024-01-15T14:30:00.000Z"
  }
}
```

### 5. Delete Chat Message
**DELETE** `/api/projects/:projectId/chat/messages/:messageId`

**Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Error (403):**
```json
{
  "success": false,
  "error": "You can only delete your own messages"
}
```

## Socket.IO Real-Time Events

### Client Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: 'your_jwt_token' }
});
```

### Client → Server Events

#### Join Project Chat
```javascript
socket.emit('join_project_chat', 'PROJECT_ID');
```

#### Leave Project Chat
```javascript
socket.emit('leave_project_chat', 'PROJECT_ID');
```

#### Send Message
```javascript
socket.emit('send_message', {
  projectId: 'PROJECT_ID',
  message: 'Hello everyone!'
});
```

#### Typing Indicators
```javascript
socket.emit('typing_start', 'PROJECT_ID');
socket.emit('typing_stop', 'PROJECT_ID');
```

#### Chatbot Commands
```javascript
socket.emit('chatbot_command', {
  projectId: 'PROJECT_ID',
  command: '/help'
});
```

### Server → Client Events

#### Chat Message Received
```javascript
socket.on('chat_message', (message) => {
  console.log(message);
  // message: { id, project_id, sender_id, sender_name, message, message_type, created_at }
});
```

#### User Joined/Left
```javascript
socket.on('user_joined', (data) => {
  // data: { userId, userName, userRole, timestamp }
});

socket.on('user_left', (data) => {
  // data: { userId, userName, timestamp }
});
```

#### Online Participants Update
```javascript
socket.on('online_participants', (participants) => {
  // participants: array of online user objects
});
```

#### Typing Status
```javascript
socket.on('user_typing', (data) => {
  // data: { userId, userName, isTyping: true/false }
});
```

#### Message Deleted
```javascript
socket.on('message_deleted', (data) => {
  // data: { messageId, deleted_by }
});
```

#### Errors
```javascript
socket.on('error', (error) => {
  console.log('Error:', error.message);
});
```

## Chatbot Commands

Available commands (send via `chatbot_command` event):

- `/help` - Show available commands
- `/tasks` - List your assigned tasks
- `/status` - Show chat statistics
- `/members` - Show project members
- `/online` - Show online members
- `/project` - Show project information

## ChatService Methods

The backend includes these service methods:

```javascript
// Core functionality
validateProjectAccess(userId, projectId)
getOrCreateProjectChat(projectId)
saveMessage(projectId, senderId, senderName, message, messageType)
getProjectMessages(projectId, limit, offset)
addParticipant(projectId, userId, userName, userRole)
removeParticipant(projectId, userId)
getOnlineParticipants(projectId)
getChatStats(projectId)  // ✅ Added this method
handleChatbotCommand(projectId, command, userName)
sendSystemMessage(projectId, message)
sendBotMessage(projectId, message)
emitUserPresence(projectId, userName, action)
```

## Security & Access Control

- **JWT Authentication**: Required for all connections
- **Project Access Validation**: Users must be assigned to project tasks or be project manager
- **Role-Based Permissions**: Admin, Manager, Employee access levels
- **Message Ownership**: Users can only delete their own messages (except admins)

## Testing Examples

### cURL Commands

```bash
# Get messages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:4000/api/projects/PROJ_123/chat/messages?limit=10"

# Send message
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test message"}' \
  "http://localhost:4000/api/projects/PROJ_123/chat/messages"

# Get participants
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:4000/api/projects/PROJ_123/chat/participants"

# Get stats
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:4000/api/projects/PROJ_123/chat/stats"
```

### Socket.IO Testing

```javascript
// Connect and test
socket.emit('join_project_chat', 'PROJECT_ID');

// Send test message
socket.emit('send_message', {
  projectId: 'PROJECT_ID',
  message: 'Socket.IO test message'
});

// Test chatbot
socket.emit('chatbot_command', {
  projectId: 'PROJECT_ID',
  command: '/help'
});
```

## Integration Status

✅ **Database tables created** (run `node migrate.js`)  
✅ **ChatService implemented** with all methods  
✅ **REST API routes** configured  
✅ **Socket.IO integration** in app.js  
✅ **Authentication & authorization** working  
✅ **Chatbot commands** functional  
✅ **Real-time messaging** enabled  
✅ **Message deletion** implemented  
✅ **Statistics endpoint** added  

## Next Steps for Frontend

1. **Install Socket.IO client**: `npm install socket.io-client`
2. **Create chat UI components** with message display, input, and participant list
3. **Implement Socket.IO connection** with JWT authentication
4. **Handle real-time events** for messages, typing, and presence
5. **Add REST API calls** for message history and statistics
6. **Style the chat interface** with modern UI/UX

The backend is complete and ready for frontend integration!