const express = require('express');
const router = express.Router();
const db = require(__root + 'db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const otpService = require(__root + 'utils/otpService');
const passwordPolicy = require(__root + 'utils/passwordPolicy');
const emailService = require(__root + 'utils/emailService');
// tenantMiddleware available if endpoints need explicit tenant enforcement; most auth flows derive tenant from email/token
const { requireAuth } = require(__root + 'middleware/roles');
require('dotenv').config();
const upload = require(__root + 'multer');
const fs = require('fs');
const path = require('path');

// Ensure users table has 2FA columns. If missing, add them at runtime.
async function ensureUsers2FAColumns() {
  return new Promise((resolve) => {
    const checkSql = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('twofa_secret','is2fa_enabled')`;
    db.query(checkSql, [], (err, rows) => {
      if (err) return resolve(false);
      const found = Array.isArray(rows) ? rows.map(r => r.COLUMN_NAME) : [];
      const toAdd = [];
      if (!found.includes('twofa_secret')) toAdd.push("ALTER TABLE `users` ADD COLUMN `twofa_secret` VARCHAR(255) DEFAULT NULL");
      if (!found.includes('is2fa_enabled')) toAdd.push("ALTER TABLE `users` ADD COLUMN `is2fa_enabled` TINYINT DEFAULT 0");
      if (toAdd.length === 0) return resolve(true);
      // run sequentially
      (async () => {
        for (const s of toAdd) {
          try {
            await new Promise((res, rej) => db.query(s, [], (e) => e ? rej(e) : res()));
          } catch (e) {
            // If altering fails (permissions etc), stop and resolve false
            return resolve(false);
          }
        }
        return resolve(true);
      })();
    });
  });
}

const Redis = require('ioredis');
const requireRedis = process.env.REQUIRE_REDIS !== 'false';
let redis = null;
if (requireRedis && process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => {
      console.warn('Redis error (AuthController):', err && err.message);
    });
  } catch (e) {
    console.warn('Failed to initialize Redis client (AuthController):', e && e.message);
    redis = null;
  }
} else {
  if (process.env.REDIS_URL) console.log('REQUIRE_REDIS is false — AuthController skipping Redis client creation');
}

// Login attempt tracking with Redis fallback
async function recordFailedAttempt(key) {
  if (redis) {
    const attemptsKey = `login:attempts:${key}`;
    const lockKey = `login:lock:${key}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 15 * 60);
    if (attempts >= 5) {
      await redis.set(lockKey, '1', 'EX', 15 * 60);
    }
  } else {
    if (!global.__loginAttempts) global.__loginAttempts = new Map();
    const rec = global.__loginAttempts.get(key) || { attempts: 0, lockedUntil: 0 };
    rec.attempts += 1;
    if (rec.attempts >= 5) rec.lockedUntil = Date.now() + (15 * 60 * 1000);
    global.__loginAttempts.set(key, rec);
  }
}

async function resetAttempts(key) {
  if (redis) {
    await redis.del(`login:attempts:${key}`);
    await redis.del(`login:lock:${key}`);
  } else if (global.__loginAttempts) {
    global.__loginAttempts.delete(key);
  }
}

async function isLocked(key) {
  if (redis) {
    const lockKey = `login:lock:${key}`;
    const exists = await redis.exists(lockKey);
    return exists === 1;
  }
  const rec = global.__loginAttempts && global.__loginAttempts.get(key);
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
    global.__loginAttempts.delete(key);
    return false;
  }
  return false;
}

// OTP resend rate limiting configuration
const RESEND_MIN_INTERVAL = parseInt(process.env.OTP_RESEND_MIN_SECONDS || '60', 10); // seconds between resends
const RESEND_MAX_PER_WINDOW = parseInt(process.env.OTP_RESEND_MAX || '3', 10); // max resends per window
const RESEND_WINDOW_SECONDS = parseInt(process.env.OTP_RESEND_WINDOW_SECONDS || '600', 10); // window length in seconds

async function canResendOtp(userId) {
  if (redis) {
    const lastKey = `otp:last:${userId}`;
    const countKey = `otp:count:${userId}`;
    const last = await redis.get(lastKey);
    if (last) {
      const since = Date.now() - parseInt(last, 10);
      if (since < RESEND_MIN_INTERVAL * 1000) {
        return { ok: false, retryAfter: Math.ceil((RESEND_MIN_INTERVAL * 1000 - since) / 1000) };
      }
    }
    const count = parseInt(await redis.get(countKey) || '0', 10);
    if (count >= RESEND_MAX_PER_WINDOW) return { ok: false, limitReached: true };
    return { ok: true };
  }

  // in-memory fallback
  if (!global.__otpResend) global.__otpResend = new Map();
  const rec = global.__otpResend.get(String(userId)) || { count: 0, windowStart: Date.now(), last: 0 };
  const now = Date.now();
  if (now - rec.last < RESEND_MIN_INTERVAL * 1000) {
    return { ok: false, retryAfter: Math.ceil((RESEND_MIN_INTERVAL * 1000 - (now - rec.last)) / 1000) };
  }
  // reset window if expired
  if (now - rec.windowStart > RESEND_WINDOW_SECONDS * 1000) {
    rec.count = 0;
    rec.windowStart = now;
  }
  if (rec.count >= RESEND_MAX_PER_WINDOW) return { ok: false, limitReached: true };
  return { ok: true };
}

async function noteResendOtp(userId) {
  if (redis) {
    const lastKey = `otp:last:${userId}`;
    const countKey = `otp:count:${userId}`;
    await redis.set(lastKey, String(Date.now()), 'EX', RESEND_WINDOW_SECONDS);
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, RESEND_WINDOW_SECONDS);
    return;
  }
  if (!global.__otpResend) global.__otpResend = new Map();
  const now = Date.now();
  const rec = global.__otpResend.get(String(userId)) || { count: 0, windowStart: now, last: 0 };
  if (now - rec.windowStart > RESEND_WINDOW_SECONDS * 1000) {
    rec.count = 0;
    rec.windowStart = now;
  }
  rec.count = (rec.count || 0) + 1;
  rec.last = now;
  global.__otpResend.set(String(userId), rec);
}

// Login: prefer tenant from header/body/query; if missing, attempt to infer tenant by email.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  let tenantId = req.headers['x-tenant-id'] || req.body && req.body.tenantId || req.query && req.query.tenantId;

  if (!email || !password) return res.status(400).json({ message: 'email and password required' });

  // If tenantId is not provided, try to find user(s) by email
  if (!tenantId) {
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
      if (results.length > 1) {
        // Ambiguous — multiple tenants have this email
        const tenants = results.map(r => r.tenant_id).filter(Boolean);
        return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.', tenants });
      }

      // exactly one user found — use it
      const user = results[0];
      tenantId = user.tenant_id;

      // proceed with authentication using resolved user
      try {
... (file continues)
