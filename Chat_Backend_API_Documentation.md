# Real-Time Project Chat Backend API Documentation

## Overview

This document provides comprehensive API documentation for the Real-Time Project Chat Backend system. The system includes REST APIs for chat management and Socket.IO for real-time messaging.

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

## Authentication

All API endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## REST API Endpoints

### Base URL
```
http://localhost:4000/api/projects
```

---

## 1. Get Chat Messages

**Endpoint:** `GET /api/projects/:projectId/chat/messages`

**Description:** Retrieve paginated chat messages for a specific project.

**Authentication:** Required (Admin, Manager, Employee roles)

**Query Parameters:**
- `limit` (optional): Number of messages to retrieve (default: 50, max: 100)
- `offset` (optional): Number of messages to skip (default: 0)

**Request Example:**
```bash
GET /api/projects/PROJ_123/chat/messages?limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": "PROJ_123",
      "sender_id": 45,
      "sender_name": "John Doe",
      "message": "Hello team! How is the project progressing?",
      "message_type": "text",
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "project_id": "PROJ_123",
      "sender_id": 51,
      "sender_name": "Jane Smith",
      "message": "Good morning! The API development is almost complete.",
      "message_type": "text",
      "created_at": "2024-01-15T10:35:00.000Z"
    },
    {
      "id": 3,
      "project_id": "PROJ_123",
      "sender_id": 0,
      "sender_name": "ChatBot",
      "message": "🤖 Welcome to the project chat! Type /help for available commands.",
      "message_type": "bot",
      "created_at": "2024-01-15T09:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 156
  }
}
```

**Error Responses:**

**403 Forbidden - No Access:**
```json
{
  "success": false,
  "error": "You do not have access to this project chat"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Failed to retrieve chat messages"
}
```

---

## 2. Send Chat Message

**Endpoint:** `POST /api/projects/:projectId/chat/messages`

**Description:** Send a new message to a project chat.

**Authentication:** Required (Admin, Manager, Employee roles)

**Request Body:**
```json
{
  "message": "This is my message to the team"
}
```

**Request Example:**
```bash
POST /api/projects/PROJ_123/chat/messages
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "message": "The database migration is now complete!"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 157,
    "project_id": "PROJ_123",
    "sender_id": 45,
    "sender_name": "John Doe",
    "message": "The database migration is now complete!",
    "message_type": "text",
    "created_at": "2024-01-15T14:30:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request - Empty Message:**
```json
{
  "success": false,
  "error": "Message cannot be empty"
}
```

**403 Forbidden - No Access:**
```json
{
  "success": false,
  "error": "You do not have access to send messages in this project"
}
```

---

## 3. Get Online Participants

**Endpoint:** `GET /api/projects/:projectId/chat/participants`

**Description:** Get list of currently online participants in a project chat.

**Authentication:** Required (Admin, Manager, Employee roles)

**Request Example:**
```bash
GET /api/projects/PROJ_123/chat/participants
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": "PROJ_123",
      "user_id": 45,
      "user_name": "John Doe",
      "user_role": "Manager",
      "joined_at": "2024-01-15T09:15:00.000Z",
      "last_seen": "2024-01-15T14:30:00.000Z",
      "is_online": true
    },
    {
      "id": 2,
      "project_id": "PROJ_123",
      "user_id": 51,
      "user_name": "Jane Smith",
      "user_role": "Employee",
      "joined_at": "2024-01-15T10:00:00.000Z",
      "last_seen": "2024-01-15T14:25:00.000Z",
      "is_online": true
    }
  ],
  "online_count": 2
}
```

---

## 4. Get Chat Statistics

**Endpoint:** `GET /api/projects/:projectId/chat/stats`

**Description:** Get statistics about a project chat.

**Authentication:** Required (Admin, Manager, Employee roles)

**Request Example:**
```bash
GET /api/projects/PROJ_123/chat/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total_messages": 156,
    "unique_senders": 8,
    "bot_messages": 12,
    "online_participants": 2,
    "last_message_time": "2024-01-15T14:30:00.000Z",
    "messages_today": 23,
    "messages_this_week": 89
  }
}
```

---

## 5. Delete Chat Message

**Endpoint:** `DELETE /api/projects/:projectId/chat/messages/:messageId`

**Description:** Delete a specific chat message (Admin only or message owner).

**Authentication:** Required (Admin role or message sender)

**Request Example:**
```bash
DELETE /api/projects/PROJ_123/chat/messages/157
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Error Responses:**

