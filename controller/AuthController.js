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
const crypto = require('crypto');

const MODULE_ROUTE_MAP = {
  Admin: {
    'Dashboard': '/admin/dashboard',
    'User Management': '/admin/users',
    'Clients': '/admin/clients',
    'Departments': '/admin/departments',
    'Tasks': '/admin/tasks',
    'Projects': '/admin/projects',
    'Workflow (Project & Task Flow)': '/admin/workflow',
    'Notifications': '/admin/notifications',
    'Reports & Analytics': '/admin/reports',
    'Document & File Management': '/admin/documents',
    'Chat / Real-Time Collaboration': '/admin/chat',
    'Approval Workflows': '/admin/approvals',
    'Settings & Master Configuration': '/admin/settings'
  },
  Manager: {
    'Dashboard': '/manager/dashboard',
    'Clients': '/manager/clients',
    'Departments': '/manager/departments',
    'Tasks': '/manager/tasks',
    'Projects': '/manager/projects',
    'Workflow (Project & Task Flow)': '/manager/workflow',
    'Notifications': '/manager/notifications',
    'Reports & Analytics': '/manager/reports',
    'Document & File Management': '/manager/documents',
    'Chat / Real-Time Collaboration': '/manager/chat',
    'Approval Workflows': '/manager/approvals',
    'Settings & Master Configuration': '/manager/settings'
  },
  Employee: {
    'Dashboard': '/employee/dashboard',
    'Tasks': '/employee/tasks',
    'Notifications': '/employee/notifications',
    'Reports & Analytics': '/employee/reports',
    'Document & File Management': '/employee/documents',
    'Chat / Real-Time Collaboration': '/employee/chat'
  },
  'Client-Viewer': {
    'Dashboard': '/client/dashboard',
    'Assigned Tasks': '/client/tasks',
    'Document & File Management': '/client/documents'
  },
  Client: {
    'Dashboard': '/client/dashboard',
    'Projects': '/client/projects',
    'Tasks': '/client/tasks',
    'Document & File Management': '/client/documents'
  }
};

