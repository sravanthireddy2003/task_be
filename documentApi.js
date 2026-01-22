// Frontend API client for Document Management Module
// Assumes JWT token is stored in localStorage as 'token'
// Base URL should be set to your backend (e.g., 'http://localhost:4000/api')

class DocumentAPI {
  constructor(baseURL = 'http://localhost:4000/api') {
    this.baseURL = baseURL;
  }

  // Helper: Get auth headers
  getHeaders(includeContentType = true) {
    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': token ? `Bearer ${token}` : ''
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  // Helper: Handle API responses
  async handleResponse(response) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // 1. Upload Document
  async uploadDocument(file, options = {}) {
    const formData = new FormData();
    formData.append('document', file);
    if (options.entityType) formData.append('entityType', options.entityType);
    if (options.entityId) formData.append('entityId', options.entityId);
    if (options.projectId) formData.append('projectId', options.projectId);
    if (options.clientId) formData.append('clientId', options.clientId);
    if (options.taskId) formData.append('taskId', options.taskId);

    const response = await fetch(`${this.baseURL}/documents/upload`, {
      method: 'POST',
      headers: { 'Authorization': this.getHeaders(false).Authorization }, // No Content-Type for FormData
      body: formData
    });
    return this.handleResponse(response);
  }

  // 2. List Documents
  async listDocuments(params = {}) {
    const query = new URLSearchParams();
    if (params.projectId) query.append('projectId', params.projectId);
    if (params.clientId) query.append('clientId', params.clientId);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);

    const response = await fetch(`${this.baseURL}/documents?${query}`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }

  // 3. Preview Document
  async previewDocument(documentId) {
    const response = await fetch(`${this.baseURL}/documents/${documentId}/preview`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }

  // 4. Download Document
  async downloadDocument(documentId) {
    const response = await fetch(`${this.baseURL}/documents/${documentId}/download`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    // Trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'file';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // 5. Assign/Revoke Document Access (bulk)
  async assignAccess(documentId, assigneeIds, permissionLevel) {
    const payload = {
      documentId,
      assigneeIds: Array.isArray(assigneeIds) ? assigneeIds : [assigneeIds],
      permissionLevel
    };
    const response = await fetch(`${this.baseURL}/documents/access`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    return this.handleResponse(response);
  }

  // 5b. Assign Access to Single User
  async assignAccessSingle(documentId, assigneeId, accessType) {
    const payload = {
      assigneeId,
      accessType
    };
    const response = await fetch(`${this.baseURL}/documents/${documentId}/assign-access`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    return this.handleResponse(response);
  }

  // 6. Get My Documents (Inbox)
  async getMyDocuments() {
    const response = await fetch(`${this.baseURL}/documents/my`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }
  // 7. Get Project Members
  async getProjectMembers(projectId) {
    const response = await fetch(`${this.baseURL}/documents/project/${projectId}/members`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }

  // 8. Get Notifications (for access updates)
  async getNotifications(limit = 50, offset = 0) {
    const response = await fetch(`${this.baseURL}/notifications?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }

  // 9. Mark Notification as Read
  async markNotificationRead(notificationId) {
    const response = await fetch(`${this.baseURL}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }
}

// Export for use in frontend
// Example: const docAPI = new DocumentAPI(); docAPI.listDocuments({ projectId: '123' });
export default DocumentAPI;