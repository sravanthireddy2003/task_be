const ruleEngine = require('./src/rules/jsonRuleEngine');

async function run() {
  try {
    const req = {
      method: 'POST',
      route: { path: '/' },
      baseUrl: '/api/projects',
      path: '/api/projects',
      body: { name: 'Test Project', client_id: '1' },
      headers: {}
    };

    const user = { _id: 23, id: '23', role: 'Admin', name: 'Ashwini' };

    const decision = await ruleEngine.evaluate(req, user, {}, 'project_creation');
    console.log('Decision:', decision);
  } catch (e) {
    console.error('Error running rule engine test:', e);
  }
}

run();