function slugifyModule(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function modulePathFor(role, name) {
  const map = MODULE_ROUTE_MAP[role] || {};
  if (map[name]) return map[name];
  const base = role ? `/${role.toLowerCase()}` : '';
  const slug = slugifyModule(name);
  return slug ? `${base}/${slug}` : base || '/';
}

function annotateModulesWithPaths(modules, role) {
  if (!Array.isArray(modules)) return [];
  return modules.map(m => ({ ...m, path: modulePathFor(role, m.name) }));
}

function normalizeStoredModules(user) {
  if (!user || !user.modules) return null;
  let arr;
  try {
    arr = typeof user.modules === 'string' ? JSON.parse(user.modules) : user.modules;
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr
    .map(m => {
      const name = m.name || m.module || '';
      const access = m.access || 'full';
      let mid = m.moduleId || m.id || m.module_id || m.module || '';
      if (typeof mid === 'number') mid = String(mid);
      if (!mid) mid = crypto.randomBytes(8).toString('hex');
      return { moduleId: mid, name, access };
    })
    .filter(m => (m.name || '').toLowerCase() !== 'team & employees');
}

function getDefaultModules(role) {
  function mk(name, access) { return { moduleId: crypto.randomBytes(8).toString('hex'), name, access }; }
  if (role === 'Admin') return [ mk('User Management','full'), mk('Dashboard','full'), mk('Clients','full'), mk('Departments','full'), mk('Tasks','full'), mk('Projects','full'), mk('Workflow (Project & Task Flow)','full'), mk('Notifications','full'), mk('Reports & Analytics','full'), mk('Document & File Management','full'), mk('Chat / Real-Time Collaboration','full'), mk('Approval Workflows','full'), mk('Settings & Master Configuration','full') ];
  if (role === 'Manager') return [ mk('Dashboard','full'), mk('Clients','full'), mk('Tasks','full'), mk('Projects','full'), mk('Workflow (Project & Task Flow)','full'), mk('Notifications','limited'), mk('Reports & Analytics','full'), mk('Document & File Management','limited'), mk('Chat / Real-Time Collaboration','full'), mk('Approval Workflows','limited') ];
  if (role === 'Employee') return [ mk('Dashboard','view'), mk('Tasks','limited'), mk('Notifications','limited'), mk('Reports & Analytics','limited'), mk('Document & File Management','limited'), mk('Chat / Real-Time Collaboration','full') ];
  if (role === 'Client-Viewer') return [ mk('Dashboard','view'), mk('Assigned Tasks','view'), mk('Document & File Management','view') ];
  return [];
}

const SIDEBAR_ORDER = ['Dashboard','User Management','Clients','Departments','Tasks','Projects','Workflow (Project & Task Flow)','Notifications','Reports & Analytics','Document & File Management','Chat / Real-Time Collaboration','Approval Workflows','Settings & Master Configuration'];

function reorderModules(modules) {
  if (!modules || !modules.length) return [];
  return [ ...SIDEBAR_ORDER.map(name => modules.find(m => m.name === name)).filter(Boolean), ...modules.filter(m => !SIDEBAR_ORDER.includes(m.name)) ];
}

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
        if (await isLocked(`${tenantId}::${email}`)) return res.status(423).json({ message: 'Account locked due to repeated failures. Try later.' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          await recordFailedAttempt(`${tenantId}::${email}`);
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.is_locked) return res.status(423).json({ message: 'Account locked. Contact admin.' });

        if (user.password_changed_at) {
          const maxDays = parseInt(process.env.PASSWORD_EXPIRE_DAYS || '60', 10);
          const changed = new Date(user.password_changed_at).getTime();
          const ageDays = (Date.now() - changed) / (1000 * 60 * 60 * 24);
          if (ageDays > maxDays) return res.status(403).json({ message: 'Password expired. Please reset your password.' });
        }

        // If user has TOTP-based 2FA enabled, require OTP in this login call and verify
        // Consider 2FA enabled only when the explicit flag is set. Presence of a stored
        // secret alone (setup in progress) should NOT force OTP at login.
        const is2faEnabled = Boolean(user.is2fa_enabled === 1 || user.is2fa_enabled === '1' || user.is_2fa_enabled === 1 || user.is_2fa_enabled === '1' || user.is2FAEnabled === 1 || user.is2FAEnabled === '1');
        if (is2faEnabled) {
          const otp = req.body && req.body.otp;
          if (!otp) {
            // Send an email OTP as a fallback/UX convenience while TOTP is enabled.
            try {
              const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
              const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
              const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
              const resp = { requires2fa: true, message: 'OTP required', totp: true, emailOtp: true, tempToken, userId: user.public_id || String(user._id), sent: !!otpRes.sent };
              if (includeOtp) resp.otp = otpRes.code;
              return res.json(resp);
            } catch (e) {
              // If email sending fails, still inform client that TOTP is required
              const tempToken = jwt.sign({ id: user._id, step: 'totp' }, process.env.SECRET || 'secret', { expiresIn: '5m' });
              return res.json({ requires2fa: true, message: 'OTP required', totp: true, tempToken, userId: user.public_id || String(user._id) });
            }
          }
          const secret = user.twofa_secret || user.twofaSecret || user.totp_secret || null;
          if (!secret) return res.status(500).json({ message: '2FA misconfigured for user' });
          const verified = speakeasy.totp.verify({ secret: String(secret), encoding: 'base32', token: String(otp), window: 1 });
          if (!verified) {
            await recordFailedAttempt(`${tenantId}::${email}`);
            return res.status(401).json({ message: 'Invalid OTP' });
          }
          // OTP valid — complete login
          await resetAttempts(`${tenantId}::${email}`);
          return completeLoginForUser(user, req, res);
        }

        // No 2FA required — complete login and return tokens
        await resetAttempts(`${tenantId}::${email}`);
        return completeLoginForUser(user, req, res);
      } catch (e) {
        return res.status(500).json({ message: 'Auth error', error: e.message });
      }
    });
    return;
  }

  // If tenantId provided, proceed as before
  const lockKey = `${tenantId}::${email}`;
  if (await isLocked(lockKey)) return res.status(423).json({ message: 'Account locked due to repeated failures. Try later.' });

  const sql = 'SELECT * FROM users WHERE email = ? LIMIT 1';
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = results[0];

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      await recordFailedAttempt(lockKey);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account locked flag in DB (optional column)
    if (user.is_locked) return res.status(423).json({ message: 'Account locked. Contact admin.' });

    // optional: password expiry check (requires password_changed_at column)
    if (user.password_changed_at) {
      const maxDays = parseInt(process.env.PASSWORD_EXPIRE_DAYS || '60', 10);
      const changed = new Date(user.password_changed_at).getTime();
      const ageDays = (Date.now() - changed) / (1000 * 60 * 60 * 24);
      if (ageDays > maxDays) return res.status(403).json({ message: 'Password expired. Please reset your password.' });
    }

    // If user has TOTP-based 2FA enabled, require OTP in this login call and verify
    // Consider 2FA enabled only when the explicit flag is set. Presence of a stored
    // secret alone (setup in progress) should NOT force OTP at login.
    const is2faEnabled = Boolean(user.is2fa_enabled === 1 || user.is2fa_enabled === '1' || user.is_2fa_enabled === 1 || user.is_2fa_enabled === '1' || user.is2FAEnabled === 1 || user.is2FAEnabled === '1');
    if (is2faEnabled) {
      const otp = req.body && req.body.otp;
      if (!otp) {
        try {
          const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
          const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
          const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
          const resp = { requires2fa: true, message: 'OTP required', totp: true, emailOtp: true, tempToken, userId: user.public_id || String(user._id), sent: !!otpRes.sent };
          if (includeOtp) resp.otp = otpRes.code;
          return res.json(resp);
        } catch (e) {
          const tempToken = jwt.sign({ id: user._id, step: 'totp' }, process.env.SECRET || 'secret', { expiresIn: '5m' });
          return res.json({ requires2fa: true, message: 'OTP required', totp: true, tempToken, userId: user.public_id || String(user._id) });
        }
      }
      const secret = user.twofa_secret || user.twofaSecret || user.totp_secret || null;
      if (!secret) return res.status(500).json({ message: '2FA misconfigured for user' });
      const verified = speakeasy.totp.verify({ secret: String(secret), encoding: 'base32', token: String(otp), window: 1 });
      if (!verified) {
        await recordFailedAttempt(lockKey);
        return res.status(401).json({ message: 'Invalid OTP' });
      }
      await resetAttempts(lockKey);
      return completeLoginForUser(user, req, res);
    }

    // No 2FA required — complete login and return tokens
    await resetAttempts(lockKey);
    return completeLoginForUser(user, req, res);
  });
});

