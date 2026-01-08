// src/rules/ruleEvaluator.js
// Evaluate rules against context

const evaluateCondition = (condition, context) => {
  // Simple condition evaluator (can be extended for complex logic)
  for (const [key, value] of Object.entries(condition)) {
    if (typeof value === 'object' && value !== null) {
      if (value.$ne && context[key] === value.$ne) return false;
      if (value.$eq && context[key] !== value.$eq) return false;
      if (value.$gt && !(context[key] > value.$gt)) return false;
      if (value.$lt && !(context[key] < value.$lt)) return false;
      if (value.$in && !value.$in.includes(context[key])) return false;
      if (value.$exists !== undefined) {
        const exists = context[key] !== undefined && context[key] !== null;
        if (value.$exists !== exists) return false;
      }
      if (value.$or) {
        const orResult = value.$or.some(subCond => evaluateCondition(subCond, context));
        if (!orResult) return false;
      }
      // Handle nested objects (like payload)
      if (!value.$ne && !value.$eq && !value.$gt && !value.$lt && !value.$in && !value.$exists && !value.$or) {
        // This is a nested condition object
        if (!evaluateCondition(value, context[key] || {})) return false;
      }
      // Handle template strings like '{{userId}}'
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const templateKey = value.slice(2, -2);
        if (context[key] !== context[templateKey]) return false;
      }
    } else {
      if (context[key] !== value) return false;
    }
  }
  return true;
};

const evaluateRules = (rules, context) => {
  // Sort rules by priority (lower number = higher priority)
  const sortedRules = rules.filter(rule => rule.active).sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (evaluateCondition(rule.conditions, context)) {
      const decision = {
        allowed: rule.action === 'ALLOW',
        reason: rule.description,
        ruleCode: rule.ruleCode,
        nextAction: rule.action === 'REQUIRE_APPROVAL' ? 'MANAGER_APPROVAL' : null
      };

      // Return decision for ALLOW, DENY, or REQUIRE_APPROVAL
      if (rule.action === 'ALLOW' || rule.action === 'DENY' || rule.action === 'REQUIRE_APPROVAL') {
        return decision;
      }

      // For MODIFY, apply modification (placeholder) and continue
      if (rule.action === 'MODIFY') {
        // Apply modifications to context or payload
        continue;
      }
    }
  }

  // Default deny if no rules match
  return {
    allowed: false,
    reason: 'No matching rule found',
    ruleCode: 'NO_RULE_MATCH',
    nextAction: null
  };
};

module.exports = { evaluateRules };