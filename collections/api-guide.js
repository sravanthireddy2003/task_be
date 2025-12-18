/**
 * TaskBe API Guide for Frontend Integration
 * Contains: roles, endpoints, login responses, and integration instructions
 */

// ==================== ROLES ====================
const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  CLIENT: 'Client',
  CLIENT_VIEWER: 'Client-Viewer'
};

// ==================== LOGIN RESPONSES ====================
const LOGIN_RESPONSES = {
  Admin: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjNTEwYjJkZDBlMzExZjA4OGMyMDAxNTVkYWVkZjUwIiwiaWF0IjoxNzY2MDUxMjU3LCJleHAiOjE3NjY2NTYwNTd9.VPn97Vo0mhQ3J5aH3TUUs7lY_szqU_JCGGkTSyMI7BU",
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImFjNTEwYjJkZDBlMzExZjA4OGMyMDAxNTVkYWVkZjUwIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3NjYwNTEyNTcsImV4cCI6MTc2ODY0MzI1N30.z3J3MYo2wRtR8kfltYhwd3lyn9zxglwSEmIDflNICXU",
    user: {
      id: "ac510b2dd0e311f088c200155daedf50",
      email: "admin@example.com",
      name: "Admin User",
      role: "Admin",
      modules: [
        { moduleId: "6a2ef6584bce3025", name: "Dashboard", access: "full", path: "/admin/dashboard" },
        { moduleId: "c22786746f3072d6", name: "User Management", access: "full", path: "/admin/users" },
        { moduleId: "45bb31719857f4b3", name: "Clients", access: "full", path: "/admin/clients" },
        { moduleId: "39d338c671d58e03", name: "Departments", access: "full", path: "/admin/departments" },
        { moduleId: "43a793d6fea2f370", name: "Tasks", access: "full", path: "/admin/tasks" },
        { moduleId: "793756e1d0997601", name: "Projects", access: "full", path: "/admin/projects" },
        { moduleId: "c826110014caa10e", name: "Workflow (Project & Task Flow)", access: "full", path: "/admin/workflow" },
        { moduleId: "8bde69403e370854", name: "Notifications", access: "full", path: "/admin/notifications" },
        { moduleId: "63c9ab2ec626ee63", name: "Reports & Analytics", access: "full", path: "/admin/reports" },
        { moduleId: "45fb8742255ce2f7", name: "Document & File Management", access: "full", path: "/admin/documents" },
        { moduleId: "a814d9abf691c2f9", name: "Chat / Real-Time Collaboration", access: "full", path: "/admin/chat" },
        { moduleId: "b32e298a4d889334", name: "Approval Workflows", access: "full", path: "/admin/approvals" },
        { moduleId: "435f640487c33b57", name: "Settings & Master Configuration", access: "full", path: "/admin/settings" }
      ],
      phone: "9513035255",
      title: null,
      department: null
    },
    metrics: {
      totalUsers: 4,
      totalClients: 0,
      totalTasks: 0,
      totalProjects: 0,
      role: "Admin",
      accessLevel: "Full Access"
    },
    resources: {
      canViewAllClients: true,
      canCreateClients: true,
      canManageUsers: true,
      canViewAnalytics: true,
      canManageDepartments: true,
      canViewAllTasks: true,
      canCreateProjects: true,
      canApprove: true,
      features: ["Clients", "Users", "Tasks", "Projects", "Dashboard", "Analytics", "Reports", "Settings"]
    },
  },
  Manager: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Im1hbmFnZXJwdWI1Njc4IiwiaWF0IjoxNzY2MDUxMjU3LCJleHAiOjE3NjY2NTYwNTd9.xxxxx",
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Im1hbmFnZXJwdWI1Njc4IiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3NjYwNTEyNTcsImV4cCI6MTc2ODY0MzI1N30.xxxxx",
    user: {
      id: "managerpub5678",
      email: "manager@example.com",
      name: "Manager Name",
      role: "Manager",
      modules: [
        { moduleId: "6a2ef6584bce3025", name: "Dashboard", access: "full", path: "/manager/dashboard" },
        { moduleId: "45bb31719857f4b3", name: "Clients", access: "full", path: "/manager/clients" },
        { moduleId: "43a793d6fea2f370", name: "Tasks", access: "full", path: "/manager/tasks" },
        { moduleId: "793756e1d0997601", name: "Projects", access: "full", path: "/manager/projects" },
        { moduleId: "c826110014caa10e", name: "Workflow (Project & Task Flow)", access: "full", path: "/manager/workflow" },
        { moduleId: "8bde69403e370854", name: "Notifications", access: "read", path: "/manager/notifications" },
        { moduleId: "63c9ab2ec626ee63", name: "Reports & Analytics", access: "full", path: "/manager/reports" },
        { moduleId: "45fb8742255ce2f7", name: "Document & File Management", access: "full", path: "/manager/documents" }
      ],
      phone: "9513035256",
      title: "Project Manager",
      department: "Operations"
    },
    metrics: {
      totalUsers: 0,
      totalClients: 12,
      totalTasks: 45,
      totalProjects: 8,
      role: "Manager",
      accessLevel: "Manager Access"
    },
    resources: {
      canViewAllClients: true,
      canCreateClients: true,
      canManageUsers: false,
      canViewAnalytics: true,
      canManageDepartments: false,
      canViewAllTasks: true,
      canCreateProjects: true,
      canApprove: true,
      features: ["Clients", "Tasks", "Projects", "Dashboard", "Reports"]
    },
  },
  Employee: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQ5NmFjYWVhMzc4ZDVmZTUiLCJpYXQiOjE3NjYwNTEyNTcsImV4cCI6MTc2NjY1NjA1N30.xxxxx",
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQ5NmFjYWVhMzc4ZDVmZTUiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc2NjA1MTI1NywiZXhwIjoxNzY4NjQzMjU3fQ.xxxxx",
    user: {
      id: "d96acaea378d5fe5",
      email: "employee@example.com",
      name: "Employee User",
      role: "Employee",
      modules: [
        { moduleId: "6a2ef6584bce3025", name: "Dashboard", access: "read", path: "/employee/dashboard" },
        { moduleId: "43a793d6fea2f370", name: "Tasks", access: "read", path: "/employee/tasks" },
        { moduleId: "8bde69403e370854", name: "Notifications", access: "read", path: "/employee/notifications" },
        { moduleId: "45fb8742255ce2f7", name: "Document & File Management", access: "read", path: "/employee/documents" }
      ],
      phone: "9513035257",
      title: "Software Developer",
      department: "Engineering"
    },
    metrics: {
      totalUsers: 0,
      totalClients: 0,
      totalTasks: 8,
      totalProjects: 0,
      role: "Employee",
      accessLevel: "Employee Access"
    },
    resources: {
      canViewAllClients: false,
      canCreateClients: false,
      canManageUsers: false,
      canViewAnalytics: false,
      canManageDepartments: false,
      canViewAllTasks: false,
      canCreateProjects: false,
      canApprove: false,
      features: ["Tasks", "Dashboard"]
    },
  },
  'Client-Viewer': {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNsaWVudHB1Yjk5OSIsImlhdCI6MTc2NjA1MTI1NywiZXhwIjoxNzY2NjU2MDU3fQ.xxxxx",
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNsaWVudHB1Yjk5OSIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzY2MDUxMjU3LCJleHAiOjE3Njg2NDMyNTd9.xxxxx",
    user: {
      id: "clientpub999",
      email: "client@example.com",
      name: "Client Name",
      role: "Client-Viewer",
      modules: [
        { moduleId: "6a2ef6584bce3025", name: "Dashboard", access: "read", path: "/client/dashboard" },
        { moduleId: "793756e1d0997601", name: "Projects", access: "read", path: "/client/projects" },
        { moduleId: "43a793d6fea2f370", name: "Tasks", access: "read", path: "/client/tasks" },
        { moduleId: "63c9ab2ec626ee63", name: "Reports & Analytics", access: "read", path: "/client/reports" },
        { moduleId: "45fb8742255ce2f7", name: "Document & File Management", access: "read", path: "/client/documents" }
      ],
      phone: "9513035258",
      title: null,
      department: null,
      clientId: 55,
      clientName: "nikitha kondareddy",
      company: "ABC Corp"
    },
    metrics: {
      totalUsers: 0,
      totalClients: 1,
      totalTasks: 5,
      totalProjects: 2,
      role: "Client-Viewer",
      accessLevel: "Read Only"
    },
    resources: {
      canViewAllClients: false,
      canCreateClients: false,
      features: ["Projects", "Tasks", "Dashboard", "Reports"]
    },
  },
  Client: {
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNsaWVudHB1Yjg4OCIsImlhdCI6MTc2NjA1MTI1NywiZXhwIjoxNzY2NjU2MDU3fQ.xxxxx",
    refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNsaWVudHB1Yjg4OCIsInR5cGUiOiJyZWZyZXNoIiwiaWF0IjoxNzY2MDUxMjU3LCJleHAiOjE3Njg2NDMyNTd9.xxxxx",
    user: {
      id: "clientpub888",
      email: "client@company.com",
      name: "Client Company",
      role: "Client",
      modules: [
        { moduleId: "6a2ef6584bce3025", name: "Dashboard", access: "read", path: "/client/dashboard" },
        { moduleId: "793756e1d0997601", name: "Projects", access: "read", path: "/client/projects" },
        { moduleId: "43a793d6fea2f370", name: "Tasks", access: "read", path: "/client/tasks" },
        { moduleId: "45fb8742255ce2f7", name: "Document & File Management", access: "read", path: "/client/documents" }
      ],
      phone: "9513035259",
      title: null,
      department: null,
      company: "XYZ Industries",
      industry: "Technology"
    },
    metrics: {
      totalUsers: 0,
      totalClients: 1,
      totalTasks: 12,
      totalProjects: 3,
      role: "Client",
      accessLevel: "Client Access"
    },
    resources: {
      canViewAllClients: false,
      canCreateClients: false,
      canApprove: false,
      features: ["Projects", "Tasks", "Dashboard"]
    },
  }
};