// Helper to complete login: generate tokens, modules and return standard response
async function completeLoginForUser(user, req, res) {
  try {
    const tokenIdForJwt = user.public_id || String(user._id);
    const token = jwt.sign({ id: tokenIdForJwt }, process.env.SECRET || 'secret', { expiresIn: '7d' });
    const refreshToken = jwt.sign({ id: tokenIdForJwt, type: 'refresh' }, process.env.SECRET || 'secret', { expiresIn: '30d' });

    const storedModules = normalizeStoredModules(user);
    const modulesToReturn = storedModules && storedModules.length ? storedModules : getDefaultModules(user.role);
    const orderedModules = reorderModules(modulesToReturn);
    const modulesWithPaths = annotateModulesWithPaths(orderedModules, user.role);

    // Get role-based login response with dashboard metrics and accessible resources
    let roleBasedData = {};
    try {
      const RoleBasedLoginResponse = require('./utils/RoleBasedLoginResponse');
      const metrics = await RoleBasedLoginResponse.getDashboardMetrics(user._id, user.role, user.tenant_id);
      const resources = await RoleBasedLoginResponse.getAccessibleResources(user._id, user.role, user.tenant_id);
      roleBasedData = { metrics, resources };
    } catch (e) {
      console.warn('Could not load role-based login response:', e.message);
      roleBasedData = {};
    }

    // Optional: log login history
    try {
      const insert = 'INSERT INTO login_history (user_id, tenant_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
      const ip = req.ip || (req.connection && req.connection.remoteAddress);
      const ua = req.headers['user-agent'] || '';
      db.query(insert, [user._id, user.tenant_id || null, ip, ua, 1], () => {});
    } catch (e) {}

    return res.json({ 
      token, 
      refreshToken, 
      user: { 
        id: user.public_id || String(user._id), 
        email: user.email, 
        name: user.name, 
        role: user.role,
        // Include modules for all roles (Client-Viewer gets restricted modules with view-only access)
        modules: modulesWithPaths,
        phone: user.phone || null,
        title: user.title || null,
        department: user.department || null
      },
      ...roleBasedData
    });
  } catch (e) {
    return res.status(500).json({ message: 'Login error', error: e.message });
  }
}

