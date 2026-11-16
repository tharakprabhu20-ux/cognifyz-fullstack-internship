/**
 * lifecycle/shutdown.js
 * Centralized graceful shutdown coordinator.
 * Handles termination signals (SIGINT, SIGTERM) cleanly:
 * 1. Stops accepting incoming HTTP connections.
 * 2. Stops periodic reminder timers.
 * 3. Drains in-flight background queue tasks within a bounded timeout.
 * 4. Closes database and Redis connections.
 * 5. Idempotent: safely handles multiple trigger calls.
 */

'use strict';

/**
 * Creates a graceful shutdown handler function.
 * @param {Object} options
 * @param {import('http').Server} [options.server] - Node HTTP server instance
 * @param {Object} [options.queue] - Background JobQueue instance
 * @param {Object} [options.scheduler] - ReminderScheduler instance
 * @param {Object} [options.mongoose] - Mongoose database instance
 * @param {Object} [options.cache] - Cache provider instance
 * @param {number} [options.timeoutMs=5000] - Max time to wait for queue drain
 * @param {Function} [options.exitFn=process.exit] - Process exit handler
 * @param {Function} [options.logFn=console.log] - Log output handler
 * @returns {Function} shutdown(signal) => Promise<void>
 */
function createGracefulShutdown({
  server = null,
  queue = null,
  scheduler = null,
  mongoose = null,
  cache = null,
  timeoutMs = 5000,
  exitFn = (code) => process.exit(code),
  logFn = (msg) => console.log(msg)
} = {}) {
  let isShuttingDown = false;

  return async function shutdown(signal = 'SIGTERM') {
    if (isShuttingDown) {
      return; // Idempotent guard
    }
    isShuttingDown = true;

    if (typeof logFn === 'function') {
      logFn(`\n${signal} signal received: initiating graceful shutdown...`);
    }

    // 1. Stop accepting new HTTP requests
    if (server && typeof server.close === 'function') {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err && err.code !== 'ERR_SERVER_NOT_RUNNING' && typeof logFn === 'function') {
            logFn(`HTTP server close notice: ${err.message}`);
          }
          resolve();
        });
      });
    }

    // 2. Stop periodic reminder scheduler
    if (scheduler && typeof scheduler.stop === 'function') {
      scheduler.stop();
    }

    // 3. Drain in-flight jobs in the task queue
    if (queue && typeof queue.drain === 'function') {
      try {
        await queue.drain(timeoutMs);
      } catch (err) {
        if (typeof logFn === 'function') {
          logFn(`Queue drain notice: ${err.message}`);
        }
      }
    }

    // 4. Disconnect Redis cache if connected
    if (cache && typeof cache.disconnect === 'function') {
      try {
        await cache.disconnect();
      } catch {
        // Disconnect safely
      }
    }

    // 5. Close database connections cleanly
    if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close();
      } catch (err) {
        if (typeof logFn === 'function') {
          logFn(`Mongoose disconnect notice: ${err.message}`);
        }
      }
    }

    if (typeof logFn === 'function') {
      logFn('Graceful shutdown completed successfully.');
    }

    if (typeof exitFn === 'function') {
      exitFn(0);
    }
  };
}

module.exports = {
  createGracefulShutdown
};
