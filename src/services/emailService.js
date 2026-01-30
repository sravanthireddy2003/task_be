const nodemailer = require('nodemailer');
require('dotenv').config();
let logger;
try { logger = require(__root + 'logger'); } catch (e) { logger = require('../../logger'); }

let env;
try { env = require(__root + 'config/env'); } catch (e) { env = require('../config/env'); }

const SMTP_HOST = env.SMTP_HOST || process.env.SMTP_HOST;
const SMTP_PORT = parseInt(env.SMTP_PORT || process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = (env.SMTP_SECURE === true) || (process.env.SMTP_SECURE === 'true');
const SMTP_USER = env.SMTP_USER || process.env.SMTP_USER;
const SMTP_PASS = env.SMTP_PASS || process.env.SMTP_PASS;
const SMTP_FROM = env.SMTP_FROM || process.env.SMTP_FROM || SMTP_USER;
const COMPANY_NAME = env.COMPANY_NAME || process.env.COMPANY_NAME || "Your Company";

let transporter = null;
const smtpConfigured = SMTP_HOST && SMTP_USER && SMTP_PASS;

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  transporter.verify()
    .then(() => logger.info('emailService: SMTP verified'))
    .catch(e => logger.warn('emailService: SMTP verify failed: ' + (e && e.message ? e.message : String(e))));
} else {
  logger.info('emailService: SMTP not configured, emails will be logged to console');
}


// EMAIL TEMPLATES
// =================

// OTP TEMPLATE
function otpTemplate(code, minutes = 5, purpose = "Verification") {
  return {
    subject: `${purpose} Code - ${COMPANY_NAME}`,
    text: `
Hello,

Your ${purpose.toLowerCase()} code is: ${code}

This code will expire in ${minutes} minutes.

If you did not request this, please ignore this email.

Thank you,
${COMPANY_NAME}
`.trim(),
    html: `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width:600px; margin:auto; padding:20px; background:#f9f9f9; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
  <div style="text-align:center; margin-bottom:20px;">
    <h1 style="margin:0; font-size:24px; color:#333;">${purpose} Code</h1>
    <p style="margin:4px 0 0; color:#666;">from <strong>${COMPANY_NAME}</strong></p>
  </div>

  <div style="background: linear-gradient(135deg, #f0f8ff, #e6f0ff); padding:20px; border-radius:10px; text-align:center; margin:20px 0;">
    <p style="font-size:18px; margin:0 0 10px;">Your ${purpose.toLowerCase()} code is:</p>
    <strong style="font-size:32px; letter-spacing:4px; color:#007bff;">${code}</strong>
    <p style="margin-top:10px; color:#555;">Expires in <strong>${minutes} minutes</strong></p>
  </div>

  <p style="color:#555; line-height:1.6;">If you did not request this ${purpose.toLowerCase()}, please ignore this email. For assistance, contact our support team.</p>

  <div style="text-align:center; margin-top:30px;">
    <a href="#" style="background:#007bff; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Go to ${COMPANY_NAME}</a>
  </div>

  <p style="font-size:12px; color:#aaa; text-align:center; margin-top:30px;">&copy; ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.</p>
</div>
`
  };
}

// PASSWORD RESET TEMPLATE
function passwordResetTemplate({ email = "User", code, minutes = 10 }) {
  return {
    subject: `Your ${COMPANY_NAME} Password Reset OTP`,
    text: `
Hello ${email},

You requested a password reset.

Your verification code is:

${code}

This code expires in ${minutes} minutes.

If you did not request this, please ignore this email.

Thank you,
${COMPANY_NAME}
`.trim(),

    html: `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;">
        <h2>Password Reset Request</h2>
        <p>Hello <strong>${email}</strong>,</p>
        <p>Your verification code is:</p>
        <div style="padding:12px;background:#f7f7f7;border-radius:6px;width:max-content;margin:10px 0;">
          <strong style="font-size:22px;">${code}</strong>
        </div>
        <p>This code expires in <strong>${minutes} minutes</strong>.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
        <p>Thank you,<br>${COMPANY_NAME}</p>
      </div>
    `
  };
}