**403 Forbidden - Not Authorized:**
```json
{
  "success": false,
  "error": "You can only delete your own messages or you need admin privileges"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Message not found"
}
```

---

## Socket.IO Real-Time Events

### Connection Setup

**Client Connection:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

### Client to Server Events

#### 1. Join Project Chat

**Event:** `join_project_chat`

**Payload:**
```json
"PROJ_123"
```

**Description:** Join a project chat room.

**Example:**
```javascript
socket.emit('join_project_chat', 'PROJ_123');
```

#### 2. Leave Project Chat

**Event:** `leave_project_chat`

**Payload:**
```json
"PROJ_123"
```

**Description:** Leave a project chat room.

**Example:**
```javascript
socket.emit('leave_project_chat', 'PROJ_123');
```

#### 3. Send Message

**Event:** `send_message`

**Payload:**
```json
{
  "projectId": "PROJ_123",
  "message": "Hello everyone!"
}
```

**Description:** Send a message to all participants in the project chat.

**Example:**
```javascript
socket.emit('send_message', {
  projectId: 'PROJ_123',
  message: 'The deployment is ready for testing!'
});
```

#### 4. Typing Start

**Event:** `typing_start`

**Payload:**
```json
"PROJ_123"
```

**Description:** Indicate that the user started typing.

**Example:**
```javascript
socket.emit('typing_start', 'PROJ_123');
```

#### 5. Typing Stop

**Event:** `typing_stop`

**Payload:**
```json
"PROJ_123"
```

**Description:** Indicate that the user stopped typing.

**Example:**
```javascript
socket.emit('typing_stop', 'PROJ_123');
```

#### 6. Send Chatbot Command

**Event:** `chatbot_command`

**Payload:**
```json
{
  "projectId": "PROJ_123",
  "command": "/tasks"
}
```

**Description:** Send a command to the chatbot.

**Example:**
```javascript
socket.emit('chatbot_command', {
  projectId: 'PROJ_123',
  command: '/help'
});
```

### Server to Client Events

#### 1. Chat Message

**Event:** `chat_message`

**Payload:**
```json
{
  "id": 157,
  "project_id": "PROJ_123",
  "sender_id": 45,
  "sender_name": "John Doe",
  "message": "Hello team!",
  "message_type": "text",
  "created_at": "2024-01-15T14:30:00.000Z"
}
```

**Description:** New message received in the chat.

**Example Handler:**
```javascript
socket.on('chat_message', (message) => {
  console.log('New message:', message);
  // Add message to UI
});
```

#### 2. User Joined

**Event:** `user_joined`

**Payload:**
```json
{
  "userId": 51,
  "userName": "Jane Smith",
  "userRole": "Employee",
  "timestamp": "2024-01-15T14:35:00.000Z"
}
```

**Description:** A user joined the project chat.

#### 3. User Left

**Event:** `user_left`

**Payload:**
```json
{
  "userId": 51,
  "userName": "Jane Smith",
  "timestamp": "2024-01-15T15:00:00.000Z"
}
```

**Description:** A user left the project chat.

#### 4. Online Participants

**Event:** `online_participants`

