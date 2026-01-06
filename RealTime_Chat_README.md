# Real-Time Project-Based Team Chat System

## Overview

A comprehensive real-time chat system for project management applications, featuring project-based rooms, role-based access control, chatbot functionality, and modern React components.

## Features

### Core Features
- **Project-Based Chat Rooms**: Each project has its own isolated chat room
- **Real-Time Messaging**: Instant message delivery using Socket.IO
- **Role-Based Access**: Different permissions for Admin, Manager, Employee, and Client roles
- **Chatbot Integration**: Built-in bot commands for project information
- **Message History**: Persistent storage and retrieval of chat messages
- **Online Status**: Real-time tracking of online participants
- **Typing Indicators**: See when others are typing
- **System Messages**: Automatic notifications for user join/leave events

### Technical Features
- JWT Authentication for socket connections
- MySQL database with optimized indexes
- RESTful API endpoints for message history
- Comprehensive error handling
- Scalable architecture with room-based isolation

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend │    │   Socket.IO     │    │   Express API   │
│                 │◄──►│   Real-time     │◄──►│                 │
│ - Chat Components│    │   Messaging     │    │ - REST Endpoints│
│ - Message Input  │    │                 │    │ - Auth Middleware│
│ - Online Status  │    │ - Room Mgmt     │    │ - Chat Service   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   MySQL Database │
                       │                 │
                       │ - project_chats │
                       │ - chat_messages │
                       │ - chat_participants│
                       └─────────────────┘
```

## Database Schema

### project_chats
```sql
CREATE TABLE project_chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  room_name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_id (project_id),
  INDEX idx_room_name (room_name)
);
```

### chat_messages
```sql
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
```

### chat_participants
```sql
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

## Backend Implementation

### 1. Database Migration

Run the migration to create chat tables:

```bash
node migrate.js
```

### 2. Socket.IO Server Setup

The chat system uses Socket.IO with JWT authentication and project-based rooms:

```javascript
// In app.js - Socket.IO is already configured
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  try {
    const decoded = jwt.verify(token, process.env.SECRET || 'secret');
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});
```

### 3. Chat Service

The `ChatService` handles all chat-related operations:

```javascript
const ChatService = require('./services/chatService');

// Validate project access
const hasAccess = await ChatService.validateProjectAccess(userId, projectId);

// Save message
const message = await ChatService.saveMessage(projectId, senderId, senderName, message, type);

// Handle bot commands
const response = await ChatService.handleChatbotCommand(projectId, command, userName);
```

### 4. API Endpoints

#### Get Chat Messages
```http
GET /api/projects/:projectId/chat/messages?limit=50&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": "proj_123",
      "sender_id": 45,
      "sender_name": "John Doe",
      "message": "Hello team!",
      "message_type": "text",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Send Message
```http
POST /api/projects/:projectId/chat/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Hello everyone!"
}
```

#### Get Online Participants
```http
GET /api/projects/:projectId/chat/participants
Authorization: Bearer <token>
```

#### Get Chat Statistics
```http
GET /api/projects/:projectId/chat/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_messages": 150,
    "unique_senders": 8,
    "bot_messages": 12,
    "online_participants": 3,
    "last_message_time": "2024-01-15T14:30:00Z"
  }
}
```

## Frontend Implementation

### 1. Install Dependencies

```bash
npm install socket.io-client
```

### 2. ChatAPI Service

```javascript
class ChatAPI {
  constructor(baseURL = 'http://localhost:4000') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  async getMessages(projectId, limit = 50, offset = 0) {
    return this.request(`/api/projects/${projectId}/chat/messages?limit=${limit}&offset=${offset}`);
  }

  async sendMessage(projectId, message) {
    return this.request(`/api/projects/${projectId}/chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }
}
```

### 3. Socket.IO Client Setup

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: localStorage.getItem('authToken') }
});

// Join project chat
socket.emit('join_project_chat', projectId);

// Listen for messages
socket.on('chat_message', (message) => {
  setMessages(prev => [...prev, message]);
});

// Send message
socket.emit('send_message', {
  projectId,
  message: 'Hello!'
});
```

### 4. React Components

#### ProjectChat Component

```jsx
function ProjectChat({ projectId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    initializeChat();
    return () => socket?.disconnect();
  }, [projectId]);

  // ... implementation
}
```

#### Usage in Project Detail Page

```jsx
// In your ProjectDetail component
import { ProjectChat } from './ProjectChat_Components';