// ==================== API ENDPOINTS BY ROLE ====================
const API_ENDPOINTS = {
  // Common to all authenticated users
  COMMON: {
    login: {
      method: 'POST',
      path: '/api/auth/login',
      payload: { email: 'user@example.com', password: 'password123' },
      response: 'See LOGIN_RESPONSES above'
    },
    logout: {
      method: 'POST',
      path: '/api/auth/logout',
      auth: true
    }
  },

  // Admin-specific endpoints
  ADMIN: {
    // Users
    listUsers: {
      method: 'GET',
      path: '/api/users',
      auth: true
    },
    createUser: {
      method: 'POST',
      path: '/api/users',
      auth: true,
      payload: { name: 'New User', email: 'user@example.com', role: 'Employee', password: 'temp123' }
    },
    updateUser: {
      method: 'PUT',
      path: '/api/users/:id',
      auth: true,
      payload: { name: 'Updated Name', role: 'Manager' }
    },
    deleteUser: {
      method: 'DELETE',
      path: '/api/users/:id',
      auth: true
    },

    // Clients
    listClients: {
      method: 'GET',
      path: '/api/clients',
      auth: true,
      query: { search: 'optional', status: 'Active', includeDeleted: '0' }
    },
    createClient: {
      method: 'POST',
      path: '/api/clients',
      auth: true,
      payload: {
        name: 'Client Name',
        company: 'Company Ltd',
        billingAddress: '123 Street',
        gstNumber: 'GST123',
        status: 'Active',
        contacts: [{ name: 'Contact Person', email: 'contact@company.com', phone: '1234567890', is_primary: 1 }]
      }
    },
    getClient: {
      method: 'GET',
      path: '/api/clients/:id',
      auth: true
    },
    updateClient: {
      method: 'PUT',
      path: '/api/clients/:id',
      auth: true,
      payload: { name: 'Updated Client', status: 'Inactive' }
    },
    deleteClient: {
      method: 'DELETE',
      path: '/api/clients/:id',
      auth: true
    },
    softDeleteClient: {
      method: 'DELETE',
      path: '/api/clients/:id',
      auth: true,
      note: 'Sets isDeleted=1 if column exists'
    },
    restoreClient: {
      method: 'POST',
      path: '/api/clients/:id/restore',
      auth: true
    },

    // Projects
    listProjects: {
      method: 'GET',
      path: '/api/projects',
      auth: true,
      query: { clientPublicId: 'optional', status: 'Active' }
    },
    createProject: {
      method: 'POST',
      path: '/api/projects',
      auth: true,
      payload: {
        projectName: 'New Project',
        description: 'Project description',
        clientPublicId: 'client_public_id',
        projectManagerPublicId: 'manager_public_id',
        departmentPublicIds: ['dept1', 'dept2'],
        priority: 'High',
        startDate: '2025-12-20',
        endDate: '2026-01-20',
        budget: 50000
      }
    },
    getProject: {
      method: 'GET',
      path: '/api/projects/:id',
      auth: true
    },
    updateProject: {
      method: 'PUT',
      path: '/api/projects/:id',
      auth: true,
      payload: { projectName: 'Updated Name', status: 'Completed' }
    },
    deleteProject: {
      method: 'DELETE',
      path: '/api/projects/:id',
      auth: true
    },

    // Tasks (Admin can create/update/delete)
    createTask: {
      method: 'POST',
      path: '/api/tasks',
      auth: true,
      payload: {
        title: 'Task Title',
        description: 'Task description',
        priority: 'HIGH',
        stage: 'TODO',
        taskDate: '2025-12-25',
        assigned_to: ['user_public_id_1', 'user_public_id_2'],
        client_id: 55,
        projectId: 13,
        projectPublicId: '816240a5f94b7f1c',
        time_alloted: 10,
        estimatedHours: 10,
        status: 'OPEN'
      },
      response: { message: 'Task created successfully', taskId: 167 }
    },
    updateTask: {
      method: 'PUT',
      path: '/api/projects/tasks/:id',
      auth: true,
      payload: {
        title: 'Updated Title',
        stage: 'IN_PROGRESS',
        priority: 'MEDIUM',
        assigned_to: ['public_id_1']
      },
      response: {
        success: true,
        message: 'Task updated successfully',
        data: {
          id: '167',
          title: 'Updated Title',
          stage: 'IN_PROGRESS',
          assignedUsers: [{ id: 'public_id_1', internalId: '25', name: 'User Name' }]
        }
      }
    },
    deleteTask: {
      method: 'DELETE',
      path: '/api/projects/tasks/:id',
      auth: true,
      response: { success: true, message: 'Task soft-deleted' }
    },
    getProjectTasks: {
      method: 'GET',
      path: '/api/projects/tasks',
      auth: true,
      query: { project_id: '13', projectPublicId: '816240a5f94b7f1c', includeDeleted: '0' },
      response: { success: true, data: [/* tasks */], meta: { count: 5 } }
    },
    getTaskById: {
      method: 'GET',
      path: '/api/tasks/gettaskbyId/:task_id',
      auth: true
    },

    // Departments
    listDepartments: {
      method: 'GET',
      path: '/api/admin/departments',
      auth: true
    },
    createDepartment: {
      method: 'POST',
      path: '/api/admin/departments',
      auth: true,
      payload: { name: 'Engineering', description: 'Tech team' }
    },
    deleteDepartment: {
      method: 'DELETE',
      path: '/api/admin/departments/:id',
      auth: true
    }
  },

  // Manager-specific endpoints
  MANAGER: {
    // Managers can create/update tasks, projects, view all users
    listUsers: {
      method: 'GET',
      path: '/api/users',
      auth: true
    },
    listClients: {
      method: 'GET',
      path: '/api/clients',
      auth: true
    },
    createTask: {
      method: 'POST',
      path: '/api/tasks',
      auth: true,
      payload: 'Same as Admin createTask'
    },
    updateTask: {
      method: 'PUT',
      path: '/api/projects/tasks/:id',
      auth: true,
      payload: 'Same as Admin updateTask'
    },
    deleteTask: {
      method: 'DELETE',
      path: '/api/projects/tasks/:id',
      auth: true
    },
    createProject: {
      method: 'POST',
      path: '/api/projects',
      auth: true,
      payload: 'Same as Admin createProject'
    },
    updateProject: {
      method: 'PUT',
      path: '/api/projects/:id',
      auth: true
    },
    getProjectTasks: {
      method: 'GET',
      path: '/api/projects/tasks',
      auth: true,
      query: { project_id: '13' }
    },
    listProjects: {
      method: 'GET',
      path: '/api/projects',
      auth: true
    }
  },

  // Employee-specific endpoints
  EMPLOYEE: {
    // Employees can only view assigned tasks and add activities/hours
    getMyTasks: {
      method: 'GET',
      path: '/api/tasks/gettasks',
      auth: true,
      note: 'Returns only tasks assigned to logged-in employee',
      response: [
        {
          task_id: 167,
          client_name: 'nikitha kondareddy',
          title: 'Landing Page 0',
          stage: 'PENDING',
          taskDate: '2025-12-22T18:30:00.000Z',
          priority: 'MEDIUM',
          assigned_users: [{ user_id: 'd96acaea378d5fe5', user_name: 'Employee User' }]
        }
      ]
    },
    getTaskById: {
      method: 'GET',
      path: '/api/tasks/gettaskbyId/:task_id',
      auth: true,
      note: 'Returns 403 if task not assigned to employee'
    },
    getTaskActivities: {
      method: 'GET',
      path: '/api/tasks/taskdetail/getactivity/:id',
      auth: true,
      response: [{ type: 'comment', activity: 'Left feedback', createdAt: '2025-12-18T06:30:00.000Z', user_name: 'Employee User' }]
    },
    addTaskActivity: {
      method: 'POST',
      path: '/api/tasks/taskdetail/Postactivity',
      auth: true,
      payload: { task_id: 167, user_id: 45, type: 'comment', activity: 'Started work on header' },
      response: { message: 'Task activity added successfully.', id: 789 }
    },
    createSubtask: {
      method: 'POST',
      path: '/api/tasks/createsub/:task_id',
      auth: true,
      payload: { title: 'Design header', due_date: '2025-12-20', tag: 'ui' },
      response: { success: true, message: 'Subtask created successfully', data: { id: 555, task_id: 167, title: 'Design header' } }
    },
    getSubtasks: {
      method: 'GET',
      path: '/api/tasks/getsubtasks/:task_id',
      auth: true
    },
    postWorkingHours: {
      method: 'POST',
      path: '/api/tasks/working-hours',
      auth: true,
      payload: { task_id: 167, date: '2025-12-18', start_time: '09:00', end_time: '12:00' },
      response: { message: 'Working hours added successfully' }
    },
    getTotalWorkingHours: {
      method: 'GET',
      path: '/api/tasks/total-working-hours/:task_id',
      auth: true,
      response: { total_working_hours: 23 }
    },
    postTaskHours: {
      method: 'POST',
      path: '/api/tasks/taskhours',
      auth: true,
      payload: { encryptedData: '<encrypted>' },
      note: 'Accepts AES-encrypted JSON with taskId, userId, date, hours'
    },
    selectedDetails: {
      method: 'POST',
      path: '/api/tasks/selected-details',
      auth: true,
      payload: { taskIds: [167, 168] },
      response: {
        success: true,
        data: [
          {
            id: '167',
            title: 'Landing Page 0',
            description: 'landing pages colour',
            checklist: [{ id: 1, title: 'Design header', dueDate: '2025-12-20', tag: 'ui' }],
            activities: [{ type: 'comment', activity: 'Started', createdAt: '2025-12-18T06:30:00.000Z', user: { id: '45', name: 'Employee User' } }],
            totalHours: 3
          }
        ],
        meta: { count: 1 }
      }
    }
  },

  // Client-Viewer endpoints (read-only)
  CLIENT_VIEWER: {
    viewClients: {
      method: 'GET',
      path: '/api/clients',
      auth: true,
      note: 'Limited to mapped client only'
    },
    viewProjects: {
      method: 'GET',
      path: '/api/projects',
      auth: true,
      note: 'Limited to projects for mapped client'
    },
    viewTasks: {
      method: 'GET',
      path: '/api/tasks/gettasks',
      auth: true,
      note: 'Read-only access to tasks for mapped client'
    },
    viewProjectTasks: {
      method: 'GET',
      path: '/api/projects/tasks',
      auth: true,
      query: { project_id: '13' }
    }
  }
};

