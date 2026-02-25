const { evaluateRules } = require('./src/rules/ruleEvaluator');
const context = {
    userRole: 'Admin',
    action: 'POST_',
    payload: { name: 'Test', client_id: 123 }
};
const rules = [{
    ruleCode: 'project_creation',
    active: true,
    priority: 1,
    conditions: {
        userRole: { $in: ['ADMIN', 'MANAGER'] },
        action: 'POST_',
        payload: { name: { $exists: true }, client_id: { $exists: true } }
    },
    action: 'ALLOW',
    description: 'Test rule'
}];
console.log(evaluateRules(rules, context));
process.exit();
