const db = require('../src/db');

const q = (sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

async function main() {
  try {
    console.log('Seeding audit_logs with full example entries...');

    const samples = [
      {
        actor_id: null,
        action: 'Project Deleted',
        entity: 'Project',
        entity_id: 'PRJ-1023',
        details: JSON.stringify({ performedBy: 'Admin', userName: 'Ashwini', tenant: 'Company A', ipAddress: '103.xxx.xx.21', device: 'Chrome / Windows', status: 'Success' })
      },
      {
        actor_id: null,
        action: 'Task Assigned',
        entity: 'Task',
        entity_id: 'TASK-221',
        details: JSON.stringify({ assignedTo: 'Employee-12', performedBy: 'Manager', project: 'Website Revamp', status: 'Success' })
      },
      {
        actor_id: null,
        action: 'Task Status Updated',
        entity: 'Task',
        entity_id: 'TASK-221',
        details: JSON.stringify({ from: 'In Progress', to: 'Completed', performedBy: 'Employee', userName: 'Ashwini' })
      },
      {
        actor_id: null,
        action: 'Viewed Task',
        entity: 'Task',
        entity_id: 'TASK-221',
        details: JSON.stringify({ project: 'Website Revamp', clientName: 'ABC Corp' })
      },
      {
        actor_id: null,
        action: 'Login Success',
        entity: 'Auth',
        entity_id: null,
        details: JSON.stringify({ userRole: 'Manager', location: 'Bangalore, India', device: 'Mobile' })
      },
      {
        actor_id: null,
        action: 'Login Failed',
        entity: 'Auth',
        entity_id: null,
        details: JSON.stringify({ reason: 'Invalid Password', attemptsLeft: 2 })
      },
      {
        actor_id: null,
        action: 'Task Approved',
        entity: 'Task',
        entity_id: 'TASK-331',
        details: JSON.stringify({ approvedBy: 'Manager', previousStatus: 'Pending Approval', newStatus: 'Approved' })
      },
      {
        actor_id: null,
        action: 'Notification Sent',
        entity: 'Notification',
        entity_id: null,
        details: JSON.stringify({ type: 'Deadline Reminder', channel: 'Email', sentTo: 'Employee-21' })
      },
      {
        actor_id: null,
        action: 'File Uploaded',
        entity: 'Client',
        entity_id: 'CL-112',
        details: JSON.stringify({ fileName: 'Agreement.pdf', uploadedBy: 'Admin' })
      },
      {
        actor_id: null,
        action: 'System Error',
        entity: 'System',
        entity_id: null,
        details: JSON.stringify({ status: 'error', message: 'Something went wrong. Please try again later.', errorCode: 'SERVER_500', requestId: 'REQ-88921' })
      }
    ];

    for (const s of samples) {
      await q('INSERT INTO audit_logs (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)', [s.actor_id, s.action, s.entity, s.entity_id, s.details]);
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (e) {
    console.error('Seeding failed:', e && e.message);
    process.exit(2);
  }
}

if (require.main === module) main();
