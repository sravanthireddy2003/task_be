const jsr = require('./src/rules/jsonRuleEngine');
const { buildRuleContext } = require('./src/rules/ruleContext');
const req = {
    method: 'POST',
    route: { path: '/' },
    baseUrl: '/api/projects',
    body: { projectName: 'Test', clientPublicId: 123 }
};
const user = { _id: 1, role: 'Admin' };
const context = buildRuleContext(req, user, {});
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
jsr.evaluateFromRules(rules, context).then(console.log);
