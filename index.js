require('dotenv').config();
const Redis = require('ioredis');
const app = require('./src/app');
const env = require('./src/config/env');
const port = env.PORT || 4000;
const logger = require('./logger');

async function start() {
  const requireRedis = (process.env.REQUIRE_REDIS !== 'false') && !!env.REDIS_URL;

  let redis;
  if (requireRedis) {
    if (!env.REDIS_URL) {
      logger.error('REDIS_URL is required. Set REDIS_URL in your environment or .env file, or set REQUIRE_REDIS=false to skip.');
      process.exit(1);
    }

    try {
      redis = new Redis(env.REDIS_URL);
      // Attach an error handler to prevent unhandled exceptions
      redis.on('error', (err) => {
        logger.warn('Redis error (index):', err && err.message);
      });
      await redis.ping();
      logger.info('Connected to Redis');
    } catch (e) {
      logger.error('Failed to connect to Redis:', e.message || e);
      process.exit(1);
    }
  } else {
    if (process.env.REDIS_URL) logger.info('REQUIRE_REDIS is false — skipping Redis client creation (REDIS_URL present)');
    else logger.info('REQUIRE_REDIS is false — skipping Redis connectivity check');
  }

  const server = app.listen(port, () => {
    const message = `Server is running on ${env.BASE_URL}`;
    logger.info(message);
  });

  // keep process alive with redis client open
  process.on('SIGINT', async () => {
    try { if (redis) await redis.quit(); } catch (e) {}
    server.close(() => process.exit(0));
  });
}

start();
