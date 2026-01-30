const Joi = require('joi');
require('dotenv').config();

let logger = console;
try { logger = require('../../logger'); } catch (e) { /* safe fallback to console */ }

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().default(4000),

  // Database (MySQL)
  DB_HOST: Joi.string().optional().allow('', null),
  DB_PORT: Joi.alternatives().try(Joi.number().port(), Joi.string()).optional().allow('', null),
  DB_USER: Joi.string().optional().allow('', null),
  DB_PASSWORD: Joi.string().optional().allow('', null),
  DB_NAME: Joi.string().optional().allow('', null),

  // JWT
  JWT_SECRET: Joi.string().min(8).optional().allow('', null),
  JWT_EXPIRES_IN: Joi.string().optional().default('7d'),

  // Email
  SMTP_HOST: Joi.string().optional().allow('', null),
  SMTP_PORT: Joi.number().optional().allow('', null),
  SMTP_USER: Joi.string().optional().allow('', null),
  SMTP_PASS: Joi.string().optional().allow('', null),

  // Uploads
  MAX_FILE_SIZE: Joi.number().optional().default(25 * 1024 * 1024),
  UPLOAD_PATH: Joi.string().optional().default('uploads'),

  // Redis
  REDIS_URL: Joi.string().uri().optional().allow('', null),
  FRONTEND_URL: Joi.string().uri().optional().allow('', null),
  BASE_URL: Joi.string().uri().optional().allow('', null),
}).unknown(true);

const { error, value: rawEnv } = schema.validate(process.env, { abortEarly: false });
if (error) {
  logger.error('Environment validation error:', error.details.map(d => d.message).join(', '));
  throw new Error('Invalid environment configuration');
}

// Normalize and provide backward-compatible keys
const env = {
  NODE_ENV: rawEnv.NODE_ENV,
  PORT: Number(rawEnv.PORT) || 4000,

  DB_HOST: rawEnv.DB_HOST || rawEnv.MYSQL_HOST || '127.0.0.1',
  DB_PORT: rawEnv.DB_PORT || rawEnv.MYSQL_PORT || 3306,
  DB_USER: rawEnv.DB_USER || rawEnv.MYSQL_USER || 'root',
  DB_PASSWORD: rawEnv.DB_PASSWORD || rawEnv.MYSQL_PASS || '',
  DB_NAME: rawEnv.DB_NAME || rawEnv.MYSQL_DB || 'market_task_db',

  JWT_SECRET: rawEnv.JWT_SECRET || rawEnv.SECRET || '',
  JWT_EXPIRES_IN: rawEnv.JWT_EXPIRES_IN || rawEnv.ACCESS_TOKEN_EXPIRES_IN || '7d',

  SMTP_HOST: rawEnv.SMTP_HOST || '',
  SMTP_PORT: rawEnv.SMTP_PORT || 587,
  SMTP_USER: rawEnv.SMTP_USER || '',
  SMTP_PASS: rawEnv.SMTP_PASS || '',

  MAX_FILE_SIZE: Number(rawEnv.MAX_FILE_SIZE || rawEnv.MAX_UPLOAD_SIZE || 25 * 1024 * 1024),
  UPLOAD_PATH: rawEnv.UPLOAD_PATH || 'uploads',

  REDIS_URL: rawEnv.REDIS_URL || null,
  // Public-facing frontend URL (used to construct links sent by the backend)
  FRONTEND_URL: rawEnv.FRONTEND_URL || rawEnv.FRONTEND || '',
  // Base URL for this backend service (used in emails/logs)
  BASE_URL: rawEnv.BASE_URL || null,
};

// Production requirements
if (env.NODE_ENV === 'production') {
  if (!env.DB_HOST || !env.DB_USER || !env.DB_NAME) {
    logger.error('Environment validation error: DB_HOST, DB_USER and DB_NAME are required in production');
    throw new Error('Invalid environment configuration: missing DB config');
  }
  if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 32) {
    logger.error('Environment validation error: JWT_SECRET must be at least 32 characters in production');
    throw new Error('Invalid environment configuration: weak JWT_SECRET');
  }
}

if (env.NODE_ENV !== 'production') {
    if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 8) {
    const crypto = require('crypto');
    const gen = crypto.randomBytes(32).toString('hex');
    logger.warn('No JWT_SECRET provided or too short for development — generating a temporary secret. Do NOT use in production.');
    env.JWT_SECRET = gen;
  }
}

// Provide sensible defaults for URLs when not explicitly set
if (!env.BASE_URL) {
  const host = process.env.HOST || 'localhost';
  env.BASE_URL = (env.NODE_ENV === 'production' ? `https://${host}` : `http://${host}:${env.PORT}`);
}

if (!env.FRONTEND_URL) {
  env.FRONTEND_URL = (env.NODE_ENV === 'production' ? env.FRONTEND_URL || '' : (process.env.FRONTEND_URL || `http://localhost:3000`));
}

module.exports = env;
