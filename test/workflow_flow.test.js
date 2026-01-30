// Simple workflow flow script (not a unit test framework) — uses axios
const axios = require('axios');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN = { email: process.env.TEST_ADMIN_EMAIL || 'admin@example.com', password: process.env.TEST_ADMIN_PASSWORD || 'admin123' };
const TENANT = process.env.TEST_TENANT || '1';

async function login() {
  const r = await axios.post(`${BASE}/api/auth/login`, { email: ADMIN.email, password: ADMIN.password });
  return r.data && r.data.token;
}

async function run() {
  try {
    logger.info('Logging in as admin...');
    const token = await login();
    logger.info('Token:', !!token);

    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Id': TENANT };

    logger.info('1) Create workflow template');
    const createTpl = await axios.post(`${BASE}/api/admin/workflows/templates`, {
      tenant_id: parseInt(TENANT, 10),
      name: 'Automated Payroll Review',
      trigger_event: 'TASK_REVIEW',
      department_id: 3,
      department_name: 'HR',
      project_id: 45,
      project_name: 'Payroll System',
      active: true,
      created_by: 1
    }, { headers });
    logger.info('Create template response:', createTpl.data);
    const templateId = createTpl.data && createTpl.data.data && createTpl.data.data.id;

    logger.info('2) Add manager review step');
    await axios.post(`${BASE}/api/admin/workflows/steps`, {
      template_id: templateId,
      step_order: 1,
      role: 'MANAGER',
      action: 'REVIEW',
      sla_hours: 4,
      notify: ['MANAGER']
    }, { headers });

    logger.info('3) Add admin approval step');
    await axios.post(`${BASE}/api/admin/workflows/steps`, {
      template_id: templateId,
      step_order: 2,
      role: 'ADMIN',
      action: 'APPROVE',
      sla_hours: 12,
      notify: ['ADMIN']
    }, { headers });

    logger.info('4) Trigger workflow (simulate employee)');
    const trigger = await axios.post(`${BASE}/api/workflow/trigger`, {
      tenant_id: parseInt(TENANT, 10),
      entity_type: 'TASK',
      entity_id: 123,
      entity_name: 'Prepare Salary Register',
      department_id: 3,
      department_name: 'HR',
      project_id: 45,
      project_name: 'Payroll System',
      priority: 'HIGH',
      created_by: { id: 7, name: 'Ramesh Kumar', role: 'EMPLOYEE' }
    }, { headers });

    logger.info('Trigger response:', trigger.data);
    const instanceId = trigger.data && trigger.data.data && trigger.data.data.instance_id;

    logger.info('5) Manager -> get queue');
    const queue = await axios.get(`${BASE}/api/manager/workflows/queue`, { headers });
    logger.info('Queue length:', (queue.data && queue.data.data && queue.data.data.length) || 'unknown');

    if (instanceId) {
      logger.info('6) Manager approve instance', instanceId);
      const approve = await axios.post(`${BASE}/api/manager/workflows/${instanceId}/approve`, { comment: 'OK' }, { headers });
      logger.info('Approve response:', approve.data);

      logger.info('7) Admin close instance');
      const close = await axios.post(`${BASE}/api/admin/workflows/${instanceId}/close`, { comment: 'Final approval' }, { headers });
      logger.info('Close response:', close.data);

      logger.info('8) Fetch history');
      const history = await axios.get(`${BASE}/api/workflow/${instanceId}/history`, { headers });
      logger.info('History:', history.data);
    }

    logger.info('Workflow flow script completed.');
  } catch (err) {
    logger.error('Error during workflow flow:', err && err.response ? err.response.data : err && err.message);
  }
}

if (require.main === module) run();

module.exports = { run };
