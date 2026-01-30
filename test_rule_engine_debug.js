let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
const r = require('./src/rules/jsonRuleEngine');
(async () => {
  try {
    await r.loadRules();
    logger.info('Rules loaded:', r.rules.length);
    const rule = r.rules.find(x => x.ruleCode === 'project_creation');
    logger.info('Project rule:', rule && rule.conditions);
    const req = { method: 'POST', route: { path: '/' }, baseUrl: '/api/projects', path: '/api/projects', body: { name: 'Test Project', client_id: '1' } };
    const user = { _id: 23, id: '23', role: 'Admin' };
    const ctx = require('./src/rules/ruleContext').buildRuleContext(req, user, {});
    logger.info('Context:', ctx);
    const facts = r.flattenContext(ctx);
    logger.info('Facts:', facts);
    const matched = await r.runEngineForRule(rule, facts);
    logger.info('Matched?', matched);
    const decision = await r.evaluate(req, user, {}, 'project_creation');
    logger.info('Final decision:', decision);
  } catch (e) {
    logger.error('ERR', e);
  }
})();