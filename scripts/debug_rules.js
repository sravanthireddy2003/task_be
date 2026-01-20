#!/usr/bin/env node
require('dotenv').config();

// Debug script: lists active rules and evaluates a rule for a given user
// Usage: node scripts/debug_rules.js <userPublicId> <ruleCode>

(async () => {
  try {
    const args = process.argv.slice(2);
    const userId = args[0] || process.env.DEBUG_USER_PUBLIC_ID || 'admin-public-id';
    const ruleCode = args[1] || process.env.DEBUG_RULE_CODE || 'user_list_admin';

    const engine = require('../src/rules/jsonRuleEngine');
    const db = require('../src/config/db');

    // create a minimal fake req as buildRuleContext expects req-like shape
    // Use realistic path/route so buildRuleContext can construct the `action` string
    const routePathArg = args[2] || '/:id/start';
    const roleArg = args[3] || null;

    const fakeReq = {
      headers: {},
      query: {},
      body: {},
      params: {},
      ip: '127.0.0.1',
      method: 'POST',
      // route.path should be something like '/createjson' or '/:id/start'
      route: { path: routePathArg },
      // path/url can simulate the mounted path as well
      path: (args[4] || '/api/tasks' ) + routePathArg,
      url: (args[4] || '/api/tasks') + routePathArg
    };

      // short helper to simulate payload when requested
      if (args[5] === 'withPayload') {
        fakeReq.body = { title: 'Demo Task', projectId: 'demo-project' };
      }

    // Attempt to resolve provided id to an internal user record (_id).
    // If the provided identifier matches a public_id in the users table, use that row.
    let user = { _id: null, role: 'Admin', public_id: userId };
    try {
      const rows = await new Promise((resolve, reject) => {
        db.query('SELECT * FROM users WHERE public_id = ? LIMIT 1', [userId], (err, results) => {
          if (err) return reject(err);
          resolve(results || []);
        });
      });
      if (Array.isArray(rows) && rows.length) {
        user = rows[0];
      } else {
        // If no public_id match, and userId looks numeric, try matching _id
        if (/^\d+$/.test(userId)) {
          const r2 = await new Promise((resolve, reject) => {
            db.query('SELECT * FROM users WHERE _id = ? LIMIT 1', [userId], (err, results) => {
              if (err) return reject(err);
              resolve(results || []);
            });
          });
          if (Array.isArray(r2) && r2.length) user = r2[0];
        } else {
          // Fallback: set _id to the provided id so buildRuleContext can proceed in debug mode
          user._id = userId;
        }
      }
    } catch (e) {
      console.warn('Could not resolve user from DB, proceeding with minimal user object:', e && e.message);
      user._id = user._id || userId;
    }

    // Load rules from DB
    if (typeof engine.loadRules === 'function') await engine.loadRules();

    const rules = engine.rules || [];
    console.log('Loaded rules count:', rules.length);
    console.log('Rules (first 50):', rules.slice(0,50).map(r => ({ ruleCode: r.ruleCode, action: r.action, priority: r.priority, active: r.active })));

    const matching = rules.filter(r => r.ruleCode === ruleCode);
    if (matching.length === 0) {
      console.log('No rules found with ruleCode', ruleCode);
    } else {
      console.log('Found', matching.length, 'rule(s) for', ruleCode);
      matching.forEach((r, i) => {
        console.log(`--- Rule #${i+1} ---`);
        console.log('id:', r.id);
        console.log('description:', r.description);
        console.log('priority:', r.priority);
        console.log('conditions:', JSON.stringify(r.conditions, null, 2));
      });
    }
    // Allow role override for debugging (third arg)
    if (roleArg) user.role = roleArg;

    // Show built context for debugging
    try {
      const ctxBuilder = require('../src/rules/ruleContext');
      const ctx = ctxBuilder.buildRuleContext(fakeReq, user, {});
      console.log('\nBuilt rule context action variants:', JSON.stringify(ctx.action, null, 2));
    } catch (e) {
      console.warn('Could not build context for debug output:', e && e.message);
    }

    // Evaluate for provided ruleCode (falls back to all rules inside engine)
    const decision = await engine.evaluate(fakeReq, user, {}, ruleCode);
    console.log('\nEvaluation result for', ruleCode, ':');
    console.log(JSON.stringify(decision, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Debug script error:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