// Verify OTP and return full auth token
router.post('/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body;
  if (!tempToken || !otp) return res.status(400).json({ message: 'tempToken and otp required' });

  try {
    const payload = jwt.verify(tempToken, process.env.SECRET || 'secret');
    if (!payload || payload.step !== 'otp') return res.status(401).json({ message: 'Invalid temp token' });

    const userId = payload.id;
    const sql = 'SELECT * FROM users WHERE _id = ? LIMIT 1';
    db.query(sql, [userId], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });

      const user = results[0];
      const ok = await otpService.verifyOtp(user._id || user.email, otp);
      if (!ok) return res.status(401).json({ message: 'Invalid or expired OTP' });

      return completeLoginForUser(user, req, res);
    });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired temp token', error: e.message });
  }
});


// Refresh access token using a refresh token. Accepts `refreshToken` in body
// or as a Bearer token in `Authorization` header. Returns new access token
// and a rotated refresh token (stateless rotation - no server-side storage).
router.post('/refresh', (req, res) => {
  const incoming = req.body && req.body.refreshToken
    || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!incoming) return res.status(400).json({ message: 'refreshToken required' });

  try {
    const payload = jwt.verify(incoming, process.env.SECRET || 'secret');
    if (!payload || payload.type !== 'refresh' || !payload.id) return res.status(401).json({ message: 'Invalid refresh token' });

    const tokenIdForJwt = payload.id;
    // issue a new access token (7 days)
    const token = jwt.sign({ id: tokenIdForJwt }, process.env.SECRET || 'secret', { expiresIn: '7d' });
    // rotate refresh token (30 days)
    const refreshToken = jwt.sign({ id: tokenIdForJwt, type: 'refresh' }, process.env.SECRET || 'secret', { expiresIn: '30d' });

    // attempt to return user info if we can resolve the id to a user row
    const isNumeric = /^\d+$/.test(String(tokenIdForJwt));
    const sqlFind = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    db.query(sqlFind, [tokenIdForJwt], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!rows || rows.length === 0) return res.json({ token, refreshToken });
      const user = rows[0];
      const userResp = { id: user.public_id || String(user._id), email: user.email, name: user.name, role: user.role };
      return res.json({ token, refreshToken, user: userResp });
    });
  } catch (e) {
    if (e && e.name === 'TokenExpiredError') return res.status(401).json({ message: 'Refresh token expired' });
    return res.status(401).json({ message: 'Invalid refresh token', error: e.message });
  }
});

// Forgot password: sends OTP to email. If tenant header missing, infer by email.
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  let tenantId = req.headers['x-tenant-id'] || req.body && req.body.tenantId || req.query && req.query.tenantId;
  if (!email) return res.status(400).json({ message: 'email required' });

  if (!tenantId) {
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
      if (results.length > 1) return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.' });
      const user = results[0];
      try {
        await otpService.sendOtp(user.email, user._id || user.email);
        return res.json({ message: 'OTP sent' });
      } catch (e) { return res.status(500).json({ message: 'Failed to send OTP' }); }
    });
    return;
  }

  const sql = 'SELECT * FROM users WHERE email = ? LIMIT 1';
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = results[0];
    try {
      await otpService.sendOtp(user.email, user._id || user.email);
      return res.json({ message: 'OTP sent' });
    } catch (e) {
      return res.status(500).json({ message: 'Failed to send OTP' });
    }
  });
});

// Resend OTP: accept a tempToken (issued at login) and resend the OTP with rate-limiting
router.post('/resend-otp', async (req, res) => {
  const { tempToken } = req.body;
  if (!tempToken) return res.status(400).json({ message: 'tempToken required' });

  let payload;
  try {
    payload = jwt.verify(tempToken, process.env.SECRET || 'secret');
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired temp token' });
  }
  if (!payload || payload.step !== 'otp' || !payload.id) return res.status(400).json({ message: 'Invalid temp token' });

  const userId = payload.id;

  // resolve user email
  db.query('SELECT _id, email FROM users WHERE _id = ? LIMIT 1', [userId], async (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];

    try {
      const can = await canResendOtp(userId);
      if (!can.ok) {
        if (can.limitReached) return res.status(429).json({ message: 'Resend limit reached. Try later.' });
        return res.status(429).json({ message: 'Too many requests. Retry after seconds.', retryAfter: can.retryAfter || RESEND_MIN_INTERVAL });
      }

      const otpRes = await otpService.resendOtp(user.email, userId);
      await noteResendOtp(userId);
      const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
      const resp = { message: 'OTP resent', sent: !!otpRes.sent };
      if (includeOtp) resp.otp = otpRes.code;
      return res.json(resp);
    } catch (e) {
      console.warn('Resend OTP failed', e && e.message);
      return res.status(500).json({ message: 'Failed to resend OTP' });
    }
  });
});

