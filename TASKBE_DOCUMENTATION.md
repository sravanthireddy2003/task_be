# TaskBe Projects & Tasks Module - Complete Documentation

## Overview
TaskBe is a comprehensive project management system with role-based access control supporting Admin, Manager, and Employee roles. This documentation covers the complete Projects and Tasks module implementation including backend APIs, frontend integration, and testing.

## Table of Contents
- [Architecture](#architecture)
- [Authentication](#authentication)
- [Projects Module](#projects-module)
- [Tasks Module](#tasks-module)
- [Role-Based Access Control](#role-based-access-control)
- [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)
- [Postman Collection](#postman-collection)
- [Error Handling](#error-handling)
- [Database Schema](#database-schema)

## Architecture

### Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Authentication**: JWT tokens
- **Frontend**: React (example implementation)
- **API Testing**: Postman

### System Components
```
├── controller/
│   ├── Projects.js          # Project CRUD operations
│   ├── Tasks.js            # Task CRUD and time tracking
│   └── AuthController.js   # Authentication
├── routes/
│   ├── projectRoutes.js    # Project endpoints
│   └── managerRoutes.js    # Manager-specific endpoints
├── middleware/
│   ├── auth.js            # JWT authentication
│   ├── roles.js           # Role-based access control
│   └── tenant.js          # Multi-tenant support
└── collections/
    └── one.js             # Postman collection
```

## Authentication

### Login Process
```javascript
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "_id": 1,
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "Admin",
    "public_id": "admin123"
  }
}
```

### JWT Token Usage
Include in all API requests:
```
Authorization: Bearer <jwt_token>
```

## Projects Module

### Core Features
- ✅ Project CRUD operations
- ✅ Department assignment
- ✅ Client association
- ✅ Project manager assignment
- ✅ Budget and timeline tracking
- ✅ Status management
- ✅ Statistics and reporting

### Project Status Flow
```
Planning → In Progress → On Hold → Completed
```

### Project Data Structure
```json
{
  "id": "dc8ddd50d72f015e",
  "public_id": "dc8ddd50d72f015e",
  "name": "P-1",
  "description": "Project description",
  "priority": "High",
  "start_date": "2025-12-19T18:30:00.000Z",
  "end_date": "2026-01-02T18:30:00.000Z",
  "budget": 1234567,
  "status": "Planning",
  "created_at": "2025-12-19T07:30:20.000Z",
  "departments": [
    {
      "public_id": "4e49293c3b67882b",
      "name": "Development Team"
    }
  ],
  "client": {
    "public_id": 62,
    "name": "Akash Aash"
  },
  "project_manager": {
    "public_id": "fc769545b911ab2c",
    "name": "Akash shetty"
  }
}
```

## Tasks Module

### Core Features
- ✅ Task CRUD operations
- ✅ Time tracking (start/pause/complete)
- ✅ Activity timeline
- ✅ Assignment to users
- ✅ Priority and stage management
- ✅ Project association

### Task Status Flow
```
Pending → In Progress → On Hold → Completed
```

### Time Tracking Features
- **Start Task**: Begins time tracking session
- **Pause Task**: Pauses current session, records duration
- **Complete Task**: Marks task as completed, calculates total time
- **Timeline**: Shows complete activity history

### Task Data Structure
```json
{
  "id": 123,
  "title": "Task Title",
  "description": "Task description",
  "priority": "High",
  "stage": "PENDING",
  "status": "Pending",
  "taskDate": "2025-12-31T00:00:00.000Z",
  "time_alloted": 8,
  "total_duration": 0,
  "assigned_users": [
    {
      "id": 1,
      "name": "User One",
      "email": "user1@example.com"
    }
  ],
  "project": {
    "id": "project123",
    "name": "Project Name"
  },
  "client": {
    "id": 1,
    "name": "Client Name"
  },
  "created_at": "2025-12-26T00:00:00.000Z"
}
```

## Role-Based Access Control

### Admin Role
- ✅ Full access to all projects and tasks
- ✅ Create/edit/delete projects and tasks
- ✅ Manage users, departments, clients
- ✅ View all statistics and reports

### Manager Role
- ✅ Create and manage assigned projects
- ✅ View projects they manage or from their departments
- ✅ Create and assign tasks within their projects
- ✅ View team member tasks and progress
- ✅ Access to department-specific statistics

### Employee Role
- ✅ View assigned tasks
- ✅ Start/pause/complete their tasks
- ✅ Track time on assigned work
- ✅ View personal task timeline
- ✅ Limited access to project information

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User authentication |

### Projects
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/api/projects` | List projects | All |
| POST | `/api/projects` | Create project | Admin, Manager |
| GET | `/api/projects/:id` | Get project details | All |
| PUT | `/api/projects/:id` | Update project | Admin, Manager |
| DELETE | `/api/projects/:id` | Delete project | Admin, Manager |
| GET | `/api/projects/stats` | Project statistics | All |
| GET | `/api/projects/:id/summary` | Project summary | All |
| POST | `/api/projects/:id/departments` | Add departments | Admin, Manager |
| DELETE | `/api/projects/:id/departments/:deptId` | Remove department | Admin, Manager |

### Tasks
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/api/tasks` | Create task | Admin, Manager |
| DELETE | `/api/tasks/:id` | Delete task | Admin, Manager |
| POST | `/api/tasks/selected-details` | Get task details | All |
| POST | `/api/tasks/:id/start` | Start task timer | Employee |
| POST | `/api/tasks/:id/pause` | Pause task timer | Employee |
| POST | `/api/tasks/:id/complete` | Complete task | Employee |
| GET | `/api/tasks/:id/timeline` | Get task timeline | All |

## Frontend Integration

### API Service Setup
```javascript
// services/apiService.js
class ApiService {
  constructor() {
    this.baseURL = 'http://localhost:4000/api';
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` })
    };
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      headers: this.getAuthHeaders(),
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }
}
```

### React Components Structure
```
src/
├── components/
│   ├── auth/
│   │   ├── Login.js
│   │   └── ProtectedRoute.js
│   ├── projects/
│   │   ├── ProjectsList.js
│   │   ├── CreateProject.js
│   │   └── ProjectStats.js
│   ├── tasks/
│   │   ├── TasksList.js
│   │   ├── TaskTimer.js
│   │   └── CreateTask.js
│   └── common/
│       ├── Loading.js
│       └── ErrorMessage.js
├── services/
│   └── apiService.js
├── hooks/
│   └── useApi.js
└── App.js
```

### Sample Project List Component
```jsx
const ProjectsList = ({ user }) => {
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const { execute, loading, error } = useApi();

  useEffect(() => {
    loadProjects();
    loadStats();
  }, []);

  const loadProjects = () => execute(() => apiService.getProjects());
  const loadStats = () => execute(() => apiService.getProjectStats());

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="projects-container">
      {stats && <ProjectStats stats={stats} />}
      <div className="projects-grid">
        {projects.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            user={user}
            onUpdate={loadProjects}
          />
        ))}
      </div>
    </div>
  );
};
```

### Task Timer Implementation
```jsx
const TaskTimer = ({ task, onTaskUpdate }) => {
  const [isRunning, setIsRunning] = useState(task.status === 'In Progress');
  const { execute, loading } = useApi();

  const handleStart = () => execute(async () => {
    const response = await apiService.startTask(task.id);
    setIsRunning(true);
    onTaskUpdate(response.data);
  });

  const handlePause = () => execute(async () => {
    const response = await apiService.pauseTask(task.id);
    setIsRunning(false);
    onTaskUpdate(response.data);
  });

  const handleComplete = () => execute(async () => {
    const response = await apiService.completeTask(task.id);
    setIsRunning(false);
    onTaskUpdate(response.data);
  });

  return (
    <div className="task-timer">
      <div className="timer-controls">
        {!isRunning ? (
          <button onClick={handleStart} disabled={loading}>
            Start
          </button>
        ) : (
          <button onClick={handlePause} disabled={loading}>
            Pause
          </button>
        )}
        <button onClick={handleComplete} disabled={loading}>
          Complete
        </button>
      </div>
      <TaskTimeline taskId={task.id} />
    </div>
  );
};
```

## Postman Collection

### Setup Instructions
1. Copy the content from `one.js` file
2. In Postman, click "Import" → "Raw text"
3. Paste the JSON content
4. Set environment variables:
   - `baseUrl`: `http://localhost:4000`
   - `token`: (will be set after login)