// ==================== FRONTEND INTEGRATION GUIDE ====================
const FRONTEND_GUIDE = {
  authentication: {
    login: {
      endpoint: 'POST /api/auth/login',
      payload: { email: 'user@example.com', password: 'password123' },
      onSuccess: `
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
      `,
      notes: [
        'Store token and user profile in localStorage or secure storage',
        'Use user.role to determine UI permissions',
        'Use user.public_id for external references (preferred)',
        'user._id is internal numeric ID'
      ]
    },
    attachAuthHeader: `
      // Axios example
      import axios from 'axios';
      const api = axios.create({ baseURL: 'http://localhost:4000/api' });
      
      api.interceptors.request.use(config => {
        const token = localStorage.getItem('token');
        if (token) config.headers.Authorization = \`Bearer \${token}\`;
        return config;
      });
      
      // Handle 401 (unauthorized) globally
      api.interceptors.response.use(
        response => response,
        error => {
          if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location = '/login';
          }
          return Promise.reject(error);
        }
      );
      
      export default api;
    `,
    logout: `
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Optionally call POST /api/auth/logout
      window.location = '/login';
    `
  },

  roleBasedUI: {
    description: 'Show/hide UI elements based on user.role',
    example: `
      const user = JSON.parse(localStorage.getItem('user'));
      const role = user?.role;
      
      // Conditional rendering
      {role === 'Admin' && <AdminPanel />}
      {['Admin', 'Manager'].includes(role) && <CreateTaskButton />}
      {role === 'Employee' && <MyTasksView />}
      {role === 'Client-Viewer' && <ReadOnlyDashboard />}
    `,
    permissions: {
      Admin: ['Full CRUD on users, clients, projects, tasks', 'Access all endpoints', 'Delete permanently'],
      Manager: ['Create/update tasks and projects', 'View all clients and users', 'Assign tasks to employees'],
      Employee: ['View only assigned tasks', 'Add activities, hours, subtasks to assigned tasks', 'Cannot create or delete tasks'],
      'Client-Viewer': ['Read-only access', 'View only mapped client data', 'Cannot modify anything']
    }
  },

  commonPatterns: {
    createTask: {
      endpoint: 'POST /api/tasks or POST /api/tasks/createjson',
      payload: {
        title: 'Task Title',
        description: 'Description',
        priority: 'HIGH', // HIGH | MEDIUM | LOW
        stage: 'TODO', // TODO | IN_PROGRESS | COMPLETED | PENDING
        taskDate: '2025-12-25', // due date
        assigned_to: ['user_public_id_1', 'user_public_id_2'], // array of public_ids or numeric _id
        client_id: 55, // numeric client id
        projectId: 13, // numeric project id (optional)
        projectPublicId: '816240a5f94b7f1c', // OR project public_id (optional)
        time_alloted: 10, // hours
        estimatedHours: 10, // same as time_alloted
        status: 'OPEN' // optional
      },
      response: { message: 'Task created successfully', taskId: 167, assignedUsers: ['...'] }
    },

    updateTask: {
      endpoint: 'PUT /api/projects/tasks/:id',
      payload: {
        title: 'Updated Title', // optional
        stage: 'IN_PROGRESS', // optional
        priority: 'MEDIUM', // optional
        description: 'Updated desc', // optional
        assigned_to: ['public_id_1', 'public_id_2'], // optional - replaces all assignments
        taskDate: '2025-12-26', // optional
        time_alloted: 15 // optional
      },
      response: {
        success: true,
        message: 'Task updated successfully',
        data: {
          id: '167',
          title: 'Updated Title',
          stage: 'IN_PROGRESS',
          assignedUsers: [{ id: 'public_id', internalId: '25', name: 'Name' }],
          createdAt: '2025-12-18T06:28:32.000Z',
          updatedAt: '2025-12-18T12:00:00.000Z'
        }
      },
      notes: [
        'PUT returns the full updated task object in response.data',
        'Use this object to update UI immediately without extra GET',
        'PUT will restore soft-deleted tasks (clears isDeleted flag)',
        'Only include fields you want to update (partial update)'
      ]
    },

    deleteTask: {
      endpoint: 'DELETE /api/projects/tasks/:id',
      response: { success: true, message: 'Task soft-deleted' },
      notes: [
        'If DB has isDeleted column, performs soft-delete (isDeleted=1)',
        'Otherwise performs hard delete (cascade removes related data)',
        'Remove task from UI list after successful delete'
      ]
    },

    getProjectTasks: {
      endpoint: 'GET /api/projects/tasks',
      query: {
        project_id: '13', // numeric or public_id string
        projectPublicId: '816240a5f94b7f1c', // OR use this
        includeDeleted: '1' // optional: include soft-deleted tasks
      },
      response: {
        success: true,
        data: [
          {
            id: '167',
            title: 'Task Title',
            stage: 'PENDING',
            priority: 'MEDIUM',
            assignedUsers: [{ id: 'public_id', internalId: '25', name: 'User Name' }],
            client: { id: '55', name: 'Client Name' }
          }
        ],
        meta: { count: 1 }
      },
      notes: [
        'Backend searches both project_id and project_public_id columns',
        'Soft-deleted tasks excluded by default (pass includeDeleted=1 to see them)'
      ]
    },

    selectedDetails: {
      endpoint: 'POST /api/tasks/selected-details',
      payload: { taskIds: [167, 168] },
      response: {
        success: true,
        data: [
          {
            id: '167',
            title: 'Task Title',
            description: 'Description',
            stage: 'PENDING',
            assignedUsers: [{ id: 'public_id', internalId: '25', name: 'Name' }],
            checklist: [{ id: 1, title: 'Subtask', dueDate: '2025-12-20', tag: 'ui' }],
            activities: [{ type: 'comment', activity: 'Comment text', createdAt: '2025-12-18T06:30:00.000Z', user: { id: '45', name: 'User' } }],
            totalHours: 3
          }
        ],
        meta: { count: 1 }
      },
      notes: [
        'Fetch multiple tasks with all related data in one call',
        'Includes subtasks (checklist), activities, and total hours'
      ]
    }
  },

  fieldConventions: {
    ids: [
      'public_id: string (e.g., "d96acaea378d5fe5") - use for external refs',
      '_id or id: numeric internal ID - use for DB queries',
      'Frontend should prefer sending/displaying public_id'
    ],
    timestamps: [
      'All timestamps in ISO 8601 format: "2025-12-18T06:28:32.000Z"',
      'Use new Date(timestamp) or dayjs(timestamp) for parsing'
    ],
    assignments: [
      'assigned_to / assignedUsers accepts array of public_id strings or numeric _id',
      'Backend resolves both and stores internal _id in taskassignments',
      'Response returns both public_id (id) and internal _id (internalId)'
    ],
    projects: [
      'projectId: numeric id',
      'projectPublicId: string public_id',
      'Backend accepts either; both are stored if columns exist'
    ]
  },

  errorHandling: {
    401: 'Unauthorized - token invalid/expired → clear auth and redirect to login',
    403: 'Forbidden - user lacks permission for this resource',
    404: 'Not found - resource does not exist',
    400: 'Bad request - validation error → show error message to user',
    500: 'Server error - show generic error, offer retry'
  },

  bestPractices: [
    'Store JWT token securely (httpOnly cookie preferred for web, secure storage for mobile)',
    'Always attach Authorization: Bearer <token> header',
    'Use public_id for user-facing IDs and external refs',
    'After PUT, use returned data object to update UI (avoid extra GET)',
    'Handle soft-deletes: tasks excluded by default, use includeDeleted=1 if needed',
    'Validate role-based permissions on frontend AND backend',
    'Show meaningful error messages for 400/422 validation errors',
    'Implement auto-logout on 401 (token expired)',
    'Use loading states and optimistic updates for better UX'
  ]
};

