import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// ChatAPI Service
class ChatAPI {
  constructor(baseURL = process.env.REACT_APP_BASE_URL || 'http://localhost:4000') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      },
      ...options
    };

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
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

  async getParticipants(projectId) {
    return this.request(`/api/projects/${projectId}/chat/participants`);
  }

  async getChatStats(projectId) {
    return this.request(`/api/projects/${projectId}/chat/stats`);
  }
}

const chatAPI = new ChatAPI();

// Main Project Chat Component
function ProjectChat({ projectId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineParticipants, setOnlineParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize chat
  useEffect(() => {
    initializeChat();
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [projectId]);

  const initializeChat = async () => {
    try {
      // Load chat history
      await loadMessages();

      // Load online participants
      await loadParticipants();

      // Initialize Socket.IO connection
      initializeSocket();

    } catch (error) {
      console.error('Failed to initialize chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await chatAPI.getMessages(projectId);
      setMessages(response.data || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadParticipants = async () => {
    try {
      const response = await chatAPI.getParticipants(projectId);
      setOnlineParticipants(response.data || []);
    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  };

  const initializeSocket = () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const newSocket = io(process.env.REACT_APP_BASE_URL || 'http://localhost:4000', {
      auth: { token }
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to chat server');

      // Join project chat room
      newSocket.emit('join_project_chat', projectId);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from chat server');
    });

    // Handle incoming messages
    newSocket.on('chat_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    // Handle user joined/left
    newSocket.on('user_joined', (data) => {
      setOnlineParticipants(prev => {
        const exists = prev.find(p => p.user_id === data.userId);
        if (!exists) {
          return [...prev, {
            user_id: data.userId,
            user_name: data.userName,
            user_role: data.userRole,
            last_seen: data.timestamp
          }];
        }
        return prev;
      });
    });

    newSocket.on('user_left', (data) => {
      setOnlineParticipants(prev =>
        prev.filter(p => p.user_id !== data.userId)
      );
    });

    // Handle online participants list
    newSocket.on('online_participants', (participants) => {
      setOnlineParticipants(participants);
    });

    // Handle typing indicators
    newSocket.on('user_typing', (data) => {
      setTypingUsers(prev => {
        const filtered = prev.filter(u => u.userId !== data.userId);
        if (data.isTyping) {
          return [...filtered, { userId: data.userId, userName: data.userName }];
        }
        return filtered;
      });
    });

    // Handle errors
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !socket || !isConnected) return;

    try {
      // Send via Socket.IO for real-time delivery
      socket.emit('send_message', {
        projectId,
        message: newMessage.trim()
      });

      // Clear input
      setNewMessage('');

      // Clear typing indicator
      handleTypingStop();

    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleTypingStart = () => {
    if (socket && !isTyping) {
      socket.emit('typing_start', projectId);
      setIsTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      handleTypingStop();
    }, 1000);
  };

  const handleTypingStop = () => {
    if (socket && isTyping) {
      socket.emit('typing_stop', projectId);
      setIsTyping(false);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    handleTypingStart();
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageStyle = (message) => {
    if (message.message_type === 'system') {
      return 'message-system';
    }
    if (message.message_type === 'bot') {
      return 'message-bot';
    }
    if (message.sender_id === currentUser?.id) {
      return 'message-own';
    }
    return 'message-other';
  };

  if (loading) {
    return (
      <div className="chat-container">
        <div className="chat-loading">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-title">
          <h3>Project Chat</h3>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>

        <div className="online-participants">
          <span className="online-count">
            {onlineParticipants.length} online
          </span>
          <div className="participants-list">
            {onlineParticipants.slice(0, 5).map(participant => (
              <div key={participant.user_id} className="participant-avatar" title={participant.user_name}>
                {participant.user_name.charAt(0).toUpperCase()}
              </div>
            ))}
            {onlineParticipants.length > 5 && (
              <div className="participant-more">+{onlineParticipants.length - 5}</div>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-container">
        <div className="messages-list">
          {messages.map(message => (
            <div key={message.id} className={`message ${getMessageStyle(message)}`}>
              <div className="message-header">
                <span className="message-sender">
                  {message.message_type === 'system' && '📢 '}
                  {message.message_type === 'bot' && '🤖 '}
                  {message.sender_name}
                </span>
                <span className="message-time">
                  {formatTime(message.created_at)}
                </span>
              </div>
              <div className="message-content">
                {message.message.split('\n').map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
            </div>
          ))}

          {/* Typing Indicators */}
          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              {typingUsers.map(user => user.userName).join(', ')} is typing...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="message-input-container">
        <form onSubmit={handleSendMessage} className="message-form">
          <input
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Type a message... (Use /help for bot commands)"
            className="message-input"
            disabled={!isConnected}
            maxLength={500}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!newMessage.trim() || !isConnected}
          >
            Send
          </button>
        </form>

        {!isConnected && (
          <div className="connection-warning">
            ⚠️ Chat disconnected. Please refresh the page.
          </div>
        )}
      </div>
    </div>
  );
}

// Chat Message Component
function ChatMessage({ message, currentUser }) {
  const isOwnMessage = message.sender_id === currentUser?.id;
  const isSystemMessage = message.message_type === 'system';
  const isBotMessage = message.message_type === 'bot';

  return (
    <div className={`chat-message ${isOwnMessage ? 'own' : ''} ${isSystemMessage ? 'system' : ''} ${isBotMessage ? 'bot' : ''}`}>
      {!isSystemMessage && (
        <div className="message-avatar">
          {isBotMessage ? '🤖' : message.sender_name.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="message-content">
        {!isSystemMessage && (
          <div className="message-header">
            <span className="sender-name">
              {isBotMessage ? 'ChatBot' : message.sender_name}
            </span>
            <span className="message-time">
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}

        <div className="message-text">
          {message.message.split('\n').map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Typing Indicator Component
function TypingIndicator({ typingUsers }) {
  if (typingUsers.length === 0) return null;

  const typingText = typingUsers.length === 1
    ? `${typingUsers[0].userName} is typing...`
    : `${typingUsers.length} people are typing...`;

  return (
    <div className="typing-indicator">
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span className="typing-text">{typingText}</span>
    </div>
  );
}

// Online Participants Component
function OnlineParticipants({ participants }) {
  return (
    <div className="online-participants">
      <div className="participants-header">
        <span className="online-count">{participants.length} online</span>
      </div>
      <div className="participants-avatars">
        {participants.map(participant => (
          <div
            key={participant.user_id}
            className="participant-avatar"
            title={`${participant.user_name} (${participant.user_role})`}
          >
            {participant.user_name.charAt(0).toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

export { ProjectChat, ChatMessage, TypingIndicator, OnlineParticipants, ChatAPI };