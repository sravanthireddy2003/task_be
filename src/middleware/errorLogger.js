const logger = require('../../logger');

/**
 * Express error-handling middleware to log uncaught exceptions or next(err) calls
 */
const errorLogger = (err, req, res, next) => {
    // If headers are already sent, delegate to Express default handler
    if (res.headersSent) {
        return next(err);
    }

    // Capture useful fields
    const userId = req.user ? req.user.id : null;
    const statusCode = err.status || 500;

    // Log the error
    // Winston handles err.stack nicely because we configured errors({ stack: true })
    logger.error(`Error processing request: ${err.message}`, {
        requestId: req.requestId,
        userId: userId,
        method: req.method,
        url: req.originalUrl,
        statusCode: statusCode,
        error: err
    });

    // Send a generic error response, mask stack trace to the user for security
    res.status(statusCode).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        requestId: req.requestId
    });
};

module.exports = errorLogger;