// ==================== EXPORTS ====================
module.exports = {
  ROLES,
  LOGIN_RESPONSES,
  API_ENDPOINTS,
  FRONTEND_GUIDE,
  
  // Helper to get endpoints for a specific role
  getEndpointsForRole(role) {
    const normalized = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    return {
      common: API_ENDPOINTS.COMMON,
      roleSpecific: API_ENDPOINTS[normalized.toUpperCase().replace('-', '_')] || {}
    };
  },
  
  // Helper to get login response example
  getLoginResponse(role) {
    return LOGIN_RESPONSES[role] || null;
  },
  
  // Print summary
  printSummary() {
    console.log('=== TaskBe API Guide ===\n');
    console.log('Roles:', Object.values(ROLES).join(', '));
    console.log('\nEndpoint Categories:');
    console.log('  - Common:', Object.keys(API_ENDPOINTS.COMMON).length, 'endpoints');
    console.log('  - Admin:', Object.keys(API_ENDPOINTS.ADMIN).length, 'endpoints');
    console.log('  - Manager:', Object.keys(API_ENDPOINTS.MANAGER).length, 'endpoints');
    console.log('  - Employee:', Object.keys(API_ENDPOINTS.EMPLOYEE).length, 'endpoints');
    console.log('  - Client-Viewer:', Object.keys(API_ENDPOINTS.CLIENT_VIEWER).length, 'endpoints');
    console.log('\nLogin responses available for:', Object.keys(LOGIN_RESPONSES).join(', '));
    console.log('\nFrontend guide sections:', Object.keys(FRONTEND_GUIDE).join(', '));
  }
};