// ACCOUNT CREATION TEMPLATE
function welcomeTemplate({
  name = "User",
  email = "",
  role = "User",
  title = "Employee",
  tempPassword = "",
  createdBy = "System Admin",
  createdAt = new Date(),
  setupLink = "#"
}) {
  const createdDate = new Date(createdAt).toLocaleString();

  return {
    subject: `Welcome to ${COMPANY_NAME}, ${name}!`, // FIXED (No HTML)
    text: `
Welcome ${name},
Your account has been created successfully.

Name: ${name}
Email: ${email}
Role: ${role}
Title: ${title}
Created By: ${createdBy}
Created At: ${createdDate}
Temporary Password: ${tempPassword}

Setup Link: ${setupLink}
`.trim(),

    html: `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;">
        <h2>Welcome to ${COMPANY_NAME}, ${name}!</h2>
        <p>Your account has been created successfully. Below are your details:</p>

        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:20px 0;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> ${role}</p>
          <p><strong>Title:</strong> ${title}</p>
          <p><strong>Created By:</strong> ${createdBy}</p>
          <p><strong>Created At:</strong> ${createdDate}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>

        <p>
          <a href="${setupLink}"
             style="background:#007bff;color:white;padding:12px 20px;
             border-radius:6px;text-decoration:none;">
             Set Password
          </a>
        </p>
      </div>
    `
  };
}

// TASK ASSIGNED TEMPLATE
function taskAssignedTemplate({ taskTitle, assignedBy, link, assignedTo }) {
  return {
    subject: `New Task Assigned: ${taskTitle}`,
    text: `
${assignedBy} assigned you a new task.

Task: ${taskTitle}
Assigned To: ${assignedTo}
View Task: ${link}
`.trim(),
    html: `
      <h2>New Task Assigned</h2>
      <p><strong>${assignedBy}</strong> assigned a task to <strong>${assignedTo}</strong>.</p>
      <p><strong>Task:</strong> ${taskTitle}</p>
      <p><a href="${link}">View Task</a></p>
    `
  };
}

