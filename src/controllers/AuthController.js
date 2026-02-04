const express = require('express');
const router = express.Router();
const db = require(__root + 'db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
let logger;
try { logger = require(__root + 'logger'); } catch (e) { try { logger = require('../../logger'); } catch (e2) { logger = console; } }
const { check } = require('express-validator');
const validateRequest = require(__root + 'middleware/validateRequest');
const { requireAuth, requireRole } = require(__root + 'middleware/roles');
const upload = require(__root + 'multer');
const otpService = require(__root + 'utils/otpService');
const passwordPolicy = require('../services/passwordPolicy');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const MODULE_ROUTE_MAP = {
  Manager: {
    'User Management': '/manager/users'
  },
  Admin: {
    'User Management': '/admin/users'
  }
};

function slugifyModule(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\s+&\s+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}
let env;
try { env = require('../config/env'); } catch (e) { try { env = require('../../src/config/env'); } catch (e2) { env = process.env; } }
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || process.env.REFRESH_EXPIRES_IN || '30d';
const RESEND_MIN_INTERVAL = Number(process.env.RESEND_MIN_INTERVAL || 60); // seconds
const RESEND_MAX_PER_WINDOW = Number(process.env.RESEND_MAX_PER_WINDOW || 5);
const RESEND_WINDOW_SECONDS = Number(process.env.RESEND_WINDOW_SECONDS || 3600); // default 1 hour
const PASSWORD_EXPIRE_DAYS = Number(process.env.PASSWORD_EXPIRE_DAYS || 60);
const SECRET = env.JWT_SECRET || env.SECRET || process.env.SECRET || 'secret';
router.post('/refresh', (req, res) => {
  logger.info('=== REFRESH ENDPOINT CALLED ===');
  
  const incoming = (req.body && req.body.refreshToken)
    || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  
  if (!incoming) {
    logger.warn('No refresh token provided');
    return res.status(400).json({ message: 'refreshToken required' });
  }

  logger.info('Token Configuration:');
  logger.info(`ACCESS_TOKEN_EXPIRES_IN: ${ACCESS_TOKEN_EXPIRES_IN}`);
  logger.info(`REFRESH_TOKEN_EXPIRES_IN: ${REFRESH_TOKEN_EXPIRES_IN}`);
  logger.debug('Incoming token (first 50 chars):', incoming.substring(0, 50));

  try {
    logger.debug('Verifying refresh token');
    const payload = jwt.verify(incoming, SECRET);
    logger.debug('Token payload verified:', JSON.stringify(payload, null, 2));

    if (!payload || payload.type !== 'refresh' || !payload.id) {
      logger.warn('Token missing required fields', { hasPayload: !!payload, type: payload && payload.type, id: payload && payload.id });
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const tokenIdForJwt = payload.id;
    logger.debug('Token ID:', tokenIdForJwt);
    
    logger.info('Issuing new tokens');
    const token = jwt.sign({ id: tokenIdForJwt }, SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: tokenIdForJwt, type: 'refresh' }, SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    logger.debug('New tokens generated');

    const isNumeric = /^\d+$/.test(String(tokenIdForJwt));
    const sqlFind = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    
    logger.debug('Querying user with ID', tokenIdForJwt);
    logger.silly('SQL:', sqlFind);
    
    db.query(sqlFind, [tokenIdForJwt], (err, rows) => {
      if (err) {
        logger.error('Database error:', err && err.message);
        return res.status(500).json({ message: 'DB error', error: err && err.message });
      }

      logger.debug('User query result:', rows ? `Found ${rows.length} rows` : 'No rows');

      if (!rows || rows.length === 0) {
        logger.warn('No user found, returning tokens only');
        return res.json({ token, refreshToken });
      }

      const user = rows[0];
      logger.info('User found for refresh:', user.email);

      const userResp = { id: user.public_id || String(user._id), email: user.email, name: user.name, role: user.role };

      logger.info('Sending response with tokens and user info');
      return res.json({ token, refreshToken, user: userResp });
    });
  } catch (e) {
    logger.error('Refresh token verification failed:', e && e.message);
    return res.status(401).json({ message: 'Invalid or expired refresh token', error: e && e.message });
  }
});
function modulePathFor(role, name) {
  const map = MODULE_ROUTE_MAP[role] || {};
  if (role === 'Manager' && name === 'User Management') return '/manager/users';
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
  if (role === 'Manager') return [ mk('User Management','view'), mk('Dashboard','full'), mk('Clients','full'), mk('Tasks','full'), mk('Projects','full'), mk('Workflow (Project & Task Flow)','full'), mk('Notifications','limited'), mk('Reports & Analytics','full'), mk('Document & File Management','limited'), mk('Chat / Real-Time Collaboration','full'), mk('Approval Workflows','limited') ];
  if (role === 'Employee') return [ mk('Dashboard','view'), mk('Tasks','limited'), mk('Notifications','limited'), mk('Reports & Analytics','limited'), mk('Document & File Management','limited'), mk('Chat / Real-Time Collaboration','full') ];
  if (role === 'Client-Viewer') return [ mk('Dashboard','view'), mk('Assigned Tasks','view'), mk('Document & File Management','view') ];
  return [];
}

const SIDEBAR_ORDER = ['Dashboard','User Management','Clients','Departments','Tasks','Projects','Workflow (Project & Task Flow)','Notifications','Reports & Analytics','Document & File Management','Chat / Real-Time Collaboration','Approval Workflows','Settings & Master Configuration'];

function reorderModules(modules) {
  if (!modules || !modules.length) return [];
  return [ ...SIDEBAR_ORDER.map(name => modules.find(m => m.name === name)).filter(Boolean), ...modules.filter(m => !SIDEBAR_ORDER.includes(m.name)) ];
}
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
      (async () => {
        for (const s of toAdd) {
          try {
            await new Promise((res, rej) => db.query(s, [], (e) => e ? rej(e) : res()));
          } catch (e) {
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
      logger.warn('Redis error (AuthController):', err && err.message);
    });
    } catch (e) {
    logger.warn('Failed to initialize Redis client (AuthController):', e && e.message);
    redis = null;
  }
} else {
  if (process.env.REDIS_URL) logger.info('REQUIRE_REDIS is false — AuthController skipping Redis client creation');
}
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
  if (!global.__otpResend) global.__otpResend = new Map();
  const rec = global.__otpResend.get(String(userId)) || { count: 0, windowStart: Date.now(), last: 0 };
  const now = Date.now();
  if (now - rec.last < RESEND_MIN_INTERVAL * 1000) {
    return { ok: false, retryAfter: Math.ceil((RESEND_MIN_INTERVAL * 1000 - (now - rec.last)) / 1000) };
  }
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

router.post('/login', [
  check('email').isEmail().withMessage('Valid email required'),
  check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest
], async (req, res) => {
  const { email, password } = req.body;
  let tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenantId) || (req.query && req.query.tenantId);

  if (!email || !password) return res.status(400).json({ message: 'email and password required' });
  if (!tenantId) {
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
      if (results.length > 1) {
        const tenants = results.map(r => r.tenant_id).filter(Boolean);
        return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.', tenants });
      }
      const user = results[0];
      tenantId = user.tenant_id;
      try {
        if (await isLocked(`${tenantId}::${email}`)) return res.status(423).json({ message: 'Account locked due to repeated failures. Try later.' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) {
          await recordFailedAttempt(`${tenantId}::${email}`);
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.is_locked) return res.status(423).json({ message: 'Account locked. Contact admin.' });

        if (user.password_changed_at) {
          const changed = new Date(user.password_changed_at).getTime();
          const ageDays = (Date.now() - changed) / (1000 * 60 * 60 * 24);
          if (ageDays > PASSWORD_EXPIRE_DAYS) return res.status(403).json({ message: 'Password expired. Please reset your password.' });
        }
        const is2faEnabled = Boolean(user.is2fa_enabled === 1 || user.is2fa_enabled === '1' || user.is_2fa_enabled === 1 || user.is_2fa_enabled === '1' || user.is2FAEnabled === 1 || user.is2FAEnabled === '1');
        if (is2faEnabled) {
          const otp = req.body && req.body.otp;
          if (!otp) {
            try {
              const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
              const tempToken = jwt.sign({ id: user._id, step: 'otp' }, SECRET, { expiresIn: '10m' });
              const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
              const resp = { requires2fa: true, message: 'OTP required', totp: true, emailOtp: true, tempToken, userId: user.public_id || String(user._id), sent: !!otpRes.sent };
              if (includeOtp) resp.otp = otpRes.code;
              return res.json(resp);
            } catch (e) {
              const tempToken = jwt.sign({ id: user._id, step: 'totp' }, SECRET, { expiresIn: '5m' });
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
          await resetAttempts(`${tenantId}::${email}`);
          return completeLoginForUser(user, req, res);
        }

        await resetAttempts(`${tenantId}::${email}`);
        return completeLoginForUser(user, req, res);
      } catch (e) {
        return res.status(500).json({ message: 'Auth error', error: e.message });
      }
    });
    return;
  }
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

    if (user.is_locked) return res.status(423).json({ message: 'Account locked. Contact admin.' });
    if (user.password_changed_at) {
      const changed = new Date(user.password_changed_at).getTime();
      const ageDays = (Date.now() - changed) / (1000 * 60 * 60 * 24);
      if (ageDays > PASSWORD_EXPIRE_DAYS) return res.status(403).json({ message: 'Password expired. Please reset your password.' });
    }
    const is2faEnabled = Boolean(user.is2fa_enabled === 1 || user.is2fa_enabled === '1' || user.is_2fa_enabled === 1 || user.is_2fa_enabled === '1' || user.is2FAEnabled === 1 || user.is2FAEnabled === '1');
    if (is2faEnabled) {
      const otp = req.body && req.body.otp;
      if (!otp) {
        try {
          const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
          const tempToken = jwt.sign({ id: user._id, step: 'otp' }, SECRET, { expiresIn: '10m' });
          const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
          const resp = { requires2fa: true, message: 'OTP required', totp: true, emailOtp: true, tempToken, userId: user.public_id || String(user._id), sent: !!otpRes.sent };
          if (includeOtp) resp.otp = otpRes.code;
          return res.json(resp);
        } catch (e) {
          const tempToken = jwt.sign({ id: user._id, step: 'totp' }, SECRET, { expiresIn: '5m' });
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

    await resetAttempts(lockKey);
    return completeLoginForUser(user, req, res);
  });
});

async function completeLoginForUser(user, req, res) {
  try {
    const tokenIdForJwt = user.public_id || String(user._id);
    const token = jwt.sign({ id: tokenIdForJwt }, SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: tokenIdForJwt, type: 'refresh' }, SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    const storedModules = normalizeStoredModules(user);
    const modulesToReturn = storedModules && storedModules.length ? storedModules : getDefaultModules(user.role);
    const orderedModules = reorderModules(modulesToReturn);
    const modulesWithPaths = annotateModulesWithPaths(orderedModules, user.role);
    let roleBasedData = {};
    try {
      const RoleBasedLoginResponse = require(__root + 'controller/utils/RoleBasedLoginResponse');
      const publicId = user.public_id || null;
      const metrics = await RoleBasedLoginResponse.getDashboardMetrics(user._id, user.role, user.tenant_id, publicId);
      const resources = await RoleBasedLoginResponse.getAccessibleResources(user._id, user.role, user.tenant_id, publicId);
      roleBasedData = { metrics, resources };
    } catch (e) {
      logger.warn('Could not load role-based login response:', e.message);
      roleBasedData = {};
    }
    try {
      const insert = 'INSERT INTO login_history (user_id, tenant_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
      const ip = req.ip || (req.connection && req.connection.remoteAddress);
      const ua = req.headers['user-agent'] || '';
      db.query(insert, [user._id, user.tenant_id || null, ip, ua, 1], () => {});
    } catch (e) {}
    try {
      await new Promise((resolve, reject) => {
        db.query('UPDATE users SET is_online = TRUE WHERE _id = ?', [user._id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      logger.info(`User ${user.name} (${user._id}) set as online`);
    } catch (e) {
      logger.warn('Could not set user online status:', e.message);
    }
    let photoUrl = user.photo || null;
    if (photoUrl && !photoUrl.startsWith('http')) {
      photoUrl = `${req.protocol}://${req.get('host')}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
    }

    return res.json({ 
      token, 
      refreshToken, 
      user: { 
        id: user.public_id || String(user._id), 
        email: user.email, 
        name: user.name, 
        role: user.role,
        modules: modulesWithPaths,
        phone: user.phone || null,
        title: user.title || null,
        department: user.department || null,
        photo: photoUrl
      },
      ...roleBasedData
    });
  } catch (e) {
    return res.status(500).json({ message: 'Login error', error: e.message });
  }
}

router.post('/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body;
  if (!tempToken || !otp) return res.status(400).json({ message: 'tempToken and otp required' });

  try {
    const payload = jwt.verify(tempToken, SECRET);
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
router.post('/refresh', (req, res) => {
  logger.info('=== REFRESH ENDPOINT CALLED ===');
  
  const incoming = (req.body && req.body.refreshToken)
    || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  
  if (!incoming) {
    logger.warn('No refresh token provided');
    return res.status(400).json({ message: 'refreshToken required' });
  }

  logger.info('Token Configuration:');
  logger.info(`ACCESS_TOKEN_EXPIRES_IN: ${ACCESS_TOKEN_EXPIRES_IN}`);
  logger.info(`REFRESH_TOKEN_EXPIRES_IN: ${REFRESH_TOKEN_EXPIRES_IN}`);
  logger.debug('Incoming token (first 50 chars):', incoming.substring(0, 50));

  try {
    logger.debug('Verifying token with secret...');
    const payload = jwt.verify(incoming, SECRET);
    logger.debug('Token payload verified:', JSON.stringify(payload, null, 2));
    
    if (!payload || payload.type !== 'refresh' || !payload.id) {
      logger.warn('Token missing required fields:', { hasPayload: !!payload, type: payload && payload.type, id: payload && payload.id });
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const tokenIdForJwt = payload.id;
    logger.debug('Token ID:', tokenIdForJwt);
    
    logger.info('Access token expires in: ' + ACCESS_TOKEN_EXPIRES_IN);
    logger.info('Refresh token expires in: ' + REFRESH_TOKEN_EXPIRES_IN);
    const token = jwt.sign({ 
      id: tokenIdForJwt 
    }, SECRET, { 
      expiresIn: ACCESS_TOKEN_EXPIRES_IN 
    });
    const refreshToken = jwt.sign({ 
      id: tokenIdForJwt, 
      type: 'refresh' 
    }, SECRET, { 
      expiresIn: REFRESH_TOKEN_EXPIRES_IN 
    });

    logger.debug('New tokens generated');
    logger.debug('New access token (first 50 chars):', token.substring(0, 50));
    logger.debug('New refresh token (first 50 chars):', refreshToken.substring(0, 50));

    const isNumeric = /^\d+$/.test(String(tokenIdForJwt));
    const sqlFind = isNumeric ? 'SELECT * FROM users WHERE _id = ? LIMIT 1' : 'SELECT * FROM users WHERE public_id = ? LIMIT 1';
    
    logger.debug('Querying user with ID:', tokenIdForJwt);
    logger.silly('SQL:', sqlFind);
    
    db.query(sqlFind, [tokenIdForJwt], (err, rows) => {
      if (err) {
        logger.error('Database error:', err && err.message);
        return res.status(500).json({ message: 'DB error', error: err && err.message });
      }
      
      logger.debug('User query result:', rows ? `Found ${rows.length} rows` : 'No rows');
      
      if (!rows || rows.length === 0) {
        logger.warn('No user found, returning tokens only');
        return res.json({ token, refreshToken });
      }
      
      const user = rows[0];
      logger.info('User found:', user.email);
      
      const userResp = { id: user.public_id || String(user._id), email: user.email, name: user.name, role: user.role };
      
      logger.info('Sending response with tokens and user info');
      return res.json({ token, refreshToken, user: userResp });
    });
  } catch (e) {
    logger.error('JWT Verification Error:', e && e.message);
    logger.error('Stack trace:', e && e.stack);
    
    if (e && e.name === 'TokenExpiredError') {
      logger.warn('Token expired at:', e.expiredAt);
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    
    if (e && e.name === 'JsonWebTokenError') {
      logger.warn('JWT Error details:', e && e.message);
      logger.debug('Possible causes: - Wrong secret key; - Malformed token; - Token signed with different algorithm');
      return res.status(401).json({ message: 'Invalid refresh token', error: e && e.message });
    }
    
    logger.error('Other error:', e);
    return res.status(401).json({ message: 'Invalid refresh token', error: e && e.message });
  }
});
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  let tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenantId) || (req.query && req.query.tenantId);
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
router.post('/resend-otp', async (req, res) => {
  const { tempToken } = req.body;
  if (!tempToken) return res.status(400).json({ message: 'tempToken required' });

  let payload;
  try {
    payload = jwt.verify(tempToken, SECRET);
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired temp token' });
  }
  if (!payload || payload.step !== 'otp' || !payload.id) return res.status(400).json({ message: 'Invalid temp token' });

  const userId = payload.id;
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
      logger.warn('Resend OTP failed', e && e.message);
      return res.status(500).json({ message: 'Failed to resend OTP' });
    }
  });
});

router.post('/reset-password', (req, res) => {
  const { email, otp, newPassword } = req.body;
  let tenantId = req.headers['x-tenant-id'] || (req.body && req.body.tenantId) || (req.query && req.query.tenantId);
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'email, otp and newPassword required' });

  const handleResetForUser = async (user) => {
    if (process.env.OTP_DEBUG === 'true') {
      try { logger.debug(`[RESET-PW] verifyOtp called for user _id=${user._id} email=${user.email} otp=${otp}`); } catch (e) {}
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
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
    if (results.length > 1) return res.status(400).json({ message: 'Multiple tenants found for this email. Please provide x-tenant-id header.' });
    const user = results[0];
    return handleResetForUser(user);
  });
});
router.post('/complete-setup', async (req, res) => {
  const { setupToken, newPassword, confirmPassword } = req.body;
  if (!setupToken || !newPassword || !confirmPassword) return res.status(400).json({ message: 'setupToken, newPassword and confirmPassword required' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New and confirm passwords do not match' });

  let payload;
  try {
    payload = jwt.verify(setupToken, SECRET);
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired setup token' });
  }
  if (!payload || payload.step !== 'setup' || !payload.id) return res.status(400).json({ message: 'Invalid setup token' });

  try {
    const idVal = payload.id;
    const isNumeric = /^\d+$/.test(String(idVal));
    const sqlFind = isNumeric ? 'SELECT _id FROM users WHERE _id = ? LIMIT 1' : 'SELECT _id FROM users WHERE public_id = ? LIMIT 1';
    db.query(sqlFind, [idVal], async (err, rows) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });
      const user = rows[0];
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
router.get('/profile', requireAuth, async (req, res) => {
  const user = req.user;
  
  try {
    const wanted = [
      '_id', 'public_id', 'name', 'email', 'role', 'tenant_id', 'phone', 
      'isActive', 'created_at', 'createdAt', 'last_login', 'last_login_at',
      'email_verified', 'is_email_verified', 'twofa_secret', 'is2fa_enabled',
      'photo', 'title', 'department' // Profile photo and additional fields
    ];
    
    const infoSql = `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' 
                     AND COLUMN_NAME IN (${wanted.map(() => '?').join(',')})`;
    
    db.query(infoSql, wanted, (iErr, cols) => {
      if (iErr) {
        logger.error('Column detection error:', iErr);
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
          'twofa_secret', 'is2fa_enabled', 'photo', 'title', 'department'
        ].filter(c => present.includes(c)));
      
      const sql = `SELECT ${selectCols.join(', ')} FROM users WHERE _id = ? LIMIT 1`;
      
      db.query(sql, [user._id], (uErr, rows) => {
        if (uErr) {
          logger.error('User query error:', uErr);
          return res.status(500).json({ message: 'Database error' });
        }
        
        if (!rows || rows.length === 0) {
          return res.status(404).json({ message: 'User not found' });
        }
        
        const row = rows[0];
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
          title: row.title || null,
          department: row.department || null,
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
        
        logger.info('Profile served:', { id: safe.id, hasPhoto: !!safe.photo });
        res.json({ user: safe });
      });
    });
  } catch (e) {
    logger.error('Profile GET error:', e && e.message ? e.message : e);
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
router.put("/profile", requireAuth, upload.single("photo"), async (req, res) => {
  const user = req.user;
  const { name, email, phone, title, department } = req.body;

  try {
    await upload.ensureUploadsDir();
    const uploadDir = path.join(process.cwd(), "uploads/profiles");

    let photoPath = user.photo || null;
    if (req.file) {
      const allFiles = fs.readdirSync(uploadDir);
      allFiles.forEach((file) => {
        if (file.startsWith(String(user._id))) {
          try { fs.unlinkSync(path.join(uploadDir, file)); } catch {}
        }
      });
      const newFileName = `${user._id}-${Date.now()}.png`;
      const fullPath = path.join(uploadDir, newFileName);

      fs.writeFileSync(fullPath, req.file.buffer);

      photoPath = `/uploads/profiles/${newFileName}`;
    }

    const newEmail = email || user.email;
    const newName = name || user.name;
    const newPhone = phone ?? user.phone;
    const newTitle = title ?? user.title;
    const newDepartment = department ?? user.department;
    const candidate = {
      name: newName,
      email: newEmail,
      phone: newPhone,
      title: newTitle,
      department: newDepartment,
      photo: photoPath
    };

    const colNames = Object.keys(candidate);
    const infoSql = `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN (${colNames.map(() => '?').join(',')})`;
    db.query(infoSql, colNames, (iErr, cols) => {
      if (iErr) {
        logger.error('Column detection error (profile update):', iErr);
        return res.status(500).json({ message: 'DB error', error: iErr });
      }

      const present = Array.isArray(cols) ? cols.map(r => r.COLUMN_NAME) : [];
      const toUpdate = colNames.filter(c => present.includes(c));
      if (toUpdate.length === 0) {
        return res.json({ message: 'Profile updated (no mutable columns present)', user: { id: user.public_id || user._id, email: newEmail, name: newName } });
      }

      const setClause = toUpdate.map(c => `${c} = ?`).join(', ');
      const values = toUpdate.map(c => candidate[c]);
      values.push(user._id);

      const updSql = `UPDATE users SET ${setClause} WHERE _id = ?`;
      db.query(updSql, values, (err) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists' });
          return res.status(500).json({ message: 'DB error', error: err });
        }
        const selectCols = ['_id', 'public_id', 'email', 'name', 'phone', 'title', 'photo', 'role', 'tenant_id']
          .concat(present.includes('department') ? ['department'] : []);

        const selSql = `SELECT ${selectCols.join(', ')} FROM users WHERE _id = ? LIMIT 1`;
        db.query(selSql, [user._id], (qErr, rows) => {
          if (qErr) return res.status(500).json({ message: 'DB error', error: qErr });
          if (!rows || rows.length === 0) return res.status(404).json({ message: 'User not found' });

          const updated = rows[0];
          const fullPhotoURL = updated.photo ? `${req.protocol}://${req.get('host')}${updated.photo}` : null;
          return res.json({
            message: 'Profile updated successfully',
            user: {
              id: updated.public_id || updated._id,
              email: updated.email,
              name: updated.name,
              phone: updated.phone,
              title: updated.title,
              department: updated.department || null,
              role: updated.role,
              tenant_id: updated.tenant_id,
              photo: fullPhotoURL
            }
          });
        });
      });
    });
  } catch (e) {
    logger.error('PROFILE ERROR:', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Upload failed', error: e.message });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const user = req.user;
  const { oldPassword, newPassword, confirmPassword } = req.body;
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ message: 'oldPassword, newPassword and confirmPassword required' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New and confirm passwords do not match' });
  const sqlFind = 'SELECT password FROM users WHERE _id = ? LIMIT 1';
  db.query(sqlFind, [user._id], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
    const row = results[0];
    const match = await bcrypt.compare(oldPassword, row.password);
    if (!match) return res.status(401).json({ message: 'Old password incorrect' });
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
const REVOKE_2FA = (env && (String(env.REVOKE_2FA || process.env.REVOKE_2FA || '').toLowerCase() === 'true')) || false;
router.use('/2fa', (req, res, next) => {
  if (REVOKE_2FA) return res.status(404).json({ message: '2FA functionality has been disabled by server configuration' });
  return next();
});
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

      if (row.twofa_secret) {
        const otpauth = `otpauth://totp/TaskManager:${encodeURIComponent(email)}?secret=${row.twofa_secret}&issuer=TaskManager`;
        let qr = null;
        try { qr = await qrcode.toDataURL(otpauth); } catch (e) { qr = null; }
        return res.json({ success: true, enabled: false, secret: row.twofa_secret, qr, message: 'Existing secret stored; verify to enable' });
      }
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
      const upd = 'UPDATE users SET is2fa_enabled = 1 WHERE _id = ?';
      db.query(upd, [userId], (uErr) => {
        if (uErr) return res.status(500).json({ message: 'Failed to enable 2FA', error: uErr.message });
        try {
          return completeLoginForUser(req.user || { _id: userId }, req, res);
        } catch (e) {
          return res.json({ success: true, enabled: true, message: '2FA verified and enabled' });
        }
      });
  });
  })();
});

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
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });
    await new Promise((resolve, reject) => {
      db.query('UPDATE users SET is_online = FALSE WHERE _id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logger.info(`User ${userId} logged out and set as offline`);
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (e) {
    logger.error('Logout error:', e.message);
    return res.status(500).json({ message: 'Logout error', error: e.message });
  }
});

module.exports = router;