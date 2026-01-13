const r = require('./src/rules/jsonRuleEngine');
(async () => {
  try {
    await r.loadRules();
    console.log('Loaded rules:', r.rules.length);
    const rule = r.rules.find(x => x.ruleCode === 'project_creation');
    console.log('Project rule conditions:', rule && rule.conditions);

    const req = {
      method: 'POST',
      route: { path: '/' },
      baseUrl: '/api/projects',
      path: '/api/projects',
      body: {
        projectName: 'project-2',
        clientPublicId: '62',
        department_ids: ['4e49293c3b67882b'],
        description: 'project has been uploading for development team',
        endDate: '2026-02-27',
        priority: 'High',
        projectManagerPublicId: null,
        startDate: '2026-01-14',
        budget: null
      }
    };

    const user = { _id: 24, id: '24', role: 'Manager', name: 'Manager User' };

    const decision = await r.evaluate(req, user, {}, 'project_creation');
    console.log('Decision:', decision);
  } catch (e) {
    console.error('Error:', e && e.message);
  }
})();