// TASK STATUS UPDATE TEMPLATE
function taskStatusTemplate({ taskId, stage, userNames = [] }) {
  return {
    subject: `Task #${taskId} Status Updated: ${stage}`,
    text: `
Task #${taskId} has been updated.
New Status: ${stage}
Notified: ${userNames.join(', ')}
`.trim(),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;">
        <h3>Task Status Updated</h3>
        <p>Task <strong>#${taskId}</strong> has been updated to <strong>${stage}</strong>.</p>
        ${userNames.length ? `<p><strong>Notified:</strong> ${userNames.join(', ')}</p>` : ''}
      </div>
    `
  };
}

// TASK REASSIGNMENT TEMPLATES
// ===========================

// Task Reassignment Request (to Manager)
function taskReassignmentRequestTemplate({ taskTitle, requesterName, reason, taskLink }) {
  return {
    subject: `Task Reassignment Requested: ${taskTitle}`,
    text: `A reassignment request has been submitted.\n\nTask: ${taskTitle}\nRequested by: ${requesterName}\nReason: ${reason}\nReview and take action: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#007bff;">Task Reassignment Requested</h2>
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Requested by:</strong> ${requesterName}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>
          <a href="${taskLink}" style="background:#007bff;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">Review Request</a>
        </p>
      </div>
    `
  };
}

// Task Reassignment Approved (to New Assignee)
function taskReassignmentApprovedTemplate({ taskTitle, oldAssignee, newAssignee, taskLink }) {
  return {
    subject: `Task Reassigned: ${taskTitle}`,
    text: `You have been assigned a new task.\nTask: ${taskTitle}\nPrevious Assignee: ${oldAssignee}\nTask Link: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#28a745;">Task Reassigned</h2>
        <p>You have been assigned a new task.</p>
        <ul>
          <li><b>Task:</b> ${taskTitle}</li>
          <li><b>Previous Assignee:</b> ${oldAssignee}</li>
        </ul>
        <p><a href="${taskLink}" style="background:#28a745;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">View Task</a></p>
      </div>
    `
  };
}

// Task Reassignment Approved (to Old Assignee - Read-Only)
function taskReassignmentOldAssigneeTemplate({ taskTitle, newAssignee, taskLink }) {
  return {
    subject: `Task Reassigned (Read-Only): ${taskTitle}`,
    text: `Your task has been reassigned and is now read-only.\nTask: ${taskTitle}\nNew Assignee: ${newAssignee}\nTask Link: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#ffc107;">Task Reassigned (Read-Only)</h2>
        <p>Your task has been reassigned and is now <b>read-only</b>.</p>
        <ul>
          <li><b>Task:</b> ${taskTitle}</li>
          <li><b>New Assignee:</b> ${newAssignee}</li>
        </ul>
        <p><a href="${taskLink}" style="background:#ffc107;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">View Task</a></p>
      </div>
    `
  };
}

// Task Reassignment Approved (to Managers/Admins)
function taskReassignmentManagerTemplate({ taskTitle, oldAssignee, newAssignee, taskLink }) {
  return {
    subject: `Task Reassignment Completed: ${taskTitle}`,
    text: `Task reassignment completed.\nTask: ${taskTitle}\nNew Assignee: ${newAssignee}\nOld Assignee: ${oldAssignee}\nTask Link: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#17a2b8;">Task Reassignment Completed</h2>
        <ul>
          <li><b>Task:</b> ${taskTitle}</li>
          <li><b>New Assignee:</b> ${newAssignee}</li>
          <li><b>Old Assignee:</b> ${oldAssignee}</li>
        </ul>
        <p><a href="${taskLink}" style="background:#17a2b8;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">View Task</a></p>
      </div>
    `
  };
}

// Task Reassignment Rejected (to Old Assignee)
function taskReassignmentRejectedTemplate({ taskTitle, taskLink }) {
  return {
    subject: `Task Reassignment Rejected: ${taskTitle}`,
    text: `Your reassignment request was rejected.\nTask: ${taskTitle}\nYou can continue working on this task.\nTask Link: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#dc3545;">Task Reassignment Rejected</h2>
        <p>Your reassignment request was <b>rejected</b>.</p>
        <ul>
          <li><b>Task:</b> ${taskTitle}</li>
        </ul>
        <p>You can continue working on this task.</p>
        <p><a href="${taskLink}" style="background:#dc3545;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">View Task</a></p>
      </div>
    `
  };
}

// Task Reassignment Rejected (to Managers/Admins)
function taskReassignmentRejectedManagerTemplate({ taskTitle, oldAssignee, taskLink }) {
  return {
    subject: `Task Reassignment Rejected: ${taskTitle}`,
    text: `Task reassignment was rejected.\nTask: ${taskTitle}\nOld Assignee: ${oldAssignee}\nTask Link: ${taskLink}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
        <h2 style="color:#dc3545;">Task Reassignment Rejected</h2>
        <ul>
          <li><b>Task:</b> ${taskTitle}</li>
          <li><b>Old Assignee:</b> ${oldAssignee}</li>
        </ul>
        <p><a href="${taskLink}" style="background:#dc3545;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">View Task</a></p>
      </div>
    `
  };
}

// PROJECT TEMPLATES
// =================

// Project Manager Assignment Template
function projectManagerAssignmentTemplate({
  projectName,
  clientName,
  priority,
  startDate,
  endDate,
  budget,
  publicId,
  departmentNames = [],
  projectLink,
  creatorName,
  managerName
}) {
  return {
    subject: `Project Assignment: ${projectName}`,
    text: `
Dear ${managerName},

You have been assigned as Project Manager for "${projectName}".

Project Details:
Client: ${clientName}
Priority: ${priority}
Start Date: ${startDate || 'TBD'}
End Date: ${endDate || 'TBD'}
Budget: ${budget || 'TBD'}
Project ID: ${publicId}
Departments: ${departmentNames.length ? departmentNames.join(', ') : 'None'}

Please review the project details and begin planning.

Access the project dashboard: ${projectLink}

Best regards,
${creatorName}
${COMPANY_NAME}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:20px; font-family:Arial,sans-serif; line-height:1.6; color:#333;">
  <div style="max-width:600px; margin:0 auto; background:#fff; padding:30px; border:1px solid #ddd; border-radius:5px;">
    <h2 style="color:#333; margin-top:0;">Project Assignment Notification</h2>

    <p>Dear <strong>${managerName}</strong>,</p>

    <p>You have been assigned as Project Manager for the following project:</p>

    <table style="width:100%; border-collapse:collapse; margin:20px 0;">
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Project Name:</strong></td><td style="padding:8px; border:1px solid #ddd;">${projectName}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Client:</strong></td><td style="padding:8px; border:1px solid #ddd;">${clientName}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Priority:</strong></td><td style="padding:8px; border:1px solid #ddd;">${priority}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Start Date:</strong></td><td style="padding:8px; border:1px solid #ddd;">${startDate || 'TBD'}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>End Date:</strong></td><td style="padding:8px; border:1px solid #ddd;">${endDate || 'TBD'}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Budget:</strong></td><td style="padding:8px; border:1px solid #ddd;">${budget || 'TBD'}</td></tr>
      <tr><td style="padding:8px; border:1px solid #ddd; background:#f9f9f9;"><strong>Project ID:</strong></td><td style="padding:8px; border:1px solid #ddd;"><strong>${publicId}</strong></td></tr>
    </table>

    ${departmentNames.length ? `
    <p><strong>Assigned Departments:</strong> ${departmentNames.join(', ')}</p>
    ` : ''}

    <p>Please review the project details and begin the planning phase.</p>

    <p style="text-align:center; margin:30px 0;">
      <a href="${projectLink}" style="background:#007bff; color:white; padding:12px 24px; text-decoration:none; border-radius:4px; font-weight:bold;">Access Project Dashboard</a>
    </p>

    <hr style="margin:30px 0;">
    <p>Best regards,<br><strong>${creatorName}</strong><br>${COMPANY_NAME}</p>
  </div>
</body>
</html>
    `
  };
}

// Client Project Creation Template
function clientProjectCreationTemplate({
  projectName,
  managerName,
  priority,
  startDate,
  endDate,
  budget,
  publicId,
  departmentNames = [],
  projectLink,
  creatorName,
  clientName
}) {
  return {
    subject: `Project Created: ${projectName}`,
    text: `
Dear ${clientName},

Your project "${projectName}" has been successfully created.

Project Summary:
Project Manager: ${managerName}
Priority: ${priority}
Start Date: ${startDate || 'TBD'}
End Date: ${endDate || 'TBD'}
Budget: ${budget || 'TBD'}
Project ID: ${publicId}

You can track project progress through the client portal.

Access your project: ${projectLink}

Thank you,
${creatorName}
${COMPANY_NAME}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:20px; font-family:Arial,sans-serif; line-height:1.6; color:#333;">
  <div style="max-width:600px; margin:0 auto; background:#fff; padding:30px; border:1px solid #ddd; border-radius:5px;">
    <h2 style="color:#333; margin-top:0;">Project Creation Confirmation</h2>

    <p>Dear <strong>${clientName}</strong>,</p>

    <p>We are pleased to inform you that your project has been successfully created:</p>

    <div style="background:#f8f9fa; padding:20px; border-radius:5px; margin:20px 0;">
      <h3 style="margin-top:0; color:#495057;">Project Summary</h3>
      <p><strong>Project:</strong> ${projectName}</p>
      <p><strong>Project Manager:</strong> ${managerName}</p>
      <p><strong>Priority:</strong> ${priority}</p>
      <p><strong>Timeline:</strong> ${startDate || 'TBD'} to ${endDate || 'TBD'}</p>
      <p><strong>Budget:</strong> ${budget || 'TBD'}</p>
      <p><strong>Project ID:</strong> <strong>${publicId}</strong></p>
    </div>

    ${departmentNames.length ? `
    <p><strong>Our Teams:</strong> ${departmentNames.join(', ')}</p>
    ` : ''}

    <p>You can now track project progress and communicate with your project manager through our client portal.</p>

    <p style="text-align:center; margin:30px 0;">
      <a href="${projectLink}" style="background:#28a745; color:white; padding:12px 24px; text-decoration:none; border-radius:4px; font-weight:bold;">View Project Status</a>
    </p>

    <hr style="margin:30px 0;">
    <p>Thank you,<br><strong>${creatorName}</strong><br>${COMPANY_NAME}</p>
  </div>
</body>
</html>
    `
  };
}

// SEND EMAIL
async function sendEmail({ to, subject, text, html }) {
  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html
      });
      return { sent: true };
    } catch (e) {
      logger.error('emailService: sendMail failed', e && e.message);
      return { sent: false, error: e && e.message };
    }
  }

  logger.info('emailService (dev) to:', to, 'subject:', subject, 'text:', text);
  return { sent: false };
}

async function sendProjectNotifications({
  projectManagerInfo,
  clientInfo,
  projectName,
  publicId,
  priority,
  startDate,
  endDate,
  budget,
  departmentNames = [],
  projectLink,
  creatorName
}) {
  const results = {};
 
  // Send to Project Manager
  if (projectManagerInfo?.email) {
    const pmTemplate = projectManagerAssignmentTemplate({
      projectName,
      clientName: clientInfo.name,
      priority,
      startDate,
      endDate,
      budget,
      publicId,
      departmentNames,
      projectLink,
      creatorName,
      managerName: projectManagerInfo.name
    });
   
    results.manager = await sendEmail({
      to: projectManagerInfo.email,
      ...pmTemplate
    });
  }
 
  // Send to Client
  if (clientInfo?.email) {
    const clientTemplate = clientProjectCreationTemplate({
      projectName,
      managerName: projectManagerInfo ? projectManagerInfo.name : 'To be assigned',
      priority,
      startDate,
      endDate,
      budget,
      publicId,
      departmentNames,
      projectLink,
      creatorName,
      clientName: clientInfo.name
    });
   
    results.client = await sendEmail({
      to: clientInfo.email,
      ...clientTemplate
    });
  }
 
  return results;
}

function taskAssignedToEmployeeTemplate({
  taskTitle,
  taskId,
  priority,
  taskDate,
  description,
  projectName,
  projectPublicId,
  assignedBy,
  taskLink,
  employeeName,
}) {
  return {
    subject: `New Task Assigned: ${taskTitle} (Priority: ${priority})`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
        <p>Dear <strong>${employeeName}</strong>,</p>

        <p>
          You have been assigned a new task. Please review the details below:
        </p>

        <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
          <tr>
            <td style="padding: 8px; font-weight: bold;">Task Title</td>
            <td style="padding: 8px;">${taskTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Task ID</td>
            <td style="padding: 8px;">#${taskId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Priority</td>
            <td style="padding: 8px;">${priority}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Due Date</td>
            <td style="padding: 8px;">${taskDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Assigned By</td>
            <td style="padding: 8px;">${assignedBy}</td>
          </tr>
          ${
            projectName
              ? `
          <tr>
            <td style="padding: 8px; font-weight: bold;">Project</td>
            <td style="padding: 8px;">${projectName}</td>
          </tr>`
              : ''
          }
        </table>

        ${
          description
            ? `
          <p style="margin-top: 16px;">
            <strong>Description:</strong><br />
            ${description}
          </p>`
            : ''
        }

        <p style="margin-top: 20px;">
          <a href="${taskLink}"
             style="
               background-color: #ff8c00;
               color: #ffffff;
               padding: 10px 16px;
               text-decoration: none;
               border-radius: 4px;
               display: inline-block;
             ">
            View Task Details
          </a>
        </p>

        <p style="margin-top: 20px;">
          If you have any questions or need clarification, please contact your manager or the support team.
        </p>

        <p style="margin-top: 24px;">
          Best regards,<br />
          <strong>Task Management System</strong>
        </p>
      </div>
    `,
  };
}