// Reset password using OTP; infer tenant by email if header missing
router.post('/reset-password', (req, res) => {
  const { email, otp, newPassword } = req.body;
  let tenantId = req.headers['x-tenant-id'] || req.body && req.body.tenantId || req.query && req.query.tenantId;
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'email, otp and newPassword required' });

  const handleResetForUser = async (user) => {
    if (process.env.OTP_DEBUG === 'true') {
      try { console.log(`[RESET-PW] verifyOtp called for user _id=${user._id} email=${user.email} otp=${otp}`); } catch (e) {}
    }
    const ok = await otpService.verifyOtp(user._id || user.email, otp);
    if (!ok) return res.status(401).json({ message: 'Invalid or expired OTP' });

    const check = passwordPolicy.validatePassword(newPassword);
    if (!check.valid) return res.status(400).json({ message: check.reason });

    const reused = await passwordPolicy.isPasswordReused(db, user._id, newPassword);
    if (reused) return res.status(400).json({ message: 'Cannot reuse recent password' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const upd = 'UPDATE users SET password = ?, password_changed_at = NOW() WHERE _id = ?';
    db.query(upd, [hashed, user._id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Failed to update password' });
      try {
        const ih = 'INSERT INTO password_history (user_id, password_hash, changed_at) VALUES (?, ?, NOW())';
        db.query(ih, [user._id, hashed], () => {});
      } catch (e) {}
      return res.json({ message: 'Password updated' });
    });
  };

  if (!tenantId) {
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
      if (results.length > 1) return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.' });
      const user = results[0];
      return handleResetForUser(user);
    });
    return;
  }

  // Resolve user by email. If multiple users found for same email across tenants,
  // ask client to provide `x-tenant-id` to disambiguate. This keeps reset flow
  // tenant-agnostic except when the email exists in multiple tenants.
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
    if (results.length > 1) return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.' });
    const user = results[0];
    return handleResetForUser(user);
  });
});

// Logout: for token-based stateless, instruct client to delete token
router.post('/logout', requireAuth, (req, res) => {
  // could store token blacklist if needed
  return res.json({ message: 'Logged out' });
});

