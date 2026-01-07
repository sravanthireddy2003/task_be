# Chat Backend Integration Guide

## Overview

This guide shows how to integrate the chat backend into your existing Node.js/Express application.

## Files Created

1. **`Chat_Backend_API_Documentation.md`** - Complete API documentation with payloads and responses
2. **`chat_backend_only.js`** - Standalone backend implementation with Socket.IO and REST APIs

## Integration Steps

### 1. Database Migration

Run the migration to create chat tables:

```bash
node migrate.js
```

This creates the following tables:
- `project_chats` - Project chat rooms
- `chat_messages` - Chat messages with metadata
- `chat_participants` - Online user tracking

### 2. Integrate into Main Application

In your main `app.js` or `index.js`, add the chat backend:

```javascript
// app.js
const express = require('express');
const { chatService } = require('./chat_backend_only');

// Your existing app setup...
const app = express();

// ... your existing middleware and routes ...

// Initialize chat service
global.io = require('socket.io')(server);
chatService.setSocketIO(global.io);

// Add chat routes
const chatRouter = require('./chat_backend_only');
app.use('/api', chatRouter);

// ... rest of your app setup ...
```

### 3. Environment Variables

Add these to your `.env` file:

```env
NODE_ENV=development
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
SECRET=your_jwt_secret
PORT=4000
```

### 4. Start the Server

```bash
npm start
```

## API Endpoints

### REST APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/chat/messages` | Get chat messages |
| POST | `/api/projects/:projectId/chat/messages` | Send a message |
| GET | `/api/projects/:projectId/chat/participants` | Get online participants |
| GET | `/api/projects/:projectId/chat/stats` | Get chat statistics |
| DELETE | `/api/projects/:projectId/chat/messages/:messageId` | Delete a message |

### Socket.IO Events

#### Client → Server
- `join_project_chat` - Join a project chat room
- `leave_project_chat` - Leave a project chat room
- `send_message` - Send a message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `chatbot_command` - Send chatbot command

#### Server → Client
- `chat_message` - New message received
- `user_joined` - User joined the chat
- `user_left` - User left the chat
- `online_participants` - Online participants list
- `user_typing` - Typing status update
- `chatbot_response` - Bot response
- `error` - Error message

## Frontend Integration Example

### Socket.IO Client Setup

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: localStorage.getItem('authToken') }
});

// Join project chat
socket.emit('join_project_chat', 'PROJECT_123');

// Listen for messages
socket.on('chat_message', (message) => {
  console.log('New message:', message);
});

// Send message
socket.emit('send_message', {
  projectId: 'PROJECT_123',
  message: 'Hello team!'
});
```

### REST API Usage

```javascript
// Get messages
const response = await fetch('/api/projects/PROJECT_123/chat/messages', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const data = await response.json();

// Send message
const response = await fetch('/api/projects/PROJECT_123/chat/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ message: 'Hello!' })
});
```

## Chatbot Commands

Available commands:
- `/help` - Show help
- `/tasks` - Your assigned tasks
- `/status` - Chat statistics
- `/members` - Project members
- `/online` - Online members
- `/project` - Project info

## Security Features

- JWT authentication required for all connections
- Project-based access control
- Role-based permissions (Admin, Manager, Employee)
- Message validation and sanitization
- Rate limiting on socket events

## Testing

### Test with cURL

```bash
# Get messages
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/projects/PROJECT_123/chat/messages

# Send message
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Test message"}' \
  http://localhost:4000/api/projects/PROJECT_123/chat/messages
```

### Test with Socket.IO Client

```javascript
// Connect and join
socket.emit('join_project_chat', 'PROJECT_123');

// Send message
socket.emit('send_message', {
  projectId: 'PROJECT_123',
  message: 'Hello from test!'
});

// Listen for responses
socket.on('chat_message', (msg) => console.log(msg));
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use Redis adapter for Socket.IO scaling
3. Configure proper CORS settings
4. Set up monitoring and logging
5. Implement rate limiting
6. Use HTTPS/WSS for secure connections

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check JWT token validity
   - Verify server URL and port
   - Check CORS configuration

2. **Access Denied**
   - Verify user has project access
   - Check role permissions
   - Confirm project exists

3. **Messages Not Received**
   - Ensure proper room joining
   - Check Socket.IO client version
   - Verify network connectivity

## Support

For issues or questions:
1. Check the API documentation
2. Review server logs
3. Test with simple cURL commands
4. Verify database connectivity

The backend is now ready for frontend integration!