/**
 * middleware/accessLogger.js
 * High-performance, security-focused access logger middleware.
 * Outputs one structured JSON line per request with:
 * time, requestId, method, path (stripped of query string), status, durationMs,
 * userId (if authenticated), and responseSize.
 *
 * Security Note:
 * NEVER logs headers, request/response bodies, cookies, tokens, passwords, or secrets.
 * URL query parameters are stripped to prevent credential leaks in query strings.
 */

'use strict';

/**
 * Creates access logger middleware with injectable options.
 * @param {Object} [options={}]
 * @param {string} [options.logLevel='info'] - Log level ('silent', 'info', etc.)
 * @param {Function} [options.clock=Date.now] - Clock function
 * @param {Function} [options.writeFn] - Optional destination writer (defaults to process.stdout.write)
 * @returns {import('express').RequestHandler}
 */
function createAccessLogger(options = {}) {
  const logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
  const clock = options.clock || (() => Date.now());
  const writeFn = options.writeFn || ((line) => process.stdout.write(line + '\n'));
  const isSilent = logLevel.toLowerCase() === 'silent';

  return function accessLogger(req, res, next) {
    const startTime = clock();

    // Hook res.writeHead to set X-Response-Time before headers are written
    const originalWriteHead = res.writeHead;
    res.writeHead = function (...args) {
      if (!res.headersSent) {
        const duration = Math.max(0, clock() - startTime);
        res.setHeader('X-Response-Time', `${duration}ms`);
      }
      return originalWriteHead.apply(this, args);
    };

    // Calculate response size and emit log on finish
    res.on('finish', () => {
      // Set X-Response-Time if headers were sent without writeHead hook invocation
      const durationMs = Math.max(0, clock() - startTime);

      if (isSilent) {
        return;
      }

      // Strictly extract the path without any query string values
      const fullUrl = req.originalUrl || req.url || '';
      const pathOnly = fullUrl.split('?')[0] || '/';

      // Read response size safely
      const contentLengthHeader = res.getHeader('content-length');
      let responseSize = 0;
      if (contentLengthHeader !== undefined && contentLengthHeader !== null) {
        responseSize = parseInt(contentLengthHeader, 10) || 0;
      }

      // Structure log payload - NO headers, NO bodies, NO query string values, NO secrets
      const logEntry = {
        time: new Date(startTime).toISOString(),
        requestId: req.id || req.headers['x-request-id'] || '',
        method: req.method,
        path: pathOnly,
        status: res.statusCode,
        durationMs,
        responseSize
      };

      // Safely attach authenticated user ID if present
      if (req.user && req.user.id) {
        logEntry.userId = String(req.user.id);
      }

      try {
        writeFn(JSON.stringify(logEntry));
      } catch {
        // Fallback guard to prevent logger error from bubbling
      }
    });

    return next();
  };
}

module.exports = createAccessLogger;
