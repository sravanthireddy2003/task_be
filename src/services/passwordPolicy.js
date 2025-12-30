const zxcvbn = require('zxcvbn');
const bcrypt = require('bcryptjs');
const Redis = require('ioredis');
require('dotenv').config();

const requireRedis = process.env.REQUIRE_REDIS !== 'false';
let redis = null;
if (requireRedis && process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => {
      console.warn('Redis error (passwordPolicy):', err && err.message);
    });
  } catch (e) {
    console.warn('Failed to initialize Redis client (passwordPolicy):', e && e.message);
    redis = null;
  }
} else {
  if (process.env.REDIS_URL) console.log('REQUIRE_REDIS is false — passwordPolicy skipping Redis client creation');
}

// Basic password policy validator
function validatePassword(password) {
  if (!password || typeof password !== 'string') return { valid: false, reason: 'Password required' };
  if (password.length < 10) return { valid: false, reason: 'Password must be at least 10 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must include an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'Password must include a lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must include a digit' };
  if (!/[!@#\$%\^&\*]/.test(password)) return { valid: false, reason: 'Password must include a special character (!@#$%^&*)' };

  // optional: strength estimation
  try {
    const score = zxcvbn(password).score; // 0..4
    if (score < 2) return { valid: false, reason: 'Password too weak' };
  } catch (e) {
    // zxcvbn may not be available; ignore
  }

  return { valid: true };
}

// Check recent passwords stored in DB. Will read last N entries from password_history and compare hashes.
async function isPasswordReused(db, userId, newPassword, limit = 5) {
  if (!db) return false;

  // Try to use Redis cache for recent password hashes (optional)
  const cacheKey = `pwdhist:${String(userId)}`;
  let rows = null;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        rows = JSON.parse(cached);
      }
    } catch (e) {
      // ignore cache errors
    }
  }

  if (!rows) {
    // db.query is callback-based, wrap in Promise
    rows = await new Promise((resolve, reject) => {
      const q = 'SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY changed_at DESC LIMIT ?';
      db.query(q, [userId, limit], (err, results) => {
        if (err) return reject(err);
        resolve(results || []);
      });
    }).catch((e) => { return []; });

    if (redis && Array.isArray(rows)) {
      try {
        await redis.set(cacheKey, JSON.stringify(rows), 'EX', 60 * 5); // cache 5 minutes
      } catch (e) {}
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) return false;

  for (const r of rows) {
    try {
      if (await bcrypt.compare(newPassword, r.password_hash)) return true;
    } catch (e) {
      // ignore compare errors
    }
  }

  return false;
}

module.exports = { validatePassword, isPasswordReused };
