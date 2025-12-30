const db = require(__root + 'db');
const logger = require('../logger');

/**
 * ClientOnboardingService
 * Auto-generates onboarding tasks when a client is created
 * Tasks are assigned to the manager if provided
 */

const DEFAULT_ONBOARDING_TASKS = [
  { title: 'KYC Verification', description: 'Verify client KYC documents and identity', daysFromNow: 3 },
  { title: 'Contract Preparation', description: 'Prepare and send contract for client signature', daysFromNow: 5 },
  { title: 'Project Kickoff Discussion', description: 'Schedule kickoff meeting with client and team', daysFromNow: 7 },
  { title: 'Workspace Setup', description: 'Set up workspace, access, and initial project skeleton', daysFromNow: 2 }
];

function q(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

/**
 * Generate onboarding tasks for a new client
 * @param {number} clientId - Client ID
 * @param {number} managerId - Manager ID (optional)
 * @param {number} actorId - User ID creating the tasks (for logging)
 * @returns {Promise<Array>} - Array of created task records
 */
async function generateOnboardingTasks(clientId, managerId, actorId) {
  try {
    const createdTasks = [];

    for (const taskTemplate of DEFAULT_ONBOARDING_TASKS) {
      try {
        // Calculate due date
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + taskTemplate.daysFromNow);

        // Insert into tasks table (if tasks table exists)
        const taskSql = `
          INSERT INTO tasks (
            title, description, client_id, assigned_to, status, 
            taskDate, createdAt, priority
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), 'Medium')
        `;
        const taskResult = await q(taskSql, [
          taskTemplate.title,
          taskTemplate.description,
          clientId,
          managerId || null,
          'Open',
          dueDate.toISOString()
        ]).catch(e => {
          logger.debug('Skipping task insert (tasks table may not exist): ' + e.message);
          return { insertId: null };
        });

        const taskId = taskResult && taskResult.insertId ? taskResult.insertId : null;

        // Insert onboarding task record for tracking
        if (await tableExists('onboarding_tasks')) {
          const onboardingSql = `
            INSERT INTO onboarding_tasks (
              client_id, task_id, task_title, task_description,
              assigned_to, status, due_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          const onboardingResult = await q(onboardingSql, [
            clientId,
            taskId,
            taskTemplate.title,
            taskTemplate.description,
            managerId || null,
            'Pending',
            dueDate.toISOString()
          ]);

          createdTasks.push({
            id: onboardingResult && onboardingResult.insertId ? onboardingResult.insertId : null,
            title: taskTemplate.title,
            dueDate: dueDate.toISOString(),
            assignedTo: managerId || null
          });
        }
      } catch (e) {
        logger.warn(`Failed to create onboarding task "${taskTemplate.title}": ${e.message}`);
        // Continue with next task even if one fails
      }
    }

    // Log activity
    if (await tableExists('client_activity_logs')) {
      try {
        await q(
          `INSERT INTO client_activity_logs (
            client_id, actor_id, action_type, action, details, created_at
          ) VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            clientId,
            actorId || null,
            'onboarding_tasks_generated',
            'Auto-generated onboarding tasks',
            JSON.stringify({ taskCount: createdTasks.length })
          ]
        );
      } catch (e) {
        logger.debug('Failed to log onboarding task generation: ' + e.message);
      }
    }

    logger.info(`Generated ${createdTasks.length} onboarding tasks for client ${clientId}`);
    return createdTasks;
  } catch (e) {
    logger.error('Error in generateOnboardingTasks: ' + e.message);
    throw e;
  }
}

async function tableExists(tableName) {
  try {
    const rows = await q(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [tableName]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    return false;
  }
}

module.exports = {
  generateOnboardingTasks,
  DEFAULT_ONBOARDING_TASKS
};
