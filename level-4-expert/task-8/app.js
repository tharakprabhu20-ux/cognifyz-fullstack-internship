/**
 * app.js
 * Configures and exports the Express application factory createApp().
 * Builds the app using dependency-injected stores, HTTP clients, caches, job queues, and configurations.
 * Does NOT call listen() to ensure clean test isolation and decoupled execution.
 *
 * Middleware Pipeline Order:
 * 1. Request ID (reuse or generate, echo header)
 * 2. Access Logger (structured JSON logging, response time header, no sensitive data)
 * 3. Security Headers (helmet with strict CSP, remove X-Powered-By)
 * 4. Body Parsing with limits and content-type checks (10kb JSON limit, 415/413 error handlers)
 * 5. Rate Limiters (general API limiter and endpoint-specific limiters)
 * 6. Application Routes (static assets, health check, auth, tasks, jobs, notifications, external)
 * 7. 404 Catch-All Handler (JSON error response for unmapped /api routes)
 * 8. Central Error Handler (safe JSON error output without leaking internals or stack traces)
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');

const createAccessLogger = require('./middleware/accessLogger');
const createRequireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const { createRateLimiters } = require('./middleware/rateLimiters');

const createAuthRouter = require('./routes/auth');
const createOAuthRouter = require('./routes/oauth');
const createTaskRouter = require('./routes/tasks');
const createJobRouter = require('./routes/jobs');
const createNotificationsRouter = require('./routes/notifications');
const createExternalRouter = require('./routes/external');

const { OAuthCodeStore } = require('./services/githubOAuth');
const { createCache } = require('./cache');
const { JobQueue } = require('./jobs/JobQueue');
const { createExportJobHandler } = require('./jobs/exportJob');
const ReminderScheduler = require('./jobs/reminderScheduler');

/**
 * Creates and configures the Express application with injected stores and services.
 * @param {Object} options
 * @param {Object} options.taskStore - Task store implementation (memory or mongo)
 * @param {Object} options.userStore - User store implementation (memory or mongo)
 * @param {string} [options.jwtSecret] - JWT signing secret
 * @param {Object} [options.oauthConfig] - { clientId, clientSecret, baseUrl }
 * @param {Function} [options.fetchImpl] - Injectable fetch implementation
 * @param {Object} [options.rateLimitOptions] - Overrides for rate limit thresholds
 * @param {string} [options.defaultCity] - Default city for weather queries
 * @param {Function} [options.clock] - Clock function for time-based testing
 * @param {number} [options.oauthCodeTtlMs] - TTL for one-time OAuth codes
 * @param {Object} [options.cache] - Cache implementation (MemoryCache or RedisCache)
 * @param {Object} [options.jobQueue] - Background JobQueue instance
 * @param {Object} [options.reminderScheduler] - Periodic reminder scanner instance
 * @param {string} [options.logLevel] - Log level for access logger ('silent', 'info', etc.)
 * @param {Object} [options.loggerOptions] - Additional logger configuration
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
  oauthCodeTtlMs = 60 * 1000,
  cache = null,
  enableCache = false,
  jobQueue = null,
  reminderScheduler = null,
  detailedHealth = false,
  logLevel = process.env.LOG_LEVEL || (process.argv[1]?.includes('test') || process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  loggerOptions = {}
} = {}) {
  if (!taskStore) {
    throw new Error('createApp requires taskStore dependency');
  }
  if (!userStore) {
    throw new Error('createApp requires userStore dependency');
  }

  const app = express();

  // Instantiate or attach cache provider if explicitly provided or enabled
  const effectiveCache = cache || (enableCache ? createCache({ clock }) : null);

  // Instantiate or attach background job queue
  const effectiveJobQueue = jobQueue || new JobQueue({ clock });
  if (!effectiveJobQueue.handlers.has('export-tasks')) {
    effectiveJobQueue.define('export-tasks', createExportJobHandler(taskStore));
  }

  // Determine whether detailed health check is returned (Task 8 requirement)
  const isDetailedHealth = detailedHealth || effectiveCache !== null;

  // Instantiate or attach reminder scheduler
  const effectiveReminderScheduler = reminderScheduler || new ReminderScheduler({
    taskStore,
    jobQueue: effectiveJobQueue,
    clock,
    enabled: false // disabled by default in tests and explicit opt-in
  });

  // Attach services to app instance for lifecycle management and testing
  app.locals.cache = effectiveCache;
  app.locals.jobQueue = effectiveJobQueue;
  app.locals.reminderScheduler = effectiveReminderScheduler;
  app.cache = effectiveCache;
  app.jobQueue = effectiveJobQueue;
  app.reminderScheduler = effectiveReminderScheduler;

  // Configure 'trust proxy' only when explicitly configured via TRUST_PROXY environment variable.
  // Security Note: Blindly trusting proxy headers allows IP spoofing to bypass IP-based rate limiting.
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv) {
    app.set('trust proxy', trustProxyEnv === 'true' ? true : trustProxyEnv);
  } else {
    app.set('trust proxy', false);
  }

  // =========================================================================
  // Step 1: Request ID Middleware
  // Reuses existing X-Request-Id or generates a new cryptographically random UUID.
  // Sets X-Request-Id on response and attaches req.id for downstream tracking.
  // =========================================================================
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  });

  // =========================================================================
  // Step 2: Access Logger Middleware
  // Outputs structured single-line JSON logs with execution time, method, path,
  // response status, durationMs, safe userId, and response size.
  // Sets X-Response-Time header and strictly prevents logging sensitive secrets/tokens.
  // =========================================================================
  const accessLogger = createAccessLogger({
    logLevel,
    clock,
    ...loggerOptions
  });
  app.use(accessLogger);

  // =========================================================================
  // Step 3: Security Headers Middleware (Helmet)
  // Enforces strict Content-Security-Policy (CSP) matching the application layout:
  // default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  // connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'.
  // Completely removes X-Powered-By to prevent framework fingerprinting.
  // =========================================================================
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"]
      }
    }
  }));

  // =========================================================================
  // Step 4: Body Parsing Middleware with Strict Limits & Content-Type Checks
  // Enforces Content-Type: application/json on mutations with a body.
  // Sets payload size cap at 10kb and intercepts parsing errors with standard JSON error shapes.
  // =========================================================================
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

  // =========================================================================
  // Step 5: Rate Limiting Middleware (Task 7)
  // Constructs rate limiters with injected options or safe defaults.
  // Applies general rate limiter to /api routes (/api/health is exempt inside limiter).
  // =========================================================================
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
  app.use('/api', rateLimiters.general);

  // =========================================================================
  // Step 6: Application Routes
  // Serves frontend static assets, system health check, auth, tasks, background
  // jobs, notifications, and external third-party integrations.
  // =========================================================================

  // Serve static frontend files from public/
  app.use(express.static(path.join(__dirname, 'public')));

  // HTTP Method: GET
  // Path: /api/health
  // Operation: Read (System Health, Uptime, Job Queue & Cache Metrics)
  // Auth Requirement: Public (Exempt from general rate limit)
  // Status Codes: 200 (OK)
  app.get('/api/health', (req, res) => {
    if (isDetailedHealth || req.query.detailed === 'true' || req.query.details === 'true') {
      const qStats = effectiveJobQueue ? effectiveJobQueue.getStats() : { queued: 0, running: 0 };
      const cStats = effectiveCache ? effectiveCache.stats() : { hits: 0, misses: 0 };

      return res.status(200).json({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        queue: {
          queued: qStats.queued,
          running: qStats.running
        },
        cache: {
          hits: cStats.hits,
          misses: cStats.misses
        }
      });
    }

    return res.status(200).json({ status: 'ok' });
  });

  // Wire auth middleware
  const requireAuth = createRequireAuth({ jwtSecret, userStore });

  // Initialize one-time OAuth exchange code store
  const codeStore = new OAuthCodeStore({ defaultTtlMs: oauthCodeTtlMs, clock });

  // Mount API routers
  app.use('/api/auth', createAuthRouter({ userStore, jwtSecret, requireAuth, rateLimiters }));
  app.use('/api/auth', createOAuthRouter({ oauthConfig, userStore, jwtSecret, codeStore, fetchImpl, rateLimiters }));
  app.use('/api/tasks', createTaskRouter({ taskStore, requireAuth, cache: effectiveCache, jobQueue: effectiveJobQueue }));
  app.use('/api/jobs', createJobRouter({ jobQueue: effectiveJobQueue, requireAuth }));
  app.use('/api/notifications', createNotificationsRouter({ reminderScheduler: effectiveReminderScheduler, requireAuth }));
  app.use('/api/external', createExternalRouter({
    requireAuth,
    rateLimiters,
    defaultCity,
    fetchImpl,
    cache: effectiveCache
  }));

  // Optional test hook for injecting boundary condition routes before catch-all
  if (typeof rateLimitOptions?.testRoutes === 'function') {
    rateLimitOptions.testRoutes(app);
  }

  // =========================================================================
  // Step 7: 404 Catch-All Handler
  // Standardized JSON response for any unhandled /api/* paths.
  // =========================================================================
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        requestId: req.id
      }
    });
  });

  // =========================================================================
  // Step 8: Centralized Error Handler
  // Catches all thrown and unhandled exceptions across the application pipeline.
  // Never leaks stack traces or credentials to clients.
  // =========================================================================
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
