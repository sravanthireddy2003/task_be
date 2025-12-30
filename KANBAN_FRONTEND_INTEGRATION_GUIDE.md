# TaskBe Kanban Workflow - Frontend Integration Guide

## Overview
This guide provides comprehensive instructions for implementing a Bitrix24-style Kanban board in your React frontend, integrating with the enhanced TaskBe backend APIs.

## Architecture Overview

### Components Structure
```
KanbanBoard/
├── KanbanBoard.jsx          # Main board component
├── KanbanColumn.jsx         # Individual column (To Do, In Progress, etc.)
├── KanbanCard.jsx           # Task card component
├── TaskModal.jsx            # Task details modal
├── TimeTracker.jsx          # Time tracking component
└── hooks/
    ├── useKanbanData.js     # Data fetching and state management
    ├── useTimeTracking.js   # Time tracking logic
    └── useTaskActions.js    # Task action handlers
```

### State Management
- **Global State**: User authentication, current project
- **Local State**: Kanban board data, selected task, modal states
- **Server State**: Tasks, time logs, project data

## Kanban Workflow Rules (Strict)

The backend enforces a strict Kanban workflow. Any transition outside of this flow will return a `400 Bad Request`.

### Allowed Transitions
- **To Do** → **In Progress**
- **In Progress** → **On Hold**
- **On Hold** → **In Progress**
- **In Progress** → **Completed**

*Note: `Pending` is treated as `To Do` for the initial transition.*

### Role Permissions
- **Employees**: Can execute tasks (Start, Pause, Resume, Complete) and update status via Kanban.
- **Managers/Admins**: Read-only access to task execution. They can view all tasks and timelines but cannot trigger time tracking actions.

## API Reference

### 1. Get Project Tasks (Kanban)
`GET /api/projects/:projectId/tasks`

Returns tasks grouped by Kanban columns.

**Response:**
```json
{
  "success": true,
  "data": {
    "project_id": 123,
    "tasks": [...],
    "kanban_columns": {
      "To Do": [...],
      "In Progress": [...],
      "On Hold": [...],
      "Completed": [...]
    }
  }
}
```

### 2. Start Task
`POST /api/tasks/:taskId/start`

**Response:**
```json
{
  "success": true,
  "message": "Task started",
  "data": {
    "taskId": "T-123",
    "status": "In Progress",
    "started_at": "2025-01-10T10:00:00Z"
  }
}
```

### 3. Pause Task
`POST /api/tasks/:taskId/pause`

**Response:**
```json
{
  "success": true,
  "message": "Task paused",
  "data": {
    "taskId": "T-123",
    "status": "On Hold",
    "total_time_seconds": 3600
  }
}
```

### 4. Resume Task
`POST /api/tasks/:taskId/resume`

**Response:**
```json
{
  "success": true,
  "message": "Task resumed",
  "data": {
    "taskId": "T-123",
    "status": "In Progress"
  }
}
```

### 5. Complete Task
`POST /api/tasks/:taskId/complete`

**Response:**
```json
{
  "success": true,
  "message": "Task completed",
  "data": {
    "taskId": "T-123",
    "status": "Completed",
    "total_time_seconds": 7200
  }
}
```

### 6. View Task Timeline
`GET /api/tasks/:taskId/timeline`

Returns the audit log of all time tracking actions.

---

## Frontend Implementation Tips

### Disabling Buttons
Always disable action buttons based on the current task status:
- **Start**: Only enabled if status is `To Do` or `Pending`.
- **Pause**: Only enabled if status is `In Progress`.
- **Resume**: Only enabled if status is `On Hold`.
- **Complete**: Only enabled if status is `In Progress`.

