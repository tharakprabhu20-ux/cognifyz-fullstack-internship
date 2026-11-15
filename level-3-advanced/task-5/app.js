/**
 * app.js
 * Configures and exports the Express application.
 * Note: This file does NOT call listen() to ensure it can be imported cleanly
 * by both the server entry point (server.js) and the test suite (tests/api.test.js).
 */

const path = require('path');
const express = require('express');
const taskRoutes = require('./routes/tasks');

const app = express();

// Enforce request body size limit to 10kb
app.use(express.json({ limit: '10kb' }));

// Middleware to catch malformed JSON syntax errors thrown by express.json()
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body'
      }
    });
  }
  return next(err);
});

// Middleware to enforce Content-Type: application/json on mutations with a body
app.use((req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const hasBody = req.headers['content-length'] && parseInt(req.headers['content-length'], 10) > 0;

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

// Serve static frontend files from public/
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// HTTP Method: GET
// Path: /api/health
// CRUD Operation: Read (System Health Check)
// Status Codes: 200 (OK)
// =========================================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Mount the tasks resource router
app.use('/api/tasks', taskRoutes);

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
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // In development, error details could be logged to server console
  // Stack traces are strictly hidden from the client response for security
  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal server error occurred'
    }
  });
});

module.exports = app;