module.exports = taskAssignedToEmployeeTemplate;

async function sendTaskAssignmentEmails({
  finalAssigned = [],
  taskTitle,
  taskId,
  priority,
  taskDate,
  description,
  projectName,
  projectPublicId,
  assignedBy,
  taskLink,
  connection,
}) {
  const results = {};

  try {
    // Basic validation
    if (!connection) {
      logger.warn('⚠️ Database connection not provided');
      return results;
    }

    if (!Array.isArray(finalAssigned) || finalAssigned.length === 0) {
      logger.info('ℹ️ No assigned users to notify');
      return results;
    }


    // Accept mixed identifiers: numeric internal ids or string public_ids
    const publicIds = [];
    const internalIds = [];
    finalAssigned.forEach((id) => {
      if (id === undefined || id === null) return;
      const s = String(id).trim();
      if (s === '') return;
      if (/^\d+$/.test(s)) internalIds.push(Number(s));
      else publicIds.push(s);
    });

    if (publicIds.length === 0 && internalIds.length === 0) {
      logger.info('ℹ️ No valid assigned user identifiers provided');
      return results;
    }

    // Build SQL to fetch users by public_id OR _id
    const users = await new Promise((resolve, reject) => {
      const clauses = [];
      const params = [];
      if (publicIds.length) {
        clauses.push('public_id IN (?)');
        params.push(publicIds);
      }
      if (internalIds.length) {
        clauses.push('_id IN (?)');
        params.push(internalIds);
      }
      const sql = `SELECT _id, public_id, name, email FROM users WHERE ${clauses.join(' OR ')}`;
      connection.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    if (users.length === 0) {
      logger.info('ℹ️ No matching users found for email notification');
      return results;
    }

    logger.info(`📧 Preparing to send ${users.length} task assignment emails`);

    /**
     * Send emails
     */
    for (const user of users) {
      if (!user.email) continue;

      try {
        const emailTemplate = taskAssignedToEmployeeTemplate({
          taskTitle,
          taskId,
          priority,
          taskDate,
          description,
          projectName,
          projectPublicId,
          assignedBy,
          taskLink,
          employeeName: user.name || 'Team Member',
        });

        const mailResult = await sendEmail({
          to: user.email,
          ...emailTemplate,
        });

        results[user.email] = {
          sent: true,
          messageId: mailResult?.messageId || null,
        };

        logger.info(`Email sent to ${user.name} (${user.email})`);
      } catch (mailError) {
        results[user.email] = {
          sent: false,
          error: mailError.message,
        };

        logger.error(`Failed to send email to ${user.email}:`, mailError.message);
      }
    }

    return results;
    } catch (error) {
    logger.error('Task assignment email process failed:', error.message);
    return results;
  }
}
 
module.exports = {
  sendEmail,
  otpTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  taskAssignedTemplate,
  taskStatusTemplate,
  sendCredentials,
  projectManagerAssignmentTemplate,
  clientProjectCreationTemplate,
  sendProjectNotifications,
  taskAssignedToEmployeeTemplate,
  sendTaskAssignmentEmails
  ,taskReassignmentRequestTemplate
  ,taskReassignmentApprovedTemplate
  ,taskReassignmentOldAssigneeTemplate
  ,taskReassignmentManagerTemplate
  ,taskReassignmentRejectedTemplate
  ,taskReassignmentRejectedManagerTemplate
};
 
// Convenience: send credentials/welcome email to newly created users
async function sendCredentials(to, name, publicId, tempPassword, setupLink) {
  try {
    const link = setupLink || `${env.BASE_URL || env.FRONTEND_URL}/auth/setup?uid=${encodeURIComponent(publicId)}`;
    const tpl = welcomeTemplate(name || '', to || '', tempPassword || '', link);
    const r = await sendEmail({ to, subject: tpl.subject, text: tpl.text, html: tpl.html });
    return r;
  } catch (e) {
    logger.error('emailService.sendCredentials error', e && e.message);
    return { sent: false, error: e && e.message };
  }
}
 
module.exports.sendCredentials = sendCredentials;
 
 