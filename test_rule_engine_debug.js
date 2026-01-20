const r = require('./src/rules/jsonRuleEngine');
(async () => {
  try {
    await r.loadRules();
    console.log('Rules loaded:', r.rules.length);
    const rule = r.rules.find(x => x.ruleCode === 'project_creation');
    console.log('Project rule:', rule && rule.conditions);
    const req = { method: 'POST', route: { path: '/' }, baseUrl: '/api/projects', path: '/api/projects', body: { name: 'Test Project', client_id: '1' } };
    const user = { _id: 23, id: '23', role: 'Admin' };
    const ctx = require('./src/rules/ruleContext').buildRuleContext(req, user, {});
    console.log('Context:', ctx);
    const facts = r.flattenContext(ctx);
    console.log('Facts:', facts);
    const matched = await r.runEngineForRule(rule, facts);
    console.log('Matched?', matched);
    const decision = await r.evaluate(req, user, {}, 'project_creation');
    console.log('Final decision:', decision);
  } catch (e) {
    console.error('ERR', e);
  }
})();