function ProjectDetail({ projectId }) {
  return (
    <div className="project-detail">
      {/* Other project content */}
      <ProjectChat
        projectId={projectId}
        currentUser={currentUser}
      />
    </div>
  );
}
```

## Chatbot Commands

The built-in chatbot responds to these commands:

### Available Commands

- **/help** - Show available commands
- **/tasks** - List your assigned tasks
- **/status** - Show project status
- **/members** - Show project members
- **/online** - Show online members

### Command Examples

```
/help
/tasks
/status
/members
/online
```

### Bot Response Example

```
🤖 ChatBot
Your assigned tasks:
• Implement User Authentication (In Progress, High priority)
• Design Database Schema (To Do, Medium priority)
• Create API Documentation (Completed, Low priority)
```

## Socket.IO Events

### Client to Server Events

#### Join Project Chat
```javascript
socket.emit('join_project_chat', projectId);
```

#### Leave Project Chat
```javascript
socket.emit('leave_project_chat', projectId);
```

#### Send Message
```javascript
socket.emit('send_message', {
  projectId: 'proj_123',
  message: 'Hello team!'
});
```

#### Typing Indicators
```javascript
socket.emit('typing_start', projectId);
socket.emit('typing_stop', projectId);
```

### Server to Client Events

#### Chat Message
```javascript
socket.on('chat_message', (message) => {
  // message object with id, sender_name, message, etc.
});
```

#### User Joined
```javascript
socket.on('user_joined', (data) => {
  // data: { userId, userName, userRole, timestamp }
});
```

#### User Left
```javascript
socket.on('user_left', (data) => {
  // data: { userId, userName, timestamp }
});
```

#### Online Participants
```javascript
socket.on('online_participants', (participants) => {
  // array of online participant objects
});
```

#### Typing Indicator
```javascript
socket.on('user_typing', (data) => {
  // data: { userId, userName, isTyping: true/false }
});
```

#### Error
```javascript
socket.on('error', (error) => {
  // error object with message
});
```

## Security Features

### Authentication
- JWT token required for socket connection
- Token validated on every connection
- User identity verified before room access

### Authorization
- Project membership validated before chat access
- Role-based permissions enforced
- Message sender verification

### Data Validation
- Input sanitization for messages
- SQL injection prevention
- XSS protection

## Performance Optimization

### Database Indexes
- Optimized indexes on frequently queried columns
- Composite indexes for complex queries
- Efficient pagination support

### Real-time Optimization
- Room-based message isolation
- Efficient participant tracking
- Typing indicator throttling

### Frontend Optimization
- Message virtualization for large chat histories
- Optimistic UI updates
- Connection state management

## Error Handling

### Connection Errors
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Show reconnection UI
});
```

### Message Send Errors
```javascript
try {
  await sendMessage(message);
} catch (error) {
  // Show error toast
  // Revert optimistic update
}
```

### API Errors
```javascript
// All API calls return consistent error format
{
  success: false,
  error: "Detailed error message"
}
```

## Testing

### Unit Tests

```javascript
describe('ChatService', () => {
  test('should validate project access', async () => {
    const hasAccess = await ChatService.validateProjectAccess(userId, projectId);
    expect(hasAccess).toBe(true);
  });

  test('should save message correctly', async () => {
    const message = await ChatService.saveMessage(projectId, senderId, senderName, message);
    expect(message.id).toBeDefined();
  });
});
```

### Integration Tests

```javascript
describe('Chat API', () => {
  test('should send and receive messages', async () => {
    // Connect socket
    // Send message
    // Verify message received
    // Check database storage
  });
});
```

## Deployment Considerations

### Environment Variables
```env
NODE_ENV=production
PORT=4000
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
SECRET=your_jwt_secret
```

### Scaling
- Use Redis adapter for Socket.IO clustering
- Implement message persistence queue
- Consider horizontal scaling for high traffic

### Monitoring
- Socket connection metrics
- Message throughput monitoring
- Error rate tracking
- Database performance monitoring

## Troubleshooting

### Common Issues

1. **Socket Connection Failed**
   - Check JWT token validity
   - Verify server URL and port
   - Check CORS configuration

2. **Messages Not Received**
   - Verify project membership
   - Check room joining logic
   - Confirm Socket.IO client version compatibility

3. **Database Connection Errors**
   - Verify database credentials
   - Check connection pool settings
   - Monitor database performance

4. **High Memory Usage**
   - Implement message history pagination
   - Clear old socket connections
   - Monitor participant cleanup

## API Reference

### ChatService Methods

#### validateProjectAccess(userId, projectId)
Validates if a user can access a project's chat.

#### getOrCreateProjectChat(projectId)
Creates or retrieves a project chat room.

#### saveMessage(projectId, senderId, senderName, message, messageType)
Saves a message to the database.

#### getProjectMessages(projectId, limit, offset)
Retrieves paginated message history.

#### handleChatbotCommand(projectId, command, userName)
Processes chatbot commands and returns responses.

#### addParticipant(projectId, userId, userName, userRole)
Adds a user to the online participants list.

#### removeParticipant(projectId, userId)
Removes a user from the online participants list.

### Socket Event Handlers

#### join_project_chat
Joins a user to a project chat room.

#### leave_project_chat
Removes a user from a project chat room.

#### send_message
Sends a message to all room participants.

#### typing_start / typing_stop
Manages typing indicators.

## Contributing

1. Follow the established code patterns
2. Add comprehensive error handling
3. Include unit tests for new features
4. Update documentation for API changes
5. Test real-time functionality thoroughly

## License

This chat system is part of the Task Management application and follows the same licensing terms.

---

## Quick Start

1. **Run Migration**: `node migrate.js`
2. **Start Server**: `npm start`
3. **Import Components**: Copy `ProjectChat_Components.jsx` and `ProjectChat_Styles.css`
4. **Add to Project Page**: `<ProjectChat projectId={projectId} currentUser={user} />`
5. **Test Chat**: Open multiple browser tabs and start chatting!

The system is production-ready and includes all the features needed for a modern, scalable team chat solution.