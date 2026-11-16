/**
 * errors/AppError.js
 * Domain error classes and asynchronous handler utility.
 * Standardizes API error shapes across the application.
 */

'use strict';

class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message safe for client presentation
   * @param {number} [status=500] - HTTP status code
   * @param {string} [code='INTERNAL_SERVER_ERROR'] - Machine-readable error code
   * @param {Array|Object} [details=null] - Optional structured validation or error details
   */
  constructor(message, status = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', retryAfter = 60) {
    super(message, 429, 'RATE_LIMITED');
    this.retryAfter = retryAfter;
  }
}

class UpstreamError extends AppError {
  constructor(message = 'Upstream service error', status = 502, code = 'UPSTREAM_ERROR') {
    super(message, status, code);
  }
}

/**
 * Wraps async route handlers so any unhandled promise rejections
 * are seamlessly forwarded to Express next() error handler.
 * @param {Function} fn
 * @returns {Function}
 */
function asyncHandler(fn) {
  return function asyncUtilWrap(req, res, next) {
    const fnReturn = fn(req, res, next);
    return Promise.resolve(fnReturn).catch(next);
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  NotFoundError,
  RateLimitError,
  UpstreamError,
  asyncHandler
};
