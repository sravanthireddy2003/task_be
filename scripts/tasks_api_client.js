/*
 Tasks API client + examples
 Place this file in your frontend or scripts folder and adapt baseUrl/token as needed.
*/

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api/projects';

const endpoints = {
  listTasks: (projectId, departmentId) => {
    const qs = [];
    if (projectId) qs.push(`projectId=${encodeURIComponent(projectId)}`);
    if (departmentId) qs.push(`departmentId=${encodeURIComponent(departmentId)}`);
    return `${BASE_URL}/tasks${qs.length ? '?' + qs.join('&') : ''}`;
  },
  createTask: () => `${BASE_URL}/tasks`,
  getTask: (id) => `${BASE_URL}/tasks/${encodeURIComponent(id)}`,
  updateTask: (id) => `${BASE_URL}/tasks/${encodeURIComponent(id)}`,
  deleteTask: (id) => `${BASE_URL}/tasks/${encodeURIComponent(id)}`,
};

const samplePayloads = {
  createTask: {
    projectId: 'ac510b2dd0e311f088c200155daedf50', // numeric id or public_id
    departmentId: 2,
    title: 'Design homepage',
    description: 'Create hero section and CTA',
    priority: 'Medium',
    assignedTo: 'ac510bfcd0e311f088c200155daedf50', // user public_id or numeric _id
    startDate: '2025-01-10',
    endDate: '2025-01-20',
    estimatedHours: 16
  },
  updateTask: {
    title: 'Design homepage v2',
    status: 'In Progress',
    progressPercentage: 25,
    assignedTo: 'ac510bfcd0e311f088c200155daedf50'
  }
};

const sampleResponses = {
  createTask: {
    success: true,
    data: {
      id: '8f3a1c2b9d4e5f67',
      public_id: '8f3a1c2b9d4e5f67',
      project_id: 12,
      department_id: 2,
      title: 'Design homepage',
      description: 'Create hero section',
      status: 'New',
      priority: 'Medium',
      assigned_to: 25,
      assigned_user: { id: 'ac510bfcd0e311f088c200155daedf50', name: 'Employee User' },
      start_date: '2025-01-10',
      due_date: '2025-01-20',
      estimated_hours: 16,
      subtask_count: 0,
      created_by: 23,
      created_at: '2025-12-15T12:34:56.000Z'
    }
  }
};

// Lightweight fetch wrappers (browser or node >=18)
async function request(url, token, opts = {}) {
  const headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, Object.assign({}, opts, { headers }));
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body && body.message ? body.message : `HTTP ${res.status}`);
  return body;
}

async function listTasks({ projectId, departmentId, token } = {}) {
  // If no projectId is provided, fetch projects (frontend often needs project list)
  if (!projectId) {
    const url = BASE_URL; // /api/projects
    return request(url, token, { method: 'GET' });
  }

  const url = endpoints.listTasks(projectId, departmentId);
  return request(url, token, { method: 'GET' });
}

async function createTask({ payload, token } = {}) {
  const url = endpoints.createTask();
  return request(url, token, { method: 'POST', body: JSON.stringify(payload) });
}

async function getTask({ id, token } = {}) {
  const url = endpoints.getTask(id);
  return request(url, token, { method: 'GET' });
}

async function updateTask({ id, payload, token } = {}) {
  const url = endpoints.updateTask(id);
  return request(url, token, { method: 'PUT', body: JSON.stringify(payload) });
}

async function deleteTask({ id, token } = {}) {
  const url = endpoints.deleteTask(id);
  return request(url, token, { method: 'DELETE' });
}

module.exports = {
  BASE_URL,
  endpoints,
  samplePayloads,
  sampleResponses,
  listTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask
};
