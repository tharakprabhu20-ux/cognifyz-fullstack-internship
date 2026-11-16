/**
 * routes/notifications.js
 * Express router for simulated due-task reminders and notifications:
 * - GET /api/notifications - List authenticated user's notifications
 */

'use strict';

const express = require('express');

/**
 * Creates the notifications router.
 * @param {Object} options
 * @param {Object} options.reminderScheduler - Injected reminder scheduler
 * @param {Function} options.requireAuth - JWT authentication middleware
 * @returns {express.Router}
 */
function createNotificationsRouter({ reminderScheduler, requireAuth }) {
  const router = express.Router();

  // All notification endpoints require authentication
  router.use(requireAuth);

  // Authenticated responses must carry Cache-Control: private, no-cache
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/notifications
  // Operation: Read (List user notifications)
  // Auth Requirement: Authenticated (Owner only)
  // Status Codes: 200 (OK), 401 (Unauthorized)
  // =========================================================================
  router.get('/', (req, res) => {
    const notifications = reminderScheduler ? reminderScheduler.getNotifications(req.user.id) : [];
    return res.status(200).json({
      notifications
    });
  });

  return router;
}

module.exports = createNotificationsRouter;
