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

      // generate full access token
      const token = jwt.sign({ id: user._id }, process.env.SECRET || 'secret', { expiresIn: '8h' });

      // attach modules list based on role
      function getModulesForRole(role) {
        const admin = [
          { moduleId: 1, name: 'User Management', access: 'full' },
          { moduleId: 2, name: 'Dashboard', access: 'full' },
          { moduleId: 3, name: 'Clients', access: 'full' },
          { moduleId: 4, name: 'Departments', access: 'full' },
          { moduleId: 5, name: 'Tasks', access: 'full' },
          { moduleId: 6, name: 'Projects', access: 'full' },
          { moduleId: 7, name: 'Team & Employees', access: 'full' },
          { moduleId: 8, name: 'Workflow (Project & Task Flow)', access: 'full' },
          { moduleId: 9, name: 'Notifications', access: 'full' },
          { moduleId: 10, name: 'Reports & Analytics', access: 'full' },
          { moduleId: 11, name: 'Document & File Management', access: 'full' },
          { moduleId: 12, name: 'Settings & Master Configuration', access: 'full' },
          { moduleId: 13, name: 'Chat / Real-Time Collaboration', access: 'full' },
          { moduleId: 14, name: 'Approval Workflows', access: 'full' }
        ];

        const manager = [
          { moduleId: 2, name: 'Dashboard', access: 'full' },
          { moduleId: 4, name: 'Departments', access: 'full' },
          { moduleId: 5, name: 'Tasks', access: 'full' },
          { moduleId: 6, name: 'Projects', access: 'full' },
          { moduleId: 7, name: 'Team & Employees', access: 'full' },
          { moduleId: 8, name: 'Workflow (Project & Task Flow)', access: 'full' },
          { moduleId: 9, name: 'Notifications', access: 'limited' },
          { moduleId: 10, name: 'Reports & Analytics', access: 'full' },
          { moduleId: 11, name: 'Document & File Management', access: 'limited' },
          { moduleId: 13, name: 'Chat / Real-Time Collaboration', access: 'full' },
          { moduleId: 14, name: 'Approval Workflows', access: 'limited' }
        ];

        const employee = [
          { moduleId: 2, name: 'Dashboard', access: 'view' },
          { moduleId: 5, name: 'Tasks', access: 'limited' },
          { moduleId: 7, name: 'Team & Employees', access: 'view' },
          { moduleId: 9, name: 'Notifications', access: 'limited' },
          { moduleId: 10, name: 'Reports & Analytics', access: 'limited' },
          { moduleId: 11, name: 'Document & File Management', access: 'limited' },
          { moduleId: 13, name: 'Chat / Real-Time Collaboration', access: 'full' }
        ];

        const client = [
          { moduleId: 2, name: 'Dashboard', access: 'view' },
          { moduleId: 6, name: 'Projects', access: 'view' },
          { moduleId: 7, name: 'Team & Employees', access: 'view' },
          { moduleId: 9, name: 'Notifications', access: 'limited' },
          { moduleId: 10, name: 'Reports & Analytics', access: 'limited' },
          { moduleId: 11, name: 'Document & File Management', access: 'limited' },
          { moduleId: 13, name: 'Chat / Real-Time Collaboration', access: 'limited' }
        ];

        if (role === 'Admin') return admin;
        if (role === 'Manager') return manager;
        if (role === 'Employee') return employee;
        if (role === 'Client') return client;
        return [];
      }

      // optional: log login history (best effort)
      try {
        const insert = 'INSERT INTO login_history (user_id, tenant_id, ip, user_agent, success, created_at) VALUES (?, ?, ?, ?, ?, NOW())';
        const ip = req.ip || (req.connection && req.connection.remoteAddress);
        const ua = req.headers['user-agent'] || '';
        db.query(insert, [user._id, user.tenant_id || null, ip, ua, 1], () => {});
      } catch (e) {
        // ignore
      }

      return res.json({ token, user: { id: user._id, email: user.email, name: user.name, role: user.role, modules: getModulesForRole(user.role) } });
    });
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired temp token', error: e.message });
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

// Reset password using OTP; infer tenant by email if header missing
router.post('/reset-password', (req, res) => {
  const { email, otp, newPassword } = req.body;
  let tenantId = req.headers['x-tenant-id'] || req.body && req.body.tenantId || req.query && req.query.tenantId;
  if (!email || !otp || !newPassword) return res.status(400).json({ message: 'email, otp and newPassword required' });

  const handleResetForUser = async (user) => {
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

// Profile endpoints
router.get('/profile', requireAuth, (req, res) => {
  const user = req.user;
  const safe = {
    id: user._id,
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