// Complete setup: accept setupToken issued at user creation and set initial password
router.post('/complete-setup', async (req, res) => {
  const { setupToken, newPassword, confirmPassword } = req.body;
  if (!setupToken || !newPassword || !confirmPassword) return res.status(400).json({ message: 'setupToken, newPassword and confirmPassword required' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New and confirm passwords do not match' });

  let payload;
  try {
    payload = jwt.verify(setupToken, process.env.SECRET || 'change_this_secret');
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired setup token' });
  }
  if (!payload || payload.step !== 'setup' || !payload.id) return res.status(400).json({ message: 'Invalid setup token' });

  try {
    // find user by public_id or numeric id
    const idVal = payload.id;
    const isNumeric = /^\d+$/.test(String(idVal));
    const sqlFind = isNumeric ? 'SELECT _id FROM users WHERE _id = ? LIMIT 1' : 'SELECT _id FROM users WHERE public_id = ? LIMIT 1';
    db.query(sqlFind, [idVal], async (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
      const user = rows[0];

      // validate policy
      const check = passwordPolicy.validatePassword(newPassword);
      if (!check.valid) return res.status(400).json({ message: check.reason });

      const reused = await passwordPolicy.isPasswordReused(db, user._id, newPassword);
      if (reused) return res.status(400).json({ message: 'Cannot reuse recent password' });

      const hashed = await bcrypt.hash(newPassword, 10);
      const upd = 'UPDATE users SET password = ?, password_changed_at = NOW() WHERE _id = ?';
      db.query(upd, [hashed, user._id], (uErr) => {
        if (uErr) return res.status(500).json({ message: 'Failed to update password' });
        try {
          const ih = 'INSERT INTO password_history (user_id, password_hash, changed_at) VALUES (?, ?, NOW())';
          db.query(ih, [user._id, hashed], () => {});
        } catch (e) {}
        return res.json({ message: 'Password setup complete' });
      });
    });
  } catch (e) {
    return res.status(500).json({ message: 'Error completing setup', error: e.message });
  }
});

// Profile endpoints
router.get('/profile', requireAuth, async (req, res) => {
  const user = req.user;
  
  try {
    // ✅ Dynamic column detection
    const wanted = [
      '_id', 'public_id', 'name', 'email', 'role', 'tenant_id', 'phone', 
      'isActive', 'created_at', 'createdAt', 'last_login', 'last_login_at',
      'email_verified', 'is_email_verified', 'twofa_secret', 'is2fa_enabled',
      'photo' // Profile photo
    ];
    
    const infoSql = `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
                     AND COLUMN_NAME IN (${wanted.map(() => '?').join(',')})`;
    
    db.query(infoSql, wanted, (iErr, cols) => {
      if (iErr) {
        console.error('Column detection error:', iErr);
        const safe = { 
          id: user.public_id || user._id, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        };
        return res.json({ user: safe });
      }
      
      const present = Array.isArray(cols) ? cols.map(r => r.COLUMN_NAME) : [];
      const selectCols = ['_id', 'public_id', 'name', 'email', 'role', 'tenant_id']
        .concat([
          'phone', 'isActive', 'created_at', 'createdAt', 'last_login', 
          'last_login_at', 'email_verified', 'is_email_verified', 
          'twofa_secret', 'is2fa_enabled', 'photo'
        ].filter(c => present.includes(c)));
      
      const sql = `SELECT ${selectCols.join(', ')} FROM users WHERE _id = ? LIMIT 1`;
      
      db.query(sql, [user._id], (uErr, rows) => {
        if (uErr) {
          console.error('User query error:', uErr);
          return res.status(500).json({ message: 'Database error' });
        }
        
        if (!rows || rows.length === 0) {
          return res.status(404).json({ message: 'User not found' });
        }
        
        const row = rows[0];
        
        // ✅ FULL URL GENERATION - Your exact logic
        let photoUrl = row.photo;
        if (photoUrl && !photoUrl.startsWith('http')) {
          photoUrl = `${req.protocol}://${req.get('host')}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
        }
        
        const safe = {
          id: row.public_id || row._id,
          email: row.email,
          name: row.name || '',
          role: row.role || 'user',
          tenant_id: row.tenant_id || null,
          phone: row.phone || null,
          photo: photoUrl, // ✅ Full URL: http://localhost:3000/uploads/profiles/...
          accountStatus: Boolean(row.isActive) ? 'Active' : 'Inactive',
          memberSince: (row.created_at || row.createdAt) 
            ? new Date(row.created_at || row.createdAt).toISOString() 
            : null,
          lastLogin: (row.last_login || row.last_login_at) 
            ? new Date(row.last_login || row.last_login_at).toISOString() 
            : null,
          emailVerified: Boolean(row.email_verified ?? row.is_email_verified ?? true),
          twoFactor: {
            enabled: Boolean(row.is2fa_enabled === 1 || row.is2fa_enabled === true),
            hasSecret: Boolean(row.twofa_secret && row.twofa_secret !== null && row.twofa_secret !== ''),
            status: Boolean(row.is2fa_enabled === 1 || row.is2fa_enabled === true) ? 'Enabled' : 'Disabled'
          }
        };
        
        console.log('✅ Profile served:', { id: safe.id, hasPhoto: !!safe.photo });
        res.json({ user: safe });
      });
    });
  } catch (e) {
    console.error('Profile GET error:', e);
    res.status(500).json({ 
      user: { 
        id: user.public_id || user._id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      } 
    });
  }
});

// PUT /api/profile
router.put("/profile", requireAuth, upload.single("photo"), async (req, res) => {
  const user = req.user;
  const { name, email, phone, title } = req.body;

  try {
    // Ensure upload directory exists
    await upload.ensureUploadsDir();

    // Correct directory path
    const uploadDir = path.join(process.cwd(), "uploads/profiles");

    let photoPath = user.photo || null;

    // If new file uploaded
    if (req.file) {
      const allFiles = fs.readdirSync(uploadDir);

      // Delete old photos
      allFiles.forEach((file) => {
        if (file.startsWith(String(user._id))) {
          try { fs.unlinkSync(path.join(uploadDir, file)); } catch {}
        }
      });

      // Create new filename
      const newFileName = `${user._id}-${Date.now()}.png`;
      const fullPath = path.join(uploadDir, newFileName);

      fs.writeFileSync(fullPath, req.file.buffer);

      photoPath = `/uploads/profiles/${newFileName}`;
    }

    const newEmail = email || user.email;
    const newName = name || user.name;
    const newPhone = phone ?? user.phone;
    const newTitle = title ?? user.title;

    const sql = `
      UPDATE users 
      SET name = ?, email = ?, phone = ?, title = ?, photo = ?
      WHERE _id = ?
    `;

    const values = [newName, newEmail, newPhone, newTitle, photoPath, user._id];

    db.query(sql, values, (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(409).json({ message: "Email already exists" });

        return res.status(500).json({ message: "DB error", error: err });
      }

      db.query(
        `SELECT _id, public_id, email, name, phone, title, photo, role, tenant_id 
         FROM users 
         WHERE _id = ? LIMIT 1`,
        [user._id],
        (qErr, rows) => {
          if (qErr) return res.status(500).json({ message: "DB error", error: qErr });
          if (!rows.length) return res.status(404).json({ message: "User not found" });

          const updated = rows[0];

          const fullPhotoURL = updated.photo
            ? `${req.protocol}://${req.get("host")}${updated.photo}`
            : null;

          return res.json({
            message: "Profile updated successfully",
            user: {
              id: updated.public_id || updated._id,
              email: updated.email,
              name: updated.name,
              phone: updated.phone,
              title: updated.title,
              role: updated.role,
              tenant_id: updated.tenant_id,
              photo: fullPhotoURL,
            },
          });
        }
      );
    });
  } catch (e) {
    console.error("PROFILE ERROR:", e);
    return res.status(500).json({ message: "Upload failed", error: e.message });
  }
});


// Change password for authenticated user
router.post('/change-password', requireAuth, async (req, res) => {
  const user = req.user;
  const { oldPassword, newPassword, confirmPassword } = req.body;
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ message: 'oldPassword, newPassword and confirmPassword required' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New and confirm passwords do not match' });

  // verify old password
  const sqlFind = 'SELECT password FROM users WHERE _id = ? LIMIT 1';
  db.query(sqlFind, [user._id], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
    const row = results[0];
    const match = await bcrypt.compare(oldPassword, row.password);
    if (!match) return res.status(401).json({ message: 'Old password incorrect' });

    // policy
    const check = passwordPolicy.validatePassword(newPassword);
    if (!check.valid) return res.status(400).json({ message: check.reason });

    const reused = await passwordPolicy.isPasswordReused(db, user._id, newPassword);
    if (reused) return res.status(400).json({ message: 'Cannot reuse recent password' });

    const hashed = await bcrypt.hash(newPassword, 10);
    const upd = 'UPDATE users SET password = ?, password_changed_at = NOW() WHERE _id = ?';
    db.query(upd, [hashed, user._id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Failed to update password' });

      try {
        const ih = 'INSERT INTO password_history (user_id, password_hash, changed_at) VALUES (?, ?, NOW())';
        db.query(ih, [user._id, hashed], () => {});
      } catch (e) {}

      return res.json({ message: 'Password changed' });
    });
  });
});

// 2FA endpoints
// Enable 2FA for authenticated user: returns secret (base32) and QR code data URL
router.post('/2fa/enable', requireAuth, async (req, res) => {
  const userId = req.user && req.user._id;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const okCols = await ensureUsers2FAColumns();
    if (!okCols) return res.status(500).json({ message: 'Failed to ensure 2FA columns on users table' });
    const sqlFind = 'SELECT email, twofa_secret, is2fa_enabled FROM users WHERE _id = ? LIMIT 1';
    db.query(sqlFind, [userId], async (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
      const row = rows[0];
      const email = row.email || 'user@example.com';

      const alreadyEnabled = Boolean(row.is2fa_enabled === 1 || row.is2fa_enabled === '1');
      if (alreadyEnabled) {
        return res.json({ success: true, enabled: true, message: '2FA already enabled. Call /api/auth/2fa/disable to turn it off.' });
      }

      // If a secret is already stored (user started setup but didn't verify), return it again
      if (row.twofa_secret) {
        const otpauth = `otpauth://totp/TaskManager:${encodeURIComponent(email)}?secret=${row.twofa_secret}&issuer=TaskManager`;
        let qr = null;
        try { qr = await qrcode.toDataURL(otpauth); } catch (e) { qr = null; }
        return res.json({ success: true, enabled: false, secret: row.twofa_secret, qr, message: 'Existing secret stored; verify to enable' });
      }

      // create new secret and store it (do not enable until /2fa/verify)
      const secretObj = speakeasy.generateSecret({ length: 20, name: `TaskManager (${email})` });
      const secretBase32 = secretObj.base32;
      const upd = 'UPDATE users SET twofa_secret = ? WHERE _id = ?';
      db.query(upd, [secretBase32, userId], async (uErr) => {
        if (uErr) return res.status(500).json({ message: 'Failed to store 2FA secret', error: uErr.message });
        try {
          const otpauth = secretObj.otpauth_url || `otpauth://totp/TaskManager:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=TaskManager`;
          const qr = await qrcode.toDataURL(otpauth);
          return res.json({ success: true, enabled: false, secret: secretBase32, qr, message: 'Secret stored; verify with /api/auth/2fa/verify to enable' });
        } catch (e) {
          return res.json({ success: true, enabled: false, secret: secretBase32, qr: null, message: 'Secret stored; verify with /api/auth/2fa/verify to enable' });
        }
      });
    });
  } catch (e) {
    return res.status(500).json({ message: '2FA enable error', error: e.message });
  }
});

// Disable 2FA for authenticated user
router.post('/2fa/disable', requireAuth, (req, res) => {
  const userId = req.user && req.user._id;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  (async () => {
    const okCols = await ensureUsers2FAColumns();
    if (!okCols) return res.status(500).json({ message: 'Failed to ensure 2FA columns on users table' });
    const upd = 'UPDATE users SET twofa_secret = NULL, is2fa_enabled = 0 WHERE _id = ?';
    db.query(upd, [userId], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to disable 2FA', error: err.message });
      return res.json({ success: true, enabled: false, message: '2FA disabled' });
    });
  })();
});

