/**
 * middleware/errorHandler.js
 * Centralized error-handling middleware.
 * Formats errors to the standard JSON structure:
 * { error: { code, message, requestId, details? } }
 * Strictly prevents stack trace or credential leakage.
 */

'use strict';

const crypto = require('crypto');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.id || req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  // Handle request payload exceeding size limit (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the 10kb limit',
        requestId
      }
    });
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'A resource with that unique value already exists',
        requestId
      }
    });
  }

  // Handle Mongoose CastError (e.g., malformed ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid format for field: ${err.path}`,
        requestId
      }
    });
  }

  // Handle Mongoose Schema ValidationError
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.keys(err.errors || {}).map(field => ({
      field,
      message: err.errors[field].message
    }));
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database schema validation failed',
        details,
        requestId
      }
    });
  }

  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isInternal = status === 500;
  const code = err.code && typeof err.code === 'string' ? err.code : (isInternal ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = isInternal ? 'An unexpected internal server error occurred' : (err.message || 'An error occurred');

  const errorBody = {
    code,
    message,
    requestId
  };

  if (err.details) {
    errorBody.details = err.details;
  }

  return res.status(status).json({
    error: errorBody
  });
}

module.exports = errorHandler;
