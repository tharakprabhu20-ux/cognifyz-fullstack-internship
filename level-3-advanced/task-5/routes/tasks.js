/**
 * routes/tasks.js
 * Express router handling RESTful CRUD endpoints for the /api/tasks resource.
 * All responses adhere to consistent JSON formatting and appropriate HTTP status codes.
 */

const express = require('express');
const router = express.Router();
const taskStore = require('../store/taskStore');
const {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
  validatePatchTask
} = require('../validators/taskValidator');

// =========================================================================
// HTTP Method: GET
// Path: /api/tasks
// CRUD Operation: Read (List Tasks with Filter, Search, Sort, Pagination)
// Status Codes: 200 (OK), 500 (Internal Server Error)
// =========================================================================
router.get('/', (req, res, next) => {
  try {
    const { status, priority, search, sort, order, page, limit } = req.query;

    const result = taskStore.getAll({
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
// CRUD Operation: Read (Retrieve a single Task by ID)
// Status Codes: 200 (OK), 400 (Bad Request), 404 (Not Found), 500 (Internal Server Error)
// =========================================================================
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Task ID must be a positive integer'
        }
      });
    }

    const task = taskStore.getById(Number(id));
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
// CRUD Operation: Create (Create a new Task)
// Status Codes: 201 (Created), 400 (Validation Error / Bad Request), 415 (Unsupported Media Type), 500 (Internal Server Error)
// =========================================================================
router.post('/', (req, res, next) => {
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

    const createdTask = taskStore.create(sanitized);

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
// CRUD Operation: Update (Full Replacement of editable Task fields)
// Status Codes: 200 (OK), 400 (Bad Request / Validation Error), 404 (Not Found), 415 (Unsupported Media Type), 500 (Internal Server Error)
// =========================================================================
router.put('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Task ID must be a positive integer'
        }
      });
    }

    const existing = taskStore.getById(Number(id));
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

    const updatedTask = taskStore.update(Number(id), sanitized);
    return res.status(200).json(updatedTask);
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// HTTP Method: PATCH
// Path: /api/tasks/:id
// CRUD Operation: Update (Partial update of editable Task fields)
// Status Codes: 200 (OK), 400 (Bad Request / Validation Error), 404 (Not Found), 415 (Unsupported Media Type), 500 (Internal Server Error)
// =========================================================================
router.patch('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Task ID must be a positive integer'
        }
      });
    }

    const existing = taskStore.getById(Number(id));
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

    const patchedTask = taskStore.patch(Number(id), sanitized);
    return res.status(200).json(patchedTask);
  } catch (err) {
    return next(err);
  }
});

// =========================================================================
// HTTP Method: DELETE
// Path: /api/tasks/:id
// CRUD Operation: Delete (Remove a Task by ID)
// Status Codes: 204 (No Content), 400 (Bad Request), 404 (Not Found), 500 (Internal Server Error)
// =========================================================================
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Task ID must be a positive integer'
        }
      });
    }

    const deleted = taskStore.delete(Number(id));
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

module.exports = router;