// Verify a given TOTP token for the authenticated user (useful for setup confirmation)
router.post('/2fa/verify', requireAuth, (req, res) => {
  const userId = req.user && req.user._id;
  const { token } = req.body;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  if (!token) return res.status(400).json({ message: 'token required' });
  (async () => {
    const okCols = await ensureUsers2FAColumns();
    if (!okCols) return res.status(500).json({ message: 'Failed to ensure 2FA columns on users table' });
    db.query('SELECT twofa_secret FROM users WHERE _id = ? LIMIT 1', [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'DB error', error: err.message });
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const secret = rows[0].twofa_secret || rows[0].twofaSecret || null;
    if (!secret) return res.status(400).json({ message: '2FA not configured for user' });
    const verified = speakeasy.totp.verify({ secret: String(secret), encoding: 'base32', token: String(token), window: 1 });
    if (!verified) {
      // Helpful debug info when enabled in dev environment only
      if (process.env.DEV_INCLUDE_OTP === 'true') {
        try {
          const current = speakeasy.totp({ secret: String(secret), encoding: 'base32' });
          const serverTime = new Date().toISOString();
          return res.status(401).json({ success: false, message: 'Invalid token', expected: current, serverTime });
        } catch (e) {
          return res.status(401).json({ success: false, message: 'Invalid token' });
        }
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    // mark 2FA enabled now that user has confirmed the token
      const upd = 'UPDATE users SET is2fa_enabled = 1 WHERE _id = ?';
      db.query(upd, [userId], (uErr) => {
        if (uErr) return res.status(500).json({ message: 'Failed to enable 2FA', error: uErr.message });
        // Return fresh auth tokens so frontend doesn't need to call refresh immediately
        try {
          return completeLoginForUser(req.user || { _id: userId }, req, res);
        } catch (e) {
          return res.json({ success: true, enabled: true, message: '2FA verified and enabled' });
        }
      });
  });
  })();
});

// Get current 2FA status for authenticated user
router.get('/2fa/status', requireAuth, async (req, res) => {
  const userId = req.user && req.user._id;
  if (!userId) return res.status(401).json({ message: 'Not authenticated' });
  try {
    const okCols = await ensureUsers2FAColumns();
    if (!okCols) return res.status(500).json({ message: 'Failed to ensure 2FA columns on users table' });
    db.query('SELECT twofa_secret, is2fa_enabled FROM users WHERE _id = ? LIMIT 1', [userId], (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
      const r = rows[0];
      const enabled = Boolean(r.is2fa_enabled === 1 || r.is2fa_enabled === '1');
      const hasSecret = !!r.twofa_secret;
      return res.json({ success: true, enabled, hasSecret });
    });
  } catch (e) {
    return res.status(500).json({ message: 'Error fetching 2FA status', error: e.message });
  }
});

module.exports = router;
