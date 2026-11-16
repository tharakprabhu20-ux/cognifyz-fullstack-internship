/**
 * middleware/rateLimiters.js
 * Application rate limiting middleware configured with express-rate-limit.
 * Emits standard draft-6 RateLimit headers, suppresses legacy headers,
 * formats 429 responses into standard JSON error shape, and provides injection hooks for tests.
 */

'use strict';

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Standard 429 response handler conforming to the API error contract.
 */
function rateLimitErrorHandler(req, res, next, options) {
  const requestId = req.id || req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  if (!res.getHeader('Retry-After')) {
    const resetTime = req.rateLimit?.resetTime;
    const windowMs = options.windowMs || 60000;
    const resetSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(windowMs / 1000);
    res.setHeader('Retry-After', String(resetSeconds));
  }

  return res.status(options.statusCode || 429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
      requestId
    }
  });
}

/**
 * Creates and configures rate limiting middleware instances.
 * @param {Object} [overrides={}] - Optional rate limit overrides for testing
 * @returns {Object} Rate limiting middlewares
 */
function createRateLimiters(overrides = {}) {
  // 1. General API Limiter: 100 requests per 15 min per IP (/api/health exempt)
  const generalLimiter = rateLimit({
    windowMs: overrides.generalWindowMs !== undefined ? overrides.generalWindowMs : 15 * 60 * 1000,
    limit: overrides.generalLimit !== undefined ? overrides.generalLimit : 100,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: rateLimitErrorHandler,
    skip: (req) => {
      const url = req.originalUrl || req.url;
      return url === '/api/health' || url.startsWith('/api/health');
    },
    ...(overrides.keyGenerator ? { keyGenerator: overrides.keyGenerator } : {}),
    ...(overrides.generalStore ? { store: overrides.generalStore } : {})
  });

  // 2. Login Limiter: 10 requests per 15 min per IP, counting ONLY failed attempts
  const loginLimiter = rateLimit({
    windowMs: overrides.loginWindowMs !== undefined ? overrides.loginWindowMs : 15 * 60 * 1000,
    limit: overrides.loginLimit !== undefined ? overrides.loginLimit : 10,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: rateLimitErrorHandler,
    ...(overrides.keyGenerator ? { keyGenerator: overrides.keyGenerator } : {}),
    ...(overrides.loginStore ? { store: overrides.loginStore } : {})
  });

  // 3. Register Limiter: 5 requests per hour per IP
  const registerLimiter = rateLimit({
    windowMs: overrides.registerWindowMs !== undefined ? overrides.registerWindowMs : 60 * 60 * 1000,
    limit: overrides.registerLimit !== undefined ? overrides.registerLimit : 5,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: rateLimitErrorHandler,
    ...(overrides.keyGenerator ? { keyGenerator: overrides.keyGenerator } : {}),
    ...(overrides.registerStore ? { store: overrides.registerStore } : {})
  });

  // 4. OAuth Exchange Limiter: 10 requests per minute per IP
  const oauthExchangeLimiter = rateLimit({
    windowMs: overrides.oauthWindowMs !== undefined ? overrides.oauthWindowMs : 60 * 1000,
    limit: overrides.oauthExchangeLimit !== undefined ? overrides.oauthExchangeLimit : 10,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: rateLimitErrorHandler,
    ...(overrides.keyGenerator ? { keyGenerator: overrides.keyGenerator } : {}),
    ...(overrides.oauthStore ? { store: overrides.oauthStore } : {})
  });

  // 5. Weather Limiter: 20 requests per minute keyed by authenticated User ID (with IPv6-safe fallback)
  const weatherLimiter = rateLimit({
    windowMs: overrides.weatherWindowMs !== undefined ? overrides.weatherWindowMs : 60 * 1000,
    limit: overrides.weatherLimit !== undefined ? overrides.weatherLimit : 20,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: rateLimitErrorHandler,
    keyGenerator: overrides.weatherKeyGenerator || ((req) => {
      if (req.user && req.user.id) {
        return `user_${req.user.id}`;
      }
      return ipKeyGenerator(req.ip);
    }),
    ...(overrides.weatherStore ? { store: overrides.weatherStore } : {})
  });

  return {
    general: generalLimiter,
    login: loginLimiter,
    register: registerLimiter,
    oauthExchange: oauthExchangeLimiter,
    weather: weatherLimiter
  };
}

module.exports = {
  createRateLimiters,
  rateLimitErrorHandler,
  ipKeyGenerator
};
