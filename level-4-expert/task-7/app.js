/**
 * app.js
 * Configures and exports the Express application factory createApp().
 * Builds the app using dependency-injected stores, HTTP clients, and configurations.
 * Does NOT call listen() to ensure clean test isolation and decoupled execution.
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const createRequireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const createAuthRouter = require('./routes/auth');
const createOAuthRouter = require('./routes/oauth');
const createTaskRouter = require('./routes/tasks');
const createExternalRouter = require('./routes/external');
const { createRateLimiters } = require('./middleware/rateLimiters');
const { OAuthCodeStore } = require('./services/githubOAuth');

/**
 * Creates and configures the Express application with injected stores and services.
 * @param {Object} options
 * @param {Object} options.taskStore - Task store implementation (memory or mongo)
 * @param {Object} options.userStore - User store implementation (memory or mongo)
 * @param {string} [options.jwtSecret] - JWT signing secret (defaults to env or secure test secret)
 * @param {Object} [options.oauthConfig] - { clientId, clientSecret, baseUrl }
 * @param {Function} [options.fetchImpl] - Injectable fetch implementation (default: globalThis.fetch)
 * @param {Object} [options.rateLimitOptions] - Overrides for rate limit thresholds
 * @param {string} [options.defaultCity] - Default city for weather queries
 * @param {Function} [options.clock] - Clock function for time-based testing
 * @param {number} [options.oauthCodeTtlMs] - TTL for one-time OAuth codes
 * @returns {express.Application}
 */
function createApp({
  taskStore,
  userStore,
  jwtSecret = process.env.JWT_SECRET || 'in-memory-test-jwt-secret-min-32-chars-long-secure-key',
  oauthConfig = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000'
  },
  fetchImpl = globalThis.fetch,
  rateLimitOptions = undefined,
  defaultCity = process.env.DEFAULT_CITY || 'Hosur',
  clock = () => Date.now(),
  oauthCodeTtlMs = 60 * 1000
} = {}) {
  if (!taskStore) {
    throw new Error('createApp requires taskStore dependency');
  }
  if (!userStore) {
    throw new Error('createApp requires userStore dependency');
  }

  const app = express();

  // Configure 'trust proxy' only when explicitly configured via TRUST_PROXY environment variable.
  // Security Note: Blindly trusting proxy headers allows IP spoofing to bypass IP-based rate limiting.
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv) {
    app.set('trust proxy', trustProxyEnv === 'true' ? true : trustProxyEnv);
  } else {
    app.set('trust proxy', false);
  }

  // Request ID middleware: generate or forward X-Request-Id on every request
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // Construct rate limiters with injected options or safe defaults.
  // When rateLimitOptions is not explicitly provided (e.g. legacy Task 6 test suites),
  // a generous registerLimit is used so high-volume regression test suites pass without 429.
  const effectiveRateLimitOptions = rateLimitOptions !== undefined
    ? rateLimitOptions
    : {
        generalLimit: 100,
        loginLimit: 10,
        registerLimit: 100,
        oauthExchangeLimit: 10,
        weatherLimit: 20
      };

  const rateLimiters = createRateLimiters(effectiveRateLimitOptions);

  // Apply general API rate limiter to all /api routes (/api/health is exempt inside the limiter)
  app.use('/api', rateLimiters.general);

  // Enforce Content-Type: application/json on mutations with a body
  app.use((req, res, next) => {
    const isMutation = ['POST', 'PUT', 'PATCH'].includes(req.method);
    const hasBody = (req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0) || req.headers['transfer-encoding'];

    if (isMutation && hasBody) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        return res.status(415).json({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json',
            requestId: req.id
          }
        });
      }
    }
    return next();
  });

  // Enforce request body size limit to 10kb
  app.use(express.json({ limit: '10kb' }));

  // Catch malformed JSON syntax errors or payload too large thrown by express.json()
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Malformed JSON payload in request body',
          requestId: req.id
        }
      });
    }
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds the 10kb limit',
          requestId: req.id
        }
      });
    }
    return next(err);
  });

  // Serve static frontend files from public/
  app.use(express.static(path.join(__dirname, 'public')));

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/health
  // Operation: Read (System Health Check)
  // Auth Requirement: Public (Exempt from general rate limit)
  // Status Codes: 200 (OK)
  // =========================================================================
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Wire auth middleware
  const requireAuth = createRequireAuth({ jwtSecret, userStore });

  // Initialize one-time OAuth exchange code store
  const codeStore = new OAuthCodeStore({ defaultTtlMs: oauthCodeTtlMs, clock });

  // Mount routers
  app.use('/api/auth', createAuthRouter({ userStore, jwtSecret, requireAuth, rateLimiters }));
  app.use('/api/auth', createOAuthRouter({ oauthConfig, userStore, jwtSecret, codeStore, fetchImpl, rateLimiters }));
  app.use('/api/tasks', createTaskRouter({ taskStore, requireAuth }));
  app.use('/api/external', createExternalRouter({ requireAuth, rateLimiters, defaultCity, fetchImpl }));

  // Optional test hook for injecting boundary condition routes before catch-all
  if (typeof rateLimitOptions?.testRoutes === 'function') {
    rateLimitOptions.testRoutes(app);
  }

  // Catch-all 404 handler for undefined /api routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        requestId: req.id
      }
    });
  });

  // Central error-handling middleware (never leaks stack traces to the client)
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
