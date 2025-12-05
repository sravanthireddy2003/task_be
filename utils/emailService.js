const nodemailer = require('nodemailer');
require('dotenv').config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter = null;
const smtpConfigured = SMTP_HOST && SMTP_USER && SMTP_PASS;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  transporter.verify().then(() => console.log('emailService: SMTP verified')).catch(e => console.warn('emailService: SMTP verify failed', e && e.message));
} else {
  console.log('emailService: SMTP not configured, emails will be logged to console');
}

async function sendEmail({ to, subject, text, html }) {
  if (transporter) {
    try {
      await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
      return { sent: true };
    } catch (e) {
      console.error('emailService: sendMail failed', e && e.message);
      // fallback: log
      console.log('emailService (fallback) to:', to, 'subject:', subject, 'text:', text);
      return { sent: false, error: e && e.message };
    }
  }
  // no transporter: dev fallback
  console.log('emailService (dev) to:', to, 'subject:', subject, 'text:', text);
  return { sent: false };
}

// Templates
function otpTemplate(code, minutes = 5) {
  const subject = `Your verification code (${code})`;
  const text = `Your verification code is ${code}. It expires in ${minutes} minute(s).`;
  const html = `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in ${minutes} minute(s).</p>`;
  return { subject, text, html };
}

function passwordResetTemplate(code, minutes = 10) {
  const subject = 'Password reset code';
  const text = `Use this code to reset your password: ${code}. Expires in ${minutes} minutes.`;
  const html = `<p>Use this code to reset your password: <strong>${code}</strong>.</p><p>It expires in ${minutes} minutes.</p>`;
  return { subject, text, html };
}

function welcomeTemplate(name, email, tempPassword, setupLink) {
  const subject = 'Your account has been created';
  const text = `Welcome ${name}!\nEmail: ${email}\nTemporary Password: ${tempPassword}\nSetup Link: ${setupLink}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h2>Welcome ${name}!</h2>
      <p>Your account has been created.</p>
      <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:12px 0;">
        <p><strong>Login Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      </div>
      <p><a href="${setupLink}" style="background:#007bff;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;">Set Password</a></p>
    </div>
  `;
  return { subject, text, html };
}

function taskAssignedTemplate(taskTitle, assignedBy, link) {
  const subject = `New task assigned: ${taskTitle}`;
  const text = `${assignedBy} assigned you a new task: ${taskTitle}. View: ${link}`;
  const html = `<p><strong>${assignedBy}</strong> assigned you a new task: <strong>${taskTitle}</strong>.</p><p><a href="${link}">View task</a></p>`;
  return { subject, text, html };
}

function taskStatusTemplate(taskId, stage, userNames = []) {
  const subject = `Task #${taskId} Status Updated: ${stage}`;
  const text = `Task #${taskId} has been updated to status: ${stage}.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h3>Task Status Updated</h3>
      <p>Task <strong>#${taskId}</strong> status has been updated to <strong>${stage}</strong>.</p>
      ${userNames.length ? `<p>Notified: ${userNames.join(', ')}</p>` : ''}
    </div>
  `;
  return { subject, text, html };
}

module.exports = {
  sendEmail,
  otpTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  taskAssignedTemplate
  , taskStatusTemplate
};
