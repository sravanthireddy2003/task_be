let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('./logger'); } catch (e2) { try { logger = require('../logger'); } catch (e3) { logger = console; } } }
// Migration script to create business_rules table and insert rules
const db = require('./src/config/db');

const createTableQuery = `
CREATE TABLE IF NOT EXISTS business_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  conditions JSON,
  action VARCHAR(50) NOT NULL,
  priority INT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  version VARCHAR(10) DEFAULT '1.0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
`;

const rules = [
  // Access Control Rules
  {
    ruleCode: 'ACCESS_OWN_RECORDS_ONLY',
    description: 'Users can only access their own records unless role is ADMIN',
    conditions: JSON.stringify({
      userRole: { $ne: 'ADMIN' },
      resourceOwnerId: { $ne: '{{userId}}' }
    }),
    action: 'DENY',
    priority: 1,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'ADMIN_FULL_ACCESS',
    description: 'Admins have full access',
    conditions: JSON.stringify({
      userRole: 'ADMIN'
    }),
    action: 'ALLOW',
    priority: 2,
    active: true,
    version: '1.0'
  },

  // Approval Rules
  {
    ruleCode: 'EMPLOYEE_CANNOT_APPROVE_OWN_REQUEST',
    description: 'Employees cannot approve their own requests',
    conditions: JSON.stringify({
      userRole: 'EMPLOYEE',
      action: 'APPROVE',
      resourceOwnerId: '{{userId}}'
    }),
    action: 'DENY',
    priority: 3,
    active: true,
    version: '1.0'
  },

  // Leave Rules
  {
    ruleCode: 'LEAVE_DAYS_REQUIRE_APPROVAL',
    description: 'Leave days exceeding limit require manager approval',
    conditions: JSON.stringify({
      action: 'LEAVE_APPLY',
      leaveDays: { $gt: '{{LEAVE_MAX_DAYS}}' }
    }),
    action: 'REQUIRE_APPROVAL',
    priority: 4,
    active: true,
    version: '1.0'
  },

  // Record State Rules
  {
    ruleCode: 'APPROVED_RECORDS_IMMUTABLE',
    description: 'Approved or locked records cannot be modified',
    conditions: JSON.stringify({
      action: { $in: ['UPDATE', 'DELETE'] },
      recordStatus: { $in: ['APPROVED', 'LOCKED'] }
    }),
    action: 'DENY',
    priority: 5,
    active: true,
    version: '1.0'
  },

  // Financial Rules
  {
    ruleCode: 'SALARY_NON_NEGATIVE',
    description: 'Salary and financial fields must not be negative',
    conditions: JSON.stringify({
      action: { $in: ['CREATE', 'UPDATE'] },
      payload: {
        $or: [
          { salary: { $lt: 0 } },
          { budget: { $lt: 0 } },
          { amount: { $lt: 0 } }
        ]
      }
    }),
    action: 'DENY',
    priority: 6,
    active: true,
    version: '1.0'
  },

  // Rate Limiting
  {
    ruleCode: 'OTP_RATE_LIMIT',
    description: 'Rate limit OTP requests',
    conditions: JSON.stringify({
      action: 'OTP_REQUEST',
      recentRequests: { $gte: '{{OTP_MAX_REQUESTS}}' }
    }),
    action: 'DENY',
    priority: 7,
    active: true,
    version: '1.0'
  },

  // Task Management Rules
  {
    ruleCode: 'task_creation',
    description: 'Allow Admin and Manager to create tasks',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER', 'Admin', 'Manager'] },
      payload: {
        title: { $exists: true },
        projectId: { $exists: true }
      }
    }),
    action: 'ALLOW',
    priority: 8,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'task_update',
    description: 'Validate task update permissions',
    conditions: JSON.stringify({
      userRole: 'MANAGER',
      action: 'PUT_:ID'
    }),
    action: 'ALLOW',
    priority: 9,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'task_reassign',
    description: 'Validate task reassignment permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['MANAGER', 'ADMIN'] },
      action: 'PATCH_:TASKID_REASSIGN_:USERID'
    }),
    action: 'ALLOW',
    priority: 10,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'task_status_update',
    description: 'Validate task status update permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['EMPLOYEE', 'MANAGER', 'ADMIN'] },
      action: 'PATCH_:ID_STATUS'
    }),
    action: 'ALLOW',
    priority: 11,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'task_delete',
    description: 'Validate task deletion permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['MANAGER', 'ADMIN'] },
      action: 'DELETE_:ID'
    }),
    action: 'ALLOW',
    priority: 12,
    active: true,
    version: '1.0'
  },

