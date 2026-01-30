const HttpError = require('../errors/HttpError');
const env = require('../config/env');

function errorHandler(err, req, res, next) {
  if (!err) return next();
  // Normalize non-HttpError
  if (!(err instanceof HttpError)) {
    // If it's a plain object or Error, wrap as 500
    const wrapped = new HttpError(err.status || 500, err.message || 'Internal Server Error', err.code || 'INTERNAL_ERROR');
    if (env.NODE_ENV !== 'production') wrapped.details = err.stack || err;
    err = wrapped;
  }

  // Log the error (avoid leaking secrets)
  try {
    const logObj = { status: err.status, code: err.code, message: err.message };
    if (env.NODE_ENV !== 'production' && err.details) logObj.details = err.details;
    let logger;
    try { logger = require(global.__root + 'logger'); } catch (e) { try { logger = require('../../logger'); } catch (e2) { logger = console; } }
    if (logger && typeof logger.error === 'function') {
      logger.error(logObj);
    } else {
      logger.error(logObj);
    }
  } catch (e) { logger.error('Failed to log error', e && e.message); }

  const payload = {
    success: false,
    message: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR'
  };
  if (env.NODE_ENV !== 'production' && err.details) payload.details = err.details;

  if (!res.headersSent) {
    res.status(err.status || 500).json(payload);
  } else {
    next(err);
  }
}

module.exports = errorHandler;
