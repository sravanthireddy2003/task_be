const nodemailer = require('nodemailer');
const Redis = require('ioredis');
require('dotenv').config();

const REQUIRE_REDIS = process.env.REQUIRE_REDIS !== 'false';
let redis = null;
if (REQUIRE_REDIS && process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => console.warn('Redis error (otpService):', err && err.message));
  } catch (e) {
    console.warn('Failed to initialize Redis client (otpService):', e && e.message);
    redis = null;
  }
} else {
  if (process.env.REDIS_URL) console.log('REQUIRE_REDIS is false — otpService skipping Redis client creation');
}

// Reusable transporter (created once)
let transporter = null;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const smtpConfigured = SMTP_HOST && SMTP_USER && SMTP_PASS;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // verify transporter (non-blocking)
  transporter.verify().then(() => {
    console.log('SMTP transporter verified');
  }).catch((e) => {
    console.warn('SMTP transporter verify failed:', e && e.message);
  });
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function _storeOtp(keyId, code, ttlSeconds = 5 * 60) {
  if (redis) {
    const k = `otp:${String(keyId)}`;
    await redis.set(k, code, 'EX', ttlSeconds);
    return;
  }
  if (!global.__otps) global.__otps = new Map();
  global.__otps.set(String(keyId), { code, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function _getAndDeleteOtp(keyId) {
  if (redis) {
    const k = `otp:${String(keyId)}`;
    const stored = await redis.get(k);
    if (stored) await redis.del(k);
    return stored;
  }
  const rec = global.__otps && global.__otps.get(String(keyId));
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    global.__otps.delete(String(keyId));
    return null;
  }
  global.__otps.delete(String(keyId));
  return rec.code;
}

/**
 * Send an OTP to `email` and store it keyed by `userId`.
 * Returns an object { code, expiresAt, sent } where `sent` is true if email send attempted/succeeded.
 */
async function sendOtp(email, userId) {
  const code = generateCode();
  const ttlSeconds = parseInt(process.env.OTP_TTL_SECONDS || String(5 * 60), 10);

  await _storeOtp(userId, code, ttlSeconds);

  const subject = process.env.OTP_SUBJECT || 'Your one-time verification code';
  const text = `Your one-time verification code is: ${code}. It expires in ${Math.floor(ttlSeconds / 60)} minute(s).`;
  const html = `<p>Your one-time verification code is: <strong>${code}</strong>.</p><p>It expires in ${Math.floor(ttlSeconds / 60)} minute(s).</p>`;

  let sent = false;
  if (transporter) {
    const mailOptions = { from: SMTP_FROM, to: email, subject, text, html };
    try {
      await transporter.sendMail(mailOptions);
      sent = true;
      console.log(`OTP email sent to ${email}`);
    } catch (e) {
      sent = false;
      console.error('Failed to send OTP email to', email, 'error:', e && e.message);
      console.log('OTP (fallback):', code);
    }
  } else {
    // No SMTP configured: developer fallback
    console.log(`No SMTP configured — OTP for ${email} (user ${userId}): ${code}`);
  }

  return { code, expiresAt: Date.now() + ttlSeconds * 1000, sent };
}

async function verifyOtp(userId, code) {
  const stored = await _getAndDeleteOtp(userId);
  if (!stored) return false;
  return String(stored) === String(code);
}

/**
 * Send a generic notification email. Falls back to console when no SMTP.
 */
async function sendNotification({ to, subject, text, html }) {
  if (transporter) {
    try {
      await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
      return true;
    } catch (e) {
      console.error('Notification send failed to', to, e && e.message);
      return false;
    }
  }
  console.log('Notification (no SMTP):', { to, subject, text });
  return false;
}

module.exports = { sendOtp, verifyOtp, sendNotification };
