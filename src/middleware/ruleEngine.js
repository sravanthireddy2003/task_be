// src/middleware/ruleEngine.js
// Middleware to integrate Rule Engine

const ruleEngine = require('../rules/ruleEngine');

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