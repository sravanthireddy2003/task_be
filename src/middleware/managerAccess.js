/**
 * ManagerAccessMiddleware
 * Restricts Manager access to only their assigned clients
 * Admins see all clients
 */
const db = require('../db');

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

module.exports = async function managerAccessMiddleware(req, res, next) {
  try {
    // Only apply to Managers (Admins and Client-Viewers have different restrictions)
    if (!req.user || req.user.role !== 'Manager') {
      return next();
    }

    const managerId = req.user._id;
    const clientIdFromRoute = req.params.id;

    // For list endpoints (no :id), no need to check here
    if (!clientIdFromRoute) {
      return next();
    }

    // Verify manager is assigned to this client
    const assignedClients = await q(
      'SELECT id FROM clientss WHERE id = ? AND manager_id = ? LIMIT 1',
      [clientIdFromRoute, managerId]
    );

    if (!assignedClients || assignedClients.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not assigned to this client'
      });
    }

    // Attach flag indicating manager is assigned
    req.isManagerOfClient = true;
    return next();
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: 'Internal error checking manager access'
    });
  }
};
