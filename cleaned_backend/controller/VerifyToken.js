const jwt = require('jsonwebtoken');
require('dotenv').config();

function verifyToken(req, res, next) {
  const token = req.headers['x-access-token'] || req.headers['authorization'];
  if (!token) return res.status(403).json({ auth: false, message: 'No token provided.' });
  const secret = process.env.SECRET || process.env.JWT_SECRET || 'change_this_secret';
  try {
    const payload = jwt.verify(token.replace(/^Bearer\s+/i, ''), secret);
    req.loginId = payload.id || payload.userId || null;
    req.user = payload.user || req.user;
    next();
  } catch (e) {
    return res.status(401).json({ auth: false, message: 'Failed to authenticate token.' });
  }
}

module.exports = verifyToken;