### Time Display
Use the `total_duration` (seconds) from the backend to display "Time Spent". For active tasks (`In Progress`), you can calculate the "Live" time on the frontend by adding the difference between `now` and `started_at` (from the last `start` or `resume` log) to the `total_duration`.

  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);

  const kanbanColumns = {
    'To Do': 'Pending',
    'In Progress': 'In Progress',
    'On Hold': 'On Hold',
    'Completed': 'Completed'
  };

  useEffect(() => {
    if (projectId) {
      fetchBoardData();
    }
  }, [projectId]);

  const fetchBoardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/projects/${projectId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBoardData(response.data.data);
    } catch (error) {
      console.error('Error fetching board data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskAction = async (taskId, action) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tasks/${taskId}/${action}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Refresh board data
      await fetchBoardData();
    } catch (error) {
      console.error(`Error ${action}ing task:`, error);
      alert(error.response?.data?.error || `Failed to ${action} task`);
    }
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  const handleModalClose = () => {
    setSelectedTask(null);
  };

  if (loading) {
    return <div className="kanban-loading">Loading Kanban board...</div>;
  }

  if (!boardData) {
    return <div className="kanban-error">Failed to load board data</div>;
  }

  return (
    <div className="kanban-board">
      <div className="kanban-header">
        <h2>{boardData.project_name} - Kanban Board</h2>
      </div>

      <div className="kanban-columns">
        {Object.entries(kanbanColumns).map(([columnName, status]) => (
          <KanbanColumn
            key={columnName}
            title={columnName}
            status={status}
            tasks={boardData.kanban_columns[columnName] || []}
            onTaskClick={handleTaskClick}
            onTaskAction={handleTaskAction}
            userRole={userRole}
          />
        ))}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={handleModalClose}
          onAction={handleTaskAction}
          userRole={userRole}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
```

### 3. Kanban Column Component

```jsx
// components/KanbanColumn.jsx
import React from 'react';
import KanbanCard from './KanbanCard';

const KanbanColumn = ({
  title,
  status,
  tasks,
  onTaskClick,
  onTaskAction,
  userRole
}) => {
  const getColumnColor = (status) => {
    switch (status) {
      case 'Pending': return 'column-todo';
      case 'In Progress': return 'column-progress';
      case 'On Hold': return 'column-hold';
      case 'Completed': return 'column-completed';
      default: return 'column-default';
    }
  };

  const getActionButtons = (task) => {
    const buttons = [];

    if (userRole === 'Employee') {
      switch (task.status) {
        case 'Pending':
          buttons.push(
            <button
              key="start"
              onClick={() => onTaskAction(task.id, 'start')}
              className="btn-start"
            >
              ▶️ Start
            </button>
          );
          break;
        case 'In Progress':
          buttons.push(
            <button
              key="pause"
              onClick={() => onTaskAction(task.id, 'pause')}
              className="btn-pause"
            >
              ⏸️ Pause
            </button>,
            <button
              key="complete"
              onClick={() => onTaskAction(task.id, 'complete')}
              className="btn-complete"
            >
              ✅ Complete
            </button>
          );
          break;
        case 'On Hold':
          buttons.push(
            <button
              key="resume"
              onClick={() => onTaskAction(task.id, 'resume')}
              className="btn-resume"
            >
              ▶️ Resume
            </button>
          );
          break;
      }
    }

    return buttons;
  };

  return (
    <div className={`kanban-column ${getColumnColor(status)}`}>
      <div className="column-header">
        <h3>{title}</h3>
        <span className="task-count">{tasks.length}</span>
      </div>

      <div className="column-content">
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            actionButtons={getActionButtons(task)}
          />
        ))}

        {tasks.length === 0 && (
          <div className="empty-column">
            No tasks in {title.toLowerCase()}
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
```

### 4. Kanban Card Component

```jsx
// components/KanbanCard.jsx
import React from 'react';

const KanbanCard = ({ task, onClick, actionButtons }) => {
  const formatDuration = (seconds) => {
    if (!seconds) return '0h 0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-default';
    }
  };

  return (
    <div className="kanban-card" onClick={onClick}>
      <div className="card-header">
        <h4 className="card-title">{task.title}</h4>
        <span className={`priority-badge ${getPriorityColor(task.priority)}`}>
          {task.priority}
        </span>
      </div>

      <div className="card-content">
        <p className="card-description">
          {task.description?.substring(0, 100)}
          {task.description?.length > 100 && '...'}
        </p>

        <div className="card-meta">
          <div className="assigned-users">
            {task.assigned_users?.map((user, index) => (
              <span key={index} className="user-avatar">
                {user.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>

          <div className="time-info">
            <span className="total-time">
              {formatDuration(task.total_duration)}
            </span>
          </div>
        </div>
      </div>

      {actionButtons && actionButtons.length > 0 && (
        <div className="card-actions">
          {actionButtons}
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
```

### 5. Task Modal Component

```jsx
// components/TaskModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TimeTracker from './TimeTracker';

const TaskModal = ({ task, onClose, onAction, userRole }) => {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTaskTimeline();
  }, [task.id]);

  const fetchTaskTimeline = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/tasks/${task.id}/timeline`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTimeline(response.data.data);
    } catch (error) {
      console.error('Error fetching timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="task-details">
            <div className="detail-section">
              <h3>Description</h3>
              <p>{task.description || 'No description provided'}</p>
            </div>

            <div className="detail-section">
              <h3>Details</h3>
              <div className="detail-grid">
                <div><strong>Priority:</strong> {task.priority}</div>
                <div><strong>Status:</strong> {task.status}</div>
                <div><strong>Project:</strong> {task.project?.name}</div>
                <div><strong>Total Time:</strong> {formatDuration(task.total_duration)}</div>
              </div>
            </div>

            <div className="detail-section">
              <h3>Assigned Users</h3>
              <div className="assigned-users-list">
                {task.assigned_users?.map((user, index) => (
                  <span key={index} className="user-tag">{user}</span>
                ))}
              </div>
            </div>
          </div>

          {userRole === 'Employee' && (
            <TimeTracker
              taskId={task.id}
              taskStatus={task.status}
              onAction={onAction}
            />
          )}

          <div className="timeline-section">
            <h3>Activity Timeline</h3>
            {loading ? (
              <div>Loading timeline...</div>
            ) : (
              <div className="timeline">
                {timeline.map((entry, index) => (
                  <div key={index} className="timeline-entry">
                    <div className="timeline-action">
                      <span className="action-type">{entry.action}</span>
                      <span className="action-time">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    {entry.duration && (
                      <div className="action-duration">
                        Duration: {formatDuration(entry.duration)}
                      </div>
                    )}
                    <div className="action-user">by {entry.user_name}</div>
                  </div>
                ))}
                {timeline.length === 0 && (
                  <div className="no-timeline">No activity recorded yet</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
```

### 6. Time Tracker Component

```jsx
// components/TimeTracker.jsx
import React, { useState, useEffect } from 'react';

const TimeTracker = ({ taskId, taskStatus, onAction }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    let interval;
    if (isTracking) {
      interval = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking]);

  useEffect(() => {
    // Reset timer when task status changes
    setCurrentTime(0);
    setIsTracking(taskStatus === 'In Progress');
  }, [taskStatus]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAction = async (action) => {
    await onAction(taskId, action);
  };

  const getAvailableActions = () => {
    switch (taskStatus) {
      case 'Pending':
        return [{ label: 'Start Task', action: 'start', icon: '▶️' }];
      case 'In Progress':
        return [
          { label: 'Pause', action: 'pause', icon: '⏸️' },
          { label: 'Complete', action: 'complete', icon: '✅' }
        ];
      case 'On Hold':
        return [{ label: 'Resume', action: 'resume', icon: '▶️' }];
      case 'Completed':
        return [];
      default:
        return [];
    }
  };

  const actions = getAvailableActions();

  return (
    <div className="time-tracker">
      <h3>Time Tracking</h3>

      <div className="timer-display">
        <div className="current-time">
          {formatTime(currentTime)}
        </div>
        <div className="status-indicator">
          {isTracking ? '🟢 Tracking Active' : '🔴 Not Tracking'}
        </div>
      </div>

      <div className="time-actions">
        {actions.map(action => (
          <button
            key={action.action}
            onClick={() => handleAction(action.action)}
            className={`time-btn ${action.action}`}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>

      <div className="time-info">
        <p>
          <strong>Current Status:</strong> {taskStatus}
        </p>
        <p>
          <em>Time tracking automatically starts when you begin working on a task</em>
        </p>
      </div>
    </div>
  );
};

export default TimeTracker;
```

### 7. Main App Integration

```jsx
// App.jsx
import React, { useState, useEffect } from 'react';
import ProjectSelector from './components/ProjectSelector';
import KanbanBoard from './components/KanbanBoard';

const App = () => {
  const [user, setUser] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const userData = JSON.parse(localStorage.getItem('user') || 'null');

    if (token && userData) {
      setUser(userData);
    } else {
      // Redirect to login
      window.location.href = '/login';
    }
  }, []);

  const handleProjectSelect = (projectId) => {
    setSelectedProject(projectId);
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>TaskBe Kanban Workflow</h1>
        <div className="user-info">
          Welcome, {user.name} ({user.role})
        </div>
      </header>

      <main className="app-main">
        {!selectedProject ? (
          <ProjectSelector
            onProjectSelect={handleProjectSelect}
            userRole={user.role}
          />
        ) : (
          <KanbanBoard
            projectId={selectedProject}
            userRole={user.role}
          />
        )}
      </main>
    </div>
  );
};

export default App;
```

## CSS Styling

```css
/* Kanban Board Styles */
.kanban-board {
  padding: 20px;
  background-color: #f5f5f5;
  min-height: 100vh;
}

.kanban-header {
  margin-bottom: 20px;
}

.kanban-columns {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  padding-bottom: 20px;
}

.kanban-column {
  background: white;
  border-radius: 8px;
  padding: 16px;
  min-width: 300px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e0e0;
}

.task-count {
  background: #007bff;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}

.column-todo { border-top: 4px solid #6c757d; }
.column-progress { border-top: 4px solid #007bff; }
.column-hold { border-top: 4px solid #ffc107; }
.column-completed { border-top: 4px solid #28a745; }

.kanban-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.kanban-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  transform: translateY(-2px);
}

.card-title {
  margin: 0 0 8px 0;
  font-size: 1em;
  font-weight: 600;
}

.priority-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7em;
  font-weight: bold;
}

.priority-high { background: #dc3545; color: white; }
.priority-medium { background: #ffc107; color: black; }
.priority-low { background: #28a745; color: white; }

.card-actions {
  margin-top: 8px;
  display: flex;
  gap: 4px;
}

.btn-start, .btn-pause, .btn-resume, .btn-complete {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8em;
  transition: background-color 0.2s;
}

.btn-start { background: #28a745; color: white; }
.btn-pause { background: #ffc107; color: black; }
.btn-resume { background: #007bff; color: white; }
.btn-complete { background: #28a745; color: white; }

.btn-start:hover { background: #218838; }
.btn-pause:hover { background: #e0a800; }
.btn-resume:hover { background: #0056b3; }
.btn-complete:hover { background: #218838; }

/* Task Modal Styles */
.task-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.task-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e0e0e0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  padding: 20px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.user-tag {
  background: #e9ecef;
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 4px;
  display: inline-block;
}

.timeline-entry {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.timeline-action {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.action-type {
  font-weight: bold;
  text-transform: capitalize;
}

.action-time {
  color: #6c757d;
  font-size: 0.9em;
}

/* Time Tracker Styles */
.time-tracker {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  margin: 20px 0;
}

.timer-display {
  text-align: center;
  margin-bottom: 16px;
}

.current-time {
  font-size: 2em;
  font-weight: bold;
  font-family: monospace;
  color: #007bff;
}

.status-indicator {
  margin-top: 8px;
  font-size: 0.9em;
}

.time-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}

.time-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s;
}

.time-info {
  text-align: center;
  color: #6c757d;
  font-size: 0.9em;
}
```

## API Integration Notes

### Authentication
- Store JWT token in localStorage
- Include `Authorization: Bearer ${token}` header in all requests
- Handle token expiration and refresh

### Error Handling
```javascript
const handleApiError = (error) => {
  if (error.response?.status === 401) {
    // Token expired, redirect to login
    localStorage.removeItem('token');
    window.location.href = '/login';
  } else if (error.response?.status === 403) {
    alert('Access denied: ' + error.response.data.error);
  } else {
    alert('An error occurred: ' + (error.response?.data?.error || error.message));
  }
};
```

### Real-time Updates (Optional)
For real-time updates, consider implementing WebSocket connections or polling:

```javascript
// Polling example
useEffect(() => {
  const interval = setInterval(() => {
    if (projectId) {
      fetchBoardData();
    }
  }, 30000); // Poll every 30 seconds

  return () => clearInterval(interval);
}, [projectId]);
```

## Testing Checklist

- [ ] Project selection works for all roles
- [ ] Kanban board loads correctly
- [ ] Task cards display proper information
- [ ] Time tracking starts/stops correctly
- [ ] Status transitions work as expected
- [ ] Role-based permissions enforced
- [ ] Error handling works properly
- [ ] Timeline displays correctly
- [ ] Modal interactions work smoothly

## Performance Considerations

1. **Lazy Loading**: Load task details only when needed
2. **Pagination**: For large projects, implement pagination
3. **Memoization**: Use React.memo for components that don't change often
4. **Debouncing**: For search/filter operations
5. **Optimistic Updates**: Update UI immediately, then sync with server

## Deployment Notes

1. Ensure CORS is configured for your frontend domain
2. Set up proper environment variables for API URLs
3. Implement proper error boundaries in React
4. Add loading states and skeleton screens
5. Test on various screen sizes for responsive design

This implementation provides a complete Bitrix24-style Kanban workflow with strict role-based access control, accurate time tracking, and seamless user experience.