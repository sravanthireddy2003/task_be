const express = require('express');
const router = express.Router();
const db = require(__root + 'db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpService = require(__root + 'utils/otpService');
const passwordPolicy = require(__root + 'utils/passwordPolicy');
// tenantMiddleware available if endpoints need explicit tenant enforcement; most auth flows derive tenant from email/token
const { requireAuth } = require(__root + 'middleware/roles');
require('dotenv').config();

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

        try {
          const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
          const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
          await resetAttempts(`${tenantId}::${email}`);
          const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
          const resp = { message: 'OTP sent', tempToken, sent: !!otpRes.sent };
          if (includeOtp) resp.otp = otpRes.code;
          return res.json(resp);
        } catch (e) {
          console.warn('OTP send failed', e && e.message);
          const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
          await resetAttempts(`${tenantId}::${email}`);
          return res.json({ message: 'OTP send attempted', tempToken, sent: false });
        }
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

    // Passed password check: generate OTP and send via email
    try {
      const otpRes = await otpService.sendOtp(user.email, user._id || user.email);
      // issue a short-lived temp token for verifying OTP
      const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
      // record login attempt success (reset failures)
      await resetAttempts(lockKey);
      const includeOtp = process.env.DEV_INCLUDE_OTP === 'true' || otpRes.sent === false;
      const resp = { message: 'OTP sent', tempToken, sent: !!otpRes.sent };
      if (includeOtp) resp.otp = otpRes.code;
      return res.json(resp);
    } catch (e) {
      console.warn('OTP send failed', e && e.message);
      const tempToken = jwt.sign({ id: user._id, step: 'otp' }, process.env.SECRET || 'secret', { expiresIn: '10m' });
      await resetAttempts(lockKey);
      return res.json({ message: 'OTP send attempted', tempToken, sent: false });
    }
  });
});

// Verify OTP and return full auth token
router.post('/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body;
  if (!tempToken || !otp) return res.status(400).json({ message: 'tempToken and otp required' });

  try {
    const payload = jwt.verify(tempToken, process.env.SECRET || 'secret');
    if (!payload || payload.step !== 'otp') return res.status(401).json({ message: 'Invalid temp token' });

    const userId = payload.id;
    // fetch user by internal _id
    const sql = 'SELECT * FROM users WHERE _id = ? LIMIT 1';
    db.query(sql, [userId], async (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error', error: err.message });
      if (!results || results.length === 0) return res.status(404).json({ message: 'User not found' });
      const user = results[0];

      const ok = await otpService.verifyOtp(user._id || user.email, otp);
      if (!ok) return res.status(401).json({ message: 'Invalid or expired OTP' });

          // generate full access token using public_id if available (external random id)
          const tokenIdForJwt = user.public_id || String(user._id);
          // Make access token valid for 7 days
          const token = jwt.sign({ id: tokenIdForJwt }, process.env.SECRET || 'secret', { expiresIn: '7d' });

      // prefer modules stored on user record (JSON). If present, parse and normalize
      const crypto = require('crypto');
      function normalizeModulesFromUser(user) {
        if (!user) return null;
        const raw = user.modules;
        if (!raw) return null;
        let arr = null;
        try {
          arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) {
          return null;
        }
        if (!Array.isArray(arr) || arr.length === 0) return null;

        // normalize each entry to have `moduleId` (string), `name`, `access`
        const out = arr.map(m => {
          const name = m.name || m.module || '';
          const access = m.access || 'full';
          // accept `moduleId` or `id` or numeric `moduleId`
          let mid = m.moduleId || m.id || m.module_id || m.module || '';
          if (typeof mid === 'number') mid = String(mid);
          if (!mid) mid = crypto.randomBytes(8).toString('hex');
          return { moduleId: mid, name, access };
        }).filter(m => (m.name || '').toLowerCase() !== 'team & employees');

        return out;
      }

      function getModulesForRole(role) {
        // fallback role-based list — generate string moduleIds
        function mk(n, name, access) { return { moduleId: crypto.randomBytes(8).toString('hex'), name, access }; }
        if (role === 'Admin') return [
          mk(1,'User Management','full'),
          mk(2,'Dashboard','full'),
          mk(3,'Clients','full'),
          mk(4,'Departments','full'),
          mk(5,'Tasks','full'),
          mk(6,'Projects','full'),
          // Team & Employees intentionally omitted
          mk(8,'Workflow (Project & Task Flow)','full'),
          mk(9,'Notifications','full'),
          mk(10,'Reports & Analytics','full'),
          mk(11,'Document & File Management','full'),
          mk(12,'Settings & Master Configuration','full'),
          mk(13,'Chat / Real-Time Collaboration','full'),
          mk(14,'Approval Workflows','full')
        ];
        if (role === 'Manager') return [
          mk(2,'Dashboard','full'), mk(4,'Departments','full'), mk(5,'Tasks','full'), mk(6,'Projects','full'),
          mk(8,'Workflow (Project & Task Flow)','full'), mk(9,'Notifications','limited'), mk(10,'Reports & Analytics','full'),
          mk(11,'Document & File Management','limited'), mk(13,'Chat / Real-Time Collaboration','full'), mk(14,'Approval Workflows','limited')
        ];
        if (role === 'Employee') return [
          mk(2,'Dashboard','view'), mk(5,'Tasks','limited'), mk(9,'Notifications','limited'), mk(10,'Reports & Analytics','limited'),
          mk(11,'Document & File Management','limited'), mk(13,'Chat / Real-Time Collaboration','full')
        ];
        if (role === 'Client') return [
          mk(2,'Dashboard','view'), mk(6,'Projects','view'), mk(9,'Notifications','limited'), mk(10,'Reports & Analytics','limited'),
          mk(11,'Document & File Management','limited'), mk(13,'Chat / Real-Time Collaboration','limited')
        ];
        return [];
      }

      // Use stored modules if present and valid; otherwise fall back
      const storedModules = normalizeModulesFromUser(user);
      const modulesToReturn = storedModules && storedModules.length ? storedModules : getModulesForRole(user.role);

      // optional: log login history (best effort)
      try {
        const insert = 'INSERT INTO login_history (user_id, tenant_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
        const ip = req.ip || (req.connection && req.connection.remoteAddress);
        const ua = req.headers['user-agent'] || '';
        db.query(insert, [user._id, user.tenant_id || null, ip, ua, 1], () => {});
      } catch (e) {
        // ignore
      }

              // generate a refresh token (longer lived) and return it alongside access token
              const refreshToken = jwt.sign({ id: tokenIdForJwt, type: 'refresh' }, process.env.SECRET || 'secret', { expiresIn: '30d' });
              // return external id as `id` (public_id) for clients and return actual modules
              return res.json({ token, refreshToken, user: { id: user.public_id || String(user._id), email: user.email, name: user.name, role: user.role, modules: modulesToReturn } });
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
router.get('/profile', requireAuth, (req, res) => {
  const user = req.user;
  const safe = {
    id: user.public_id || user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenant_id: user.tenant_id
  };
  res.json({ user: safe });
});

router.put('/profile', requireAuth, (req, res) => {
  const user = req.user;
  const { name, title } = req.body;
  const sql = 'UPDATE users SET name = ?, title = ? WHERE _id = ?';
  db.query(sql, [name || user.name, title || user.title, user._id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    return res.json({ message: 'Profile updated' });
  });
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

module.exports = router;
