/**
 * middleware/errorHandler.js
 * Centralized error-handling middleware.
 * Formats errors to the standard JSON structure { error: { code, message, details? } }
 * and strictly prevents stack trace or credential leakage.
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Handle request payload exceeding size limit (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the 10kb limit'
      }
    });
  }
  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A resource with that unique value already exists'
      }
    });
  }

  // Handle Mongoose CastError (e.g., malformed ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid format for field: ${err.path}`
      }
    });
  }

  // Handle Mongoose Schema ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.keys(err.errors || {}).map(field => ({
      field,
      message: err.errors[field].message
    }));
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database schema validation failed',
        details
      }
    });
  }

  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const code = err.code && typeof err.code === 'string' ? err.code : (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = status === 500 ? 'An unexpected internal server error occurred' : (err.message || 'An error occurred');

  return res.status(status).json({
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {})
    }
  });
}

module.exports = errorHandler;
