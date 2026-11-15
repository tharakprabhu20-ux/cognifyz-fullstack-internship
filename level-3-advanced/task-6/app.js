/**
 * app.js
 * Configures and exports the Express application factory createApp().
 * Builds the app using dependency-injected stores and configuration.
 * Does NOT call listen() to ensure clean test isolation and decoupled execution.
 */

const path = require('path');
const express = require('express');
const createRequireAuth = require('./middleware/requireAuth');
const errorHandler = require('./middleware/errorHandler');
const createAuthRouter = require('./routes/auth');
const createTaskRouter = require('./routes/tasks');

/**
 * Creates and configures the Express application with injected stores.
 * @param {Object} options
 * @param {Object} options.taskStore - Task store implementation (memory or mongo)
 * @param {Object} options.userStore - User store implementation (memory or mongo)
 * @param {string} [options.jwtSecret] - JWT signing secret (defaults to env or test secret)
 * @returns {express.Application}
 */
function createApp({ taskStore, userStore, jwtSecret = process.env.JWT_SECRET || 'in-memory-test-jwt-secret-min-32-chars-long-secure-key' } = {}) {
  if (!taskStore) {
    throw new Error('createApp requires taskStore dependency');
  }
  if (!userStore) {
    throw new Error('createApp requires userStore dependency');
  }

  const app = express();

  // Middleware to enforce Content-Type: application/json on mutations with a body
  app.use((req, res, next) => {
    const isMutation = ['POST', 'PUT', 'PATCH'].includes(req.method);
    const hasBody = (req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0) || req.headers['transfer-encoding'];

    if (isMutation && hasBody) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        return res.status(415).json({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json'
          }
        });
      }
    }
    return next();
  });

  // Enforce request body size limit to 10kb
  app.use(express.json({ limit: '10kb' }));

  // Middleware to catch malformed JSON syntax errors or payload too large thrown by express.json()
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Malformed JSON payload in request body'
        }
      });
    }
    if (err.type === 'entity.too.large' || err.status === 413) {
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds the 10kb limit'
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
  // Auth Requirement: Public
  // Status Codes: 200 (OK)
  // =========================================================================
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Wire auth middleware
  const requireAuth = createRequireAuth({ jwtSecret, userStore });

  // Mount auth and tasks routers
  app.use('/api/auth', createAuthRouter({ userStore, jwtSecret, requireAuth }));
  app.use('/api/tasks', createTaskRouter({ taskStore, requireAuth }));

  // Catch-all 404 handler for undefined /api routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl}`
      }
    });
  });

  // Central error-handling middleware (never leaks stack traces to the client)
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
