/**
 * routes/jobs.js
 * Express router for background job status and artifact downloads:
 * - GET /api/jobs/:id - Status, state, and progress of a background job (owner-only)
 * - GET /api/jobs/:id/download - Download job result artifact (owner-only, completed only)
 */

'use strict';

const express = require('express');

/**
 * Creates the background jobs router.
 * @param {Object} options
 * @param {Object} options.jobQueue - Injected JobQueue instance
 * @param {Function} options.requireAuth - JWT authentication middleware
 * @returns {express.Router}
 */
function createJobRouter({ jobQueue, requireAuth }) {
  const router = express.Router();

  // All job endpoints require authentication
  router.use(requireAuth);

  // Authenticated endpoints must never be stored in shared caches
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/jobs/:id
  // Operation: Read (Poll job status, state, and progress)
  // Auth Requirement: Authenticated (Owner only)
  // Status Codes: 200 (OK), 401 (Unauthorized), 404 (Not Found)
  // =========================================================================
  router.get('/:id', (req, res) => {
    const { id } = req.params;
    const job = jobQueue ? jobQueue.getJob(id) : null;

    // Strict ownership isolation: return 404 if job does not exist OR belongs to another user
    if (!job || job.userId !== String(req.user.id)) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Job with id ${id} not found`,
          requestId: req.id
        }
      });
    }

    return res.status(200).json({
      id: job.id,
      type: job.type,
      state: job.state, // queued | running | succeeded | failed
      progress: job.progress, // 0 - 100
      format: job.data && job.data.format ? job.data.format : null,
      createdAt: new Date(job.createdAt).toISOString(),
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
      error: job.error
    });
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/jobs/:id/download
  // Operation: Read (Download exported artifact file)
  // Auth Requirement: Authenticated (Owner only)
  // Status Codes: 200 (OK), 400 (Bad Request - Job not completed), 401 (Unauthorized), 404 (Not Found)
  // =========================================================================
  router.get('/:id/download', (req, res) => {
    const { id } = req.params;
    const job = jobQueue ? jobQueue.getJob(id) : null;

    // Strict ownership isolation: 404 if missing or owned by another user
    if (!job || job.userId !== String(req.user.id)) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Job with id ${id} not found`,
          requestId: req.id
        }
      });
    }

    if (job.state !== 'succeeded' || !job.result) {
      return res.status(400).json({
        error: {
          code: 'JOB_NOT_READY',
          message: `Job result is not ready for download. Current state: ${job.state}`,
          requestId: req.id
        }
      });
    }

    res.setHeader('Content-Type', job.result.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${job.result.filename || 'export.dat'}"`);
    return res.status(200).send(job.result.content);
  });

  return router;
}

module.exports = createJobRouter;
