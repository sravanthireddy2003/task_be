// src/middleware/ruleEngine.js
// Middleware to integrate Rule Engine

// Use the new json-rules-engine backed Rule Engine (backward-compatible API)
const ruleEngine = require('../rules/jsonRuleEngine');
const db = require('../db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (e, r) => e ? reject(e) : resolve(r)));

const ruleEngineMiddleware = (ruleCode = null) => {
  return async (req, res, next) => {
    try {
      // Get user from req.user (set by auth middleware)
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Optional: Fetch resource if needed (e.g., for ownership check)
      let resource = {};
      if (req.params.id) {
        // Placeholder: Fetch resource based on route
        // This would need to be customized per route
        // For example, if it's a task, fetch task details
        resource = { id: req.params.id }; // Extend as needed
      }

      // Evaluate rules (now async)
      const decision = await ruleEngine.evaluate(req, user, resource, ruleCode);

      if (!decision.allowed) {
        // Fallback: when no matching rule exists, allow common project-scoped actions
        if (decision.ruleCode === 'NO_RULE_MATCH') {
          try {
            const isProjectRule = String(ruleCode || '').toLowerCase().includes('project') || (req.baseUrl && req.baseUrl.includes('/projects'));
            if (isProjectRule) {
              const projectParam = req.params && (req.params.projectId || req.params.id || req.params.project_id) || req.body && (req.body.projectId || req.body.project_id);
              if (projectParam) {
                // resolve project internal id
                const projRows = await q('SELECT id FROM projects WHERE public_id = ? OR id = ? LIMIT 1', [projectParam, projectParam]).catch(() => []);
                const pid = projRows && projRows[0] && projRows[0].id;
                if (pid) {
                  // Admin bypass
                  if (user && (user.role === 'Admin')) {
                    return next();
                  }
                  // Check project manager or creator
                  const pcheck = await q('SELECT COUNT(*) AS cnt FROM projects WHERE id = ? AND (project_manager_id = ? OR created_by = ?)', [pid, user._id, user._id]).catch(() => []);
                  if (pcheck && pcheck[0] && pcheck[0].cnt > 0) return next();
                  // Check task assignment in project
                  const tcheck = await q(`SELECT COUNT(*) AS cnt FROM taskassignments ta JOIN tasks t ON ta.task_id = t.id WHERE t.project_id = ? AND ta.user_id = ?`, [pid, user._id]).catch(() => []);
                  if (tcheck && tcheck[0] && tcheck[0].cnt > 0) return next();
                }
              }
            }
          } catch (e) {
            // ignore fallback errors and continue to deny below
          }
        }

        return res.status(403).json({
          success: false,
          error: decision.reason,
          ruleCode: decision.ruleCode,
          nextAction: decision.nextAction
        });
      }

      // Proceed to controller
      next();
    } catch (error) {
      console.error('Rule Engine Middleware Error:', error);
      return res.status(500).json({ success: false, error: 'Rule evaluation failed' });
    }
  };
};

module.exports = ruleEngineMiddleware;