### Collection Structure
```
TaskBe Projects & Tasks API Collection
├── Authentication
│   └── Login
├── Projects
│   ├── Get Projects
│   ├── Create Project
│   ├── Get Project by ID
│   ├── Update Project
│   ├── Delete Project
│   ├── Get Projects Stats
│   ├── Get Project Summary
│   ├── Add Departments to Project
│   └── Remove Department from Project
└── Tasks
    ├── Create Task
    ├── Delete Task
    ├── Get Task Details
    ├── Start Task
    ├── Pause Task
    ├── Complete Task
    └── Get Task Timeline
```

## Error Handling

### Common Error Responses
```json
// Authentication Error
{
  "success": false,
  "message": "Invalid credentials"
}

// Authorization Error
{
  "success": false,
  "message": "Access denied"
}

// Not Found Error
{
  "success": false,
  "message": "Project not found"
}

// Validation Error
{
  "success": false,
  "message": "Project name is required"
}
```

### Frontend Error Handling
```javascript
const handleApiError = (error) => {
  if (error.message.includes('401')) {
    // Token expired, redirect to login
    logout();
    navigate('/login');
  } else if (error.message.includes('403')) {
    // Access denied
    setError('You do not have permission to perform this action');
  } else if (error.message.includes('404')) {
    // Resource not found
    setError('The requested resource was not found');
  } else {
    // Generic error
    setError('An unexpected error occurred');
  }
};
```