// drtyuiopjhgfdsrtyuiop[';lkjhgsdtyuio]

  // Project Management Rules
  {
    ruleCode: 'project_creation',
    description: 'Validate project creation permissions and data',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'POST_',
      payload: {
        name: { $exists: true },
        client_id: { $exists: true }
      }
    }),
    action: 'ALLOW',
    priority: 13,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'project_update',
    description: 'Validate project update permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'PUT_:ID'
    }),
    action: 'ALLOW',
    priority: 14,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'project_delete',
    description: 'Validate project deletion permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'DELETE_:ID'
    }),
    action: 'ALLOW',
    priority: 15,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'project_department_add',
    description: 'Validate adding departments to projects',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'POST_:ID_DEPARTMENTS'
    }),
    action: 'ALLOW',
    priority: 16,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'project_department_delete',
    description: 'Validate removing departments from projects',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'DELETE_:ID_DEPARTMENTS_:DEPTID'
    }),
    action: 'ALLOW',
    priority: 17,
    active: true,
    version: '1.0'
  },

  // Client Management Rules
  {
    ruleCode: 'client_creation',
    description: 'Validate client creation permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'POST_',
      payload: {
        name: { $exists: true }
      }
    }),
    action: 'ALLOW',
    priority: 18,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_update',
    description: 'Validate client update permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'PUT_:ID'
    }),
    action: 'ALLOW',
    priority: 19,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_delete',
    description: 'Validate client deletion permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'DELETE_:ID'
    }),
    action: 'ALLOW',
    priority: 20,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_permanent_delete',
    description: 'Validate permanent client deletion permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'DELETE_:ID_PERMANENT'
    }),
    action: 'ALLOW',
    priority: 21,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_assign_manager',
    description: 'Validate assigning manager to client',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'POST_:ID_ASSIGN_MANAGER'
    }),
    action: 'ALLOW',
    priority: 22,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_create_viewer',
    description: 'Validate creating client viewer',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'POST_:ID_CREATE_VIEWER'
    }),
    action: 'ALLOW',
    priority: 23,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_contact_add',
    description: 'Validate adding client contacts',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'POST_:ID_CONTACTS'
    }),
    action: 'ALLOW',
    priority: 24,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_contact_update',
    description: 'Validate updating client contacts',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'PUT_:ID_CONTACTS_:CONTACTID'
    }),
    action: 'ALLOW',
    priority: 25,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'client_contact_delete',
    description: 'Validate deleting client contacts',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'DELETE_:ID_CONTACTS_:CONTACTID'
    }),
    action: 'ALLOW',
    priority: 26,
    active: true,
    version: '1.0'
  },

  // User Management Rules
  {
    ruleCode: 'user_creation',
    description: 'Validate user creation permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'POST_CREATE'
    }),
    action: 'ALLOW',
    priority: 27,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'user_update',
    description: 'Validate user update permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'PUT_UPDATE_:ID'
    }),
    action: 'ALLOW',
    priority: 28,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'user_delete',
    description: 'Validate user deletion permissions',
    conditions: JSON.stringify({
      userRole: 'ADMIN',
      action: 'DELETE_DELETE_:USER_ID'
    }),
    action: 'ALLOW',
    priority: 29,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'user_list',
    description: 'Validate user listing permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'GET_GETUSERS'
    }),
    action: 'ALLOW',
    priority: 30,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'user_view',
    description: 'Validate viewing user details permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'GET_GETUSERBYID_:ID'
    }),
    action: 'ALLOW',
    priority: 31,
    active: true,
    version: '1.0'
  },

  // Subtask Management Rules
  {
    ruleCode: 'subtask_creation',
    description: 'Validate subtask creation permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
      action: 'POST_'
    }),
    action: 'ALLOW',
    priority: 32,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'subtask_update',
    description: 'Validate subtask update permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
      action: 'PUT_:ID'
    }),
    action: 'ALLOW',
    priority: 33,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'subtask_delete',
    description: 'Validate subtask deletion permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER'] },
      action: 'DELETE_:ID'
    }),
    action: 'ALLOW',
    priority: 34,
    active: true,
    version: '1.0'
  },

  // Upload Management Rules
  {
    ruleCode: 'upload_file',
    description: 'Validate file upload permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
      action: 'POST_UPLOAD'
    }),
    action: 'ALLOW',
    priority: 35,
    active: true,
    version: '1.0'
  },
  {
    ruleCode: 'upload_list',
    description: 'Validate viewing uploads permissions',
    conditions: JSON.stringify({
      userRole: { $in: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
      action: 'GET_GETUPLOADS_:ID'
    }),
    action: 'ALLOW',
    priority: 36,
    active: true,
    version: '1.0'
  },

  {
    ruleCode: 'DEFAULT_ALLOW',
    description: 'Allow by default if no rules match',
    conditions: JSON.stringify({}),
    action: 'ALLOW',
    priority: 999,
    active: true,
    version: '1.0'
  }
];

async function runMigration() {
  try {
    // Create table
    await new Promise((resolve, reject) => {
      db.query(createTableQuery, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    logger.info('Table business_rules created successfully');

    // Insert rules
    for (const rule of rules) {
      const insertQuery = `
        INSERT INTO business_rules (rule_code, description, conditions, action, priority, active, version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        conditions = VALUES(conditions),
        action = VALUES(action),
        priority = VALUES(priority),
        active = VALUES(active),
        version = VALUES(version),
        updated_at = CURRENT_TIMESTAMP
      `;
      await new Promise((resolve, reject) => {
        db.query(insertQuery, [
          rule.ruleCode,
          rule.description,
          rule.conditions,
          rule.action,
          rule.priority,
          rule.active,
          rule.version
        ], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    }
    logger.info('All rules inserted successfully');

  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    db.end();
  }
}

runMigration();