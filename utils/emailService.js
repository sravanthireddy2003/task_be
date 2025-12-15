const nodemailer = require('nodemailer');
require('dotenv').config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const COMPANY_NAME = process.env.COMPANY_NAME || "Your Company";

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
    .then(() => console.log('emailService: SMTP verified'))
    .catch(e => console.warn('emailService: SMTP verify failed', e && e.message));
} else {
  console.log('emailService: SMTP not configured, emails will be logged to console');
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
      console.error('emailService: sendMail failed', e && e.message);
      return { sent: false, error: e && e.message };
    }
  }

  console.log('emailService (dev) to:', to, 'subject:', subject, 'text:', text);
  return { sent: false };
}


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

module.exports = {
  sendEmail,
  otpTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  taskAssignedTemplate,
  taskStatusTemplate
};

// Convenience: send credentials/welcome email to newly created users
async function sendCredentials(to, name, publicId, tempPassword, setupLink) {
  try {
    const link = setupLink || `${process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:4000'}/auth/setup?uid=${encodeURIComponent(publicId)}`;
    const tpl = welcomeTemplate(name || '', to || '', tempPassword || '', link);
    const r = await sendEmail({ to, subject: tpl.subject, text: tpl.text, html: tpl.html });
    return r;
  } catch (e) {
    console.error('emailService.sendCredentials error', e && e.message);
    return { sent: false, error: e && e.message };
  }
}

// attach convenience function to exports
module.exports.sendCredentials = sendCredentials;
