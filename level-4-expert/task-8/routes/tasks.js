/**
 * routes/tasks.js
 * Express router handling RESTful CRUD endpoints for the /api/tasks resource.
 * All task endpoints require authentication and are strictly scoped to the requesting user.
 *
 * Task 8 Enhancements:
 * - 30-second response caching on GET /api/tasks with per-user version invalidation
 * - X-Cache: HIT|MISS headers
 * - Strict user isolation (User B never sees User A's cached entries)
 * - Private cache control headers (Cache-Control: private, no-cache)
 * - Background export job dispatch: POST /api/tasks/export returns 202 Accepted
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
  validatePatchTask
} = require('../validators/taskValidator');

// In-memory per-user task list version tracker for instant cache invalidation
const userTaskVersions = new Map();

function getUserTaskVersion(userId) {
  return userTaskVersions.get(String(userId)) || 1;
}

function bumpUserTaskVersion(userId) {
  const current = getUserTaskVersion(userId);
  userTaskVersions.set(String(userId), current + 1);
}

/**
 * Normalizes query parameters into a deterministic hashed string.
 * @param {Object} query
 * @returns {string} 16-character hex hash
 */
function hashNormalizedQuery(query = {}) {
  const normalized = {};
  const allowedKeys = ['status', 'priority', 'search', 'sort', 'order', 'page', 'limit'];

  for (const key of allowedKeys) {
    if (query[key] !== undefined && query[key] !== null) {
      normalized[key] = String(query[key]).trim().toLowerCase();
    }
  }

  const serialized = JSON.stringify(normalized, Object.keys(normalized).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Factory creating the tasks router with injected store, auth middleware, cache, and jobQueue.
 * @param {Object} options
 * @param {Object} options.taskStore
 * @param {Function} options.requireAuth
 * @param {Object} [options.cache] - Cache provider (MemoryCache or RedisCache)
 * @param {Object} [options.jobQueue] - Background JobQueue instance
 * @returns {express.Router}
 */
function createTaskRouter({ taskStore, requireAuth, cache = null, jobQueue = null }) {
  const router = express.Router();

  // Enforce authentication on all /api/tasks routes
  router.use(requireAuth);

  // Authenticated API responses must carry Cache-Control: private, no-cache
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });

  // =========================================================================
  // HTTP Method: POST
  // Path: /api/tasks/export
  // Operation: Enqueue Background Task Export (CSV / JSON)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 202 (Accepted), 400 (Bad Request), 503 (Service Unavailable)
  // =========================================================================
  router.post('/export', (req, res, next) => {
    try {
      const format = (req.body && req.body.format ? String(req.body.format).trim().toLowerCase() : 'json');

      if (!['csv', 'json'].includes(format)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid export format. Must be "csv" or "json"',
            requestId: req.id
          }
        });
      }

      if (!jobQueue) {
        return res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Background job service is unavailable',
            requestId: req.id
          }
        });
      }

      const job = jobQueue.enqueue('export-tasks', { format }, { userId: req.user.id });

      return res.status(202).json({
        jobId: job.id,
        statusUrl: `/api/jobs/${job.id}`
      });
    } catch (err) {
      if (err.status === 503 || err.name === 'QueueFullError') {
        return res.status(503).json({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: err.message || 'Task export queue is currently full',
            requestId: req.id
          }
        });
      }
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/tasks
  // Operation: Read (List Tasks with Filter, Search, Sort, Pagination)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 200 (OK), 401 (Unauthorized), 500 (Internal Server Error)
  // =========================================================================
  router.get('/', async (req, res, next) => {
    try {
      const { status, priority, search, sort, order, page, limit } = req.query;
      const userId = String(req.user.id);
      const userVersion = getUserTaskVersion(userId);
      const queryHash = hashNormalizedQuery(req.query);
      const cacheKey = `tasks:${userId}:v${userVersion}:${queryHash}`;

      // Check cache
      if (cache) {
        const cachedRaw = await cache.get(cacheKey);
        if (cachedRaw !== null && cachedRaw !== undefined) {
          res.setHeader('X-Cache', 'HIT');
          return res.status(200).type('application/json').send(cachedRaw);
        }
      }

      res.setHeader('X-Cache', 'MISS');

      const result = await taskStore.getAll({
        ownerId: req.user.id,
        status,
        priority,
        search,
        sort,
        order,
        page,
        limit
      });

      // Cache successful response for 30 seconds
      if (cache) {
        await cache.set(cacheKey, JSON.stringify(result), 30);
      }

      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/tasks/:id
  // Operation: Read (Retrieve a single Task by ID)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 200 (OK), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Internal Server Error)
  // =========================================================================
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId',
            requestId: req.id
          }
        });
      }

      const task = await taskStore.getById(id, req.user.id);
      if (!task) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`,
            requestId: req.id
          }
        });
      }

      return res.status(200).json(task);
    } catch (err) {
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: POST
  // Path: /api/tasks
  // Operation: Create (Create a new Task)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 201 (Created), 400 (Validation Error / Bad Request), 401 (Unauthorized), 415 (Unsupported Media Type), 500 (Internal Server Error)
  // =========================================================================
  router.post('/', async (req, res, next) => {
    try {
      const { isValid, errors, sanitized } = validateCreateTask(req.body);

      if (!isValid) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task validation failed',
            details: errors,
            requestId: req.id
          }
        });
      }

      // Owner is strictly assigned from the authenticated token
      const createdTask = await taskStore.create(sanitized, req.user.id);

      // Invalidate user's cached task lists
      bumpUserTaskVersion(req.user.id);

      // Set Location header pointing to the newly created resource
      res.setHeader('Location', `/api/tasks/${createdTask.id}`);
      return res.status(201).json(createdTask);
    } catch (err) {
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: PUT
  // Path: /api/tasks/:id
  // Operation: Update (Full Replacement of editable Task fields)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 200 (OK), 400 (Bad Request / Validation Error), 401 (Unauthorized), 404 (Not Found), 415 (Unsupported Media Type), 500 (Internal Server Error)
  // =========================================================================
  router.put('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId',
            requestId: req.id
          }
        });
      }

      const existing = await taskStore.getById(id, req.user.id);
      if (!existing) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`,
            requestId: req.id
          }
        });
      }

      const { isValid, errors, sanitized } = validateUpdateTask(req.body);
      if (!isValid) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task update validation failed',
            details: errors,
            requestId: req.id
          }
        });
      }

      const updatedTask = await taskStore.update(id, sanitized, req.user.id);

      // Invalidate user's cached task lists
      bumpUserTaskVersion(req.user.id);

      return res.status(200).json(updatedTask);
    } catch (err) {
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: PATCH
  // Path: /api/tasks/:id
  // Operation: Update (Partial update of editable Task fields)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 200 (OK), 400 (Bad Request / Validation Error), 401 (Unauthorized), 404 (Not Found), 415 (Unsupported Media Type), 500 (Internal Server Error)
  // =========================================================================
  router.patch('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId',
            requestId: req.id
          }
        });
      }

      const existing = await taskStore.getById(id, req.user.id);
      if (!existing) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`,
            requestId: req.id
          }
        });
      }

      const { isValid, errors, sanitized } = validatePatchTask(req.body);
      if (!isValid) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task patch validation failed',
            details: errors,
            requestId: req.id
          }
        });
      }

      const patchedTask = await taskStore.patch(id, sanitized, req.user.id);

      // Invalidate user's cached task lists
      bumpUserTaskVersion(req.user.id);

      return res.status(200).json(patchedTask);
    } catch (err) {
      return next(err);
    }
  });

  // =========================================================================
  // HTTP Method: DELETE
  // Path: /api/tasks/:id
  // Operation: Delete (Remove a Task by ID)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 204 (No Content), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Internal Server Error)
  // =========================================================================
  router.delete('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId',
            requestId: req.id
          }
        });
      }

      const deleted = await taskStore.delete(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`,
            requestId: req.id
          }
        });
      }

      // Invalidate user's cached task lists
      bumpUserTaskVersion(req.user.id);

      // 204 No Content responds with an empty body
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createTaskRouter;
module.exports.bumpUserTaskVersion = bumpUserTaskVersion;
