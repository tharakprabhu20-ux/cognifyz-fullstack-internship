/**
 * routes/tasks.js
 * Express router handling RESTful CRUD endpoints for the /api/tasks resource.
 * All task endpoints require authentication and are strictly scoped to the requesting user.
 */

const express = require('express');
const {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
  validatePatchTask
} = require('../validators/taskValidator');

/**
 * Factory creating the tasks router with injected store and auth middleware.
 * @param {Object} options
 * @param {Object} options.taskStore
 * @param {Function} options.requireAuth
 * @returns {express.Router}
 */
function createTaskRouter({ taskStore, requireAuth }) {
  const router = express.Router();

  // Enforce authentication on all /api/tasks routes
  router.use(requireAuth);

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
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId'
          }
        });
      }

      const task = await taskStore.getById(id, req.user.id);
      if (!task) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`
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
            details: errors
          }
        });
      }

      // Owner is strictly assigned from the authenticated token
      const createdTask = await taskStore.create(sanitized, req.user.id);

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
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId'
          }
        });
      }

      const existing = await taskStore.getById(id, req.user.id);
      if (!existing) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`
          }
        });
      }

      const { isValid, errors, sanitized } = validateUpdateTask(req.body);
      if (!isValid) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task update validation failed',
            details: errors
          }
        });
      }

      const updatedTask = await taskStore.update(id, sanitized, req.user.id);
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
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId'
          }
        });
      }

      const existing = await taskStore.getById(id, req.user.id);
      if (!existing) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`
          }
        });
      }

      const { isValid, errors, sanitized } = validatePatchTask(req.body);
      if (!isValid) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Task patch validation failed',
            details: errors
          }
        });
      }

      const patchedTask = await taskStore.patch(id, sanitized, req.user.id);
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
            message: 'Task ID must be a valid 24-character hexadecimal ObjectId'
          }
        });
      }

      const deleted = await taskStore.delete(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: `Task with id ${id} not found`
          }
        });
      }

      // 204 No Content responds with an empty body
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createTaskRouter;
