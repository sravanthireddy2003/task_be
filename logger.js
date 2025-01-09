const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, json } = format;

const logFormat = printf(({ level, message, timestamp }) => {
  return JSON.stringify({ timestamp, level, message });
});

const logger = createLogger({
  level: 'info', 
  format: combine(
    timestamp(), 
    logFormat  
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/activity.log' })
  ]
});

// if (process.env.NODE_ENV !== 'production') {
//   logger.add(new transports.Console({
//     format: combine(
//       timestamp(),
//       json()
//     )
//   }));
// }

module.exports = logger;