## Database Schema

### Projects Table
```sql
CREATE TABLE projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(16) UNIQUE NOT NULL,
  client_id INT,
  project_manager_id INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  start_date DATETIME,
  end_date DATETIME,
  budget DECIMAL(15,2),
  status ENUM('Planning', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Planning',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clientss(id),
  FOREIGN KEY (project_manager_id) REFERENCES users(_id),
  FOREIGN KEY (created_by) REFERENCES users(_id)
);
```

### Tasks Table
```sql
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(16) UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to JSON,
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  stage ENUM('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE') DEFAULT 'TODO',
  status ENUM('Pending', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Pending',
  taskDate DATETIME,
  time_alloted INT DEFAULT 0,
  total_duration INT DEFAULT 0,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  client_id INT,
  project_id INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clientss(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by) REFERENCES users(_id)
);
```

### Task Time Logs Table
```sql
CREATE TABLE task_time_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  action ENUM('start', 'pause', 'resume', 'complete', 'reassign') NOT NULL,
  timestamp DATETIME NOT NULL,
  duration INT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(_id) ON DELETE CASCADE,
  INDEX idx_task_time_logs_task_id (task_id),
  INDEX idx_task_time_logs_timestamp (timestamp)
);
```

### Project Departments Table
```sql
CREATE TABLE project_departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  department_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  UNIQUE KEY unique_project_department (project_id, department_id)
);
```

## Installation & Setup

### Backend Setup
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
node migrate.js

# Start server
npm start
```

### Frontend Setup
```bash
# Create React app
npx create-react-app taskbe-frontend
cd taskbe-frontend

# Install dependencies
npm install axios react-router-dom

# Copy the provided components and services
# Start development server
npm start
```

## Testing

### Unit Tests
```bash
# Run backend tests
npm test

# Run frontend tests
npm test
```

### API Testing with Postman
1. Import the `one.js` collection
2. Set environment variables
3. Run login request first
4. Test other endpoints with the obtained token

### Manual Testing Checklist
- [ ] Admin can create, read, update, delete projects
- [ ] Manager can manage assigned projects
- [ ] Employee can track time on assigned tasks
- [ ] Role-based access control works correctly
- [ ] Error handling displays appropriate messages
- [ ] Time tracking calculates durations correctly
- [ ] Statistics reflect accurate data

## Troubleshooting

### Common Issues

**"Project not found" error:**
- Check if the project ID exists in the database
- Verify user has permission to access the project
- Ensure the ID is correctly formatted (numeric or public_id)

**"Access denied" error:**
- Verify JWT token is valid and not expired
- Check user role permissions for the requested action
- Ensure the user is assigned to the appropriate department/project

**Time tracking not working:**
- Verify the task exists and user is assigned to it
- Check if the task is already completed
- Ensure database has the required columns (started_at, completed_at, total_duration)

**Statistics not loading:**
- Check user role permissions
- Verify database connections
- Ensure required tables and data exist

## Contributing

### Code Style
- Use ESLint and Prettier for code formatting
- Follow REST API conventions
- Include JSDoc comments for functions
- Write comprehensive error messages

### Testing Guidelines
- Write unit tests for all new functions
- Include integration tests for API endpoints
- Test role-based access control thoroughly
- Verify error handling scenarios

## Support

For issues or questions:
1. Check this documentation first
2. Review the Postman collection for API examples
3. Check server logs for error details
4. Verify database schema matches requirements

## Version History

### v1.0.0 (December 2025)
- Initial release of Projects & Tasks module
- Complete CRUD operations for projects and tasks
- Time tracking functionality
- Role-based access control
- Comprehensive API documentation
- Postman collection for testing
- Frontend integration examples

---

*This documentation is automatically generated and maintained. Last updated: December 26, 2025*