require('dotenv').config();
const Redis = require('ioredis');
const app = require('./src/app');
const port = process.env.PORT || 4000;
const logger = require('./logger');

async function start() {
  const requireRedis = process.env.REQUIRE_REDIS !== 'false';

  let redis;
  if (requireRedis) {
    if (!process.env.REDIS_URL) {
      console.error('REDIS_URL is required. Set REDIS_URL in your environment or .env file, or set REQUIRE_REDIS=false to skip.');
      process.exit(1);
    }

    try {
      redis = new Redis(process.env.REDIS_URL);
      // Attach an error handler to prevent unhandled exceptions
      redis.on('error', (err) => {
        console.warn('Redis error (index):', err && err.message);
      });
      await redis.ping();
      console.log('Connected to Redis');
    } catch (e) {
      console.error('Failed to connect to Redis:', e.message || e);
      process.exit(1);
    }
  } else {
    if (process.env.REDIS_URL) console.log('REQUIRE_REDIS is false — skipping Redis client creation (REDIS_URL present)');
    else console.log('REQUIRE_REDIS is false — skipping Redis connectivity check');
  }

  const server = app.listen(port, () => {
    const message = process.env.BASE_URL ? `Server is running on ${process.env.BASE_URL}` : `Server is running on port ${port}`;
    logger.info(message);
    console.log(message);
  });

  // keep process alive with redis client open
  process.on('SIGINT', async () => {
    try { if (redis) await redis.quit(); } catch (e) {}
    server.close(() => process.exit(0));
  });
}

start();
