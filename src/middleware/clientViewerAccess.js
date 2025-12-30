/**
 * Client-Viewer Access Control Middleware
 * Restricts Client-Viewer users to only their assigned client and allowed endpoints
 * Enforces read-only access with proper access level validation
 */

const db = require('../db');

module.exports = async function clientViewerAccessControl(req, res, next) {
  try {
    // Only enforce for Client-Viewer role
    if (!req.user || req.user.role !== 'Client-Viewer') {
      return next();
    }

    // Only enforce GET requests (read-only)
    if (req.method !== 'GET') {
      return res.status(403).json({
        success: false,
        error: 'Client-Viewer users have read-only access. POST, PUT, DELETE not allowed.'
      });
    }

    // Get the client ID mapped to this viewer
    const clientId = await new Promise(resolve => {
      db.query(
        'SELECT client_id FROM client_viewers WHERE user_id = ? LIMIT 1',
        [req.user._id],
        (err, results) => {
          resolve(results && results[0] ? results[0].client_id : null);
        }
      );
    });

    if (!clientId) {
      return res.status(403).json({
        success: false,
        error: 'No client assigned to this viewer'
      });
    }

    // Attach the client ID to request for use in route handlers
    req.viewerMappedClientId = clientId;

    // Define allowed endpoints for Client-Viewer
    const allowedPatterns = [
      /^\/api\/clients\/\d+$/,           // GET /api/clients/:id
      /^\/api\/tasks$/,                  // GET /api/tasks
      /^\/api\/tasks\/\d+$/,             // GET /api/tasks/:id
      /^\/api\/documents$/,              // GET /api/documents
      /^\/api\/documents\/\d+$/,         // GET /api/documents/:id
      /^\/api\/users\/profile$/,         // GET /api/users/profile
      /^\/api\/clients\/\d+\/tasks$/,    // GET /api/clients/:id/tasks
      /^\/api\/clients\/\d+\/documents$/ // GET /api/clients/:id/documents
    ];

    const requestPath = req.path;
    const isAllowed = allowedPatterns.some(pattern => pattern.test(requestPath));

    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: `Access denied to ${req.method} ${requestPath}. Client-Viewer has limited read-only access.`,
        allowedEndpoints: [
          'GET /api/clients/:id',
          'GET /api/tasks',
          'GET /api/tasks/:id',
          'GET /api/documents',
          'GET /api/documents/:id',
          'GET /api/users/profile',
          'GET /api/clients/:id/tasks',
          'GET /api/clients/:id/documents'
        ]
      });
    }

    // For client-specific endpoints, validate the requested client matches the mapped client
    const clientIdMatch = requestPath.match(/\/api\/clients\/(\d+)/);
    if (clientIdMatch) {
      const requestedClientId = parseInt(clientIdMatch[1], 10);
      if (requestedClientId !== clientId) {
        return res.status(403).json({
          success: false,
          error: `Access denied: You are only allowed to view client ID ${clientId}`
        });
      }
    }

    // Attach access level for route handlers
    req.accessLevel = 'Limited Read-Only';
    req.allowedModules = ['Dashboard', 'Assigned Tasks', 'Documents'];

    return next();
  } catch (e) {
    console.error('Error in clientViewerAccessControl:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Access control check failed',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
};
