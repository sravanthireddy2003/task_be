// Lightweight tests for jsonRuleEngine.evaluateFromRules
const engine = require('../src/rules/jsonRuleEngine');

async function run() {
  // Positive case: Admin allowed
  const rules = [
    {
      ruleCode: 'user_list_admin',
      description: 'Allow admins to list users',
      conditions: { userRole: { $in: ['Admin'] } },
      action: 'ALLOW',
      priority: 1,
      active: true,
      version: '1.0'
    }
  ];

  const contextAdmin = { userId: 1, userRole: 'Admin', payload: {} };

  const res1 = await engine.evaluateFromRules(rules, contextAdmin);
  console.log('Test 1 (Admin allow) ->', res1);
  if (!res1.allowed) process.exitCode = 2;

  // Negative case: Employee denied by explicit deny rule
  const rules2 = [
    {
      ruleCode: 'deny_employee_list',
      description: 'Deny employees',
      conditions: { userRole: { $eq: 'Employee' } },
      action: 'DENY',
      priority: 1,
      active: true,
      version: '1.0'
    }
  ];

  const contextEmployee = { userId: 2, userRole: 'Employee', payload: {} };
  const res2 = await engine.evaluateFromRules(rules2, contextEmployee);
  console.log('Test 2 (Employee deny) ->', res2);
  if (res2.allowed) process.exitCode = 3;

  // Edge case: missing field -> default deny
  const rules3 = [
    {
      ruleCode: 'require_dept',
      description: 'Require department',
      conditions: { userDepartment: { $exists: true } },
      action: 'ALLOW',
      priority: 1,
      active: true,
      version: '1.0'
    }
  ];

  const contextNoDept = { userId: 3, userRole: 'Manager', payload: {} };
  const res3 = await engine.evaluateFromRules(rules3, contextNoDept);
  console.log('Test 3 (Missing dept -> deny) ->', res3);
  if (res3.allowed) process.exitCode = 4;

  console.log('Rule engine tests completed. Exit code:', process.exitCode || 0);
}

run().catch(e => {
  console.error('Rule tests failed', e);
  process.exit(1);
});