**Payload:**
```json
[
  {
    "id": 1,
    "project_id": "PROJ_123",
    "user_id": 45,
    "user_name": "John Doe",
    "user_role": "Manager",
    "joined_at": "2024-01-15T09:15:00.000Z",
    "last_seen": "2024-01-15T14:30:00.000Z",
    "is_online": true
  }
]
```

**Description:** Updated list of online participants.

#### 5. User Typing

**Event:** `user_typing`

**Payload:**
```json
{
  "userId": 45,
  "userName": "John Doe",
  "isTyping": true
}
```

**Description:** User typing status changed.

#### 6. Chatbot Response

**Event:** `chatbot_response`

**Payload:**
```json
{
  "project_id": "PROJ_123",
  "sender_name": "ChatBot",
  "message": "🤖 Your assigned tasks:\n• Implement User Authentication (In Progress, High priority)\n• Design Database Schema (To Do, Medium priority)",
  "message_type": "bot",
  "timestamp": "2024-01-15T14:40:00.000Z"
}
```

**Description:** Response from the chatbot.

#### 7. Error

**Event:** `error`

**Payload:**
```json
{
  "message": "You do not have access to this project chat"
}
```

**Description:** Error occurred during socket operation.

## Chatbot Commands

The system includes a built-in chatbot that responds to various commands:

### Available Commands

- **/help** - Show available commands
- **/tasks** - List your assigned tasks
- **/status** - Show project status
- **/members** - Show project members
- **/online** - Show online members
- **/project** - Show project details

### Command Examples

**Request:**
```javascript
socket.emit('chatbot_command', {
  projectId: 'PROJ_123',
  command: '/tasks'
});
```

**Response:**
```json
{
  "project_id": "PROJ_123",
  "sender_name": "ChatBot",
  "message": "🤖 Your assigned tasks:\n• Implement User Authentication (In Progress, High priority)\n• Design Database Schema (To Do, Medium priority)\n• Create API Documentation (Completed, Low priority)",
  "message_type": "bot",
  "timestamp": "2024-01-15T14:40:00.000Z"
}
```

## Error Handling

### Common HTTP Status Codes

- **200 OK** - Request successful
- **201 Created** - Resource created successfully
- **400 Bad Request** - Invalid request data
- **401 Unauthorized** - Authentication required
- **403 Forbidden** - Access denied
- **404 Not Found** - Resource not found
- **500 Internal Server Error** - Server error

### Socket Error Events

- **Authentication Error** - Invalid or missing JWT token
- **Access Denied** - User doesn't have permission to join project
- **Connection Error** - Network or server issues

## Rate Limiting

- REST APIs: 100 requests per minute per user
- Socket messages: 10 messages per minute per user
- Typing indicators: 30 events per minute per user

## Data Types

### Message Types
- `text` - Regular user messages
- `system` - System notifications (user joined/left)
- `bot` - Chatbot responses

### User Roles
- `Admin` - Full access to all features
- `Manager` - Project management access
- `Employee` - Standard user access
- `Client` - Limited read-only access

## Testing the APIs

### Using cURL

**Get Messages:**
```bash
curl -X GET "http://localhost:4000/api/projects/PROJ_123/chat/messages" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Send Message:**
```bash
curl -X POST "http://localhost:4000/api/projects/PROJ_123/chat/messages" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from API!"}'
```

### Using Postman

1. Set base URL: `http://localhost:4000/api/projects`
2. Add Authorization header: `Bearer YOUR_JWT_TOKEN`
3. Test each endpoint with appropriate method and body

## Production Considerations

### Environment Variables
```env
NODE_ENV=production
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
SECRET=your_jwt_secret
PORT=4000
```

### Scaling
- Use Redis adapter for Socket.IO clustering
- Implement horizontal scaling for multiple server instances
- Add message queue for high-volume scenarios

### Monitoring
- Track message throughput
- Monitor online user counts
- Log error rates and response times
- Set up alerts for system health

This backend API provides a complete real-time chat system with project-based isolation, role-based access control, and comprehensive message management capabilities.