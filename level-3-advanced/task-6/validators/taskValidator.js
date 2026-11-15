/**
 * validators/taskValidator.js
 * Request validation logic for task CRUD operations.
 * Validates fields according to business rules and sanitizes payloads
 * to ignore unknown or forbidden fields (e.g., id, owner, createdAt, updatedAt).
 */

const VALID_STATUSES = ['todo', 'in-progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Validates an ISO date string in YYYY-MM-DD format and checks if it's a real calendar date.
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Validates that an ID parameter is a 24-character hexadecimal ObjectId string.
 * @param {any} id
 * @returns {boolean}
 */
function isValidId(id) {
  if (id === undefined || id === null) return false;
  return OBJECT_ID_REGEX.test(String(id).trim());
}

/**
 * Validates the title field.
 * @param {any} title
 * @param {boolean} isRequired
 * @returns {string|null} error message or null if valid
 */
function validateTitle(title, isRequired = true) {
  if (title === undefined || title === null) {
    return isRequired ? 'Title is required' : null;
  }
  if (typeof title !== 'string') {
    return 'Title must be a string';
  }
  const trimmed = title.trim();
  if (trimmed.length < 3 || trimmed.length > 100) {
    return 'Title must be between 3 and 100 characters';
  }
  return null;
}

/**
 * Validates the description field.
 * @param {any} description
 * @returns {string|null} error message or null if valid
 */
function validateDescription(description) {
  if (description === undefined || description === null || description === '') {
    return null;
  }
  if (typeof description !== 'string') {
    return 'Description must be a string';
  }
  if (description.length > 500) {
    return 'Description cannot exceed 500 characters';
  }
  return null;
}

/**
 * Validates the status field.
 * @param {any} status
 * @param {boolean} isRequired
 * @returns {string|null} error message or null if valid
 */
function validateStatus(status, isRequired = false) {
  if (status === undefined || status === null) {
    return isRequired ? 'Status is required' : null;
  }
  if (!VALID_STATUSES.includes(status)) {
    return `Status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  return null;
}

/**
 * Validates the priority field.
 * @param {any} priority
 * @param {boolean} isRequired
 * @returns {string|null} error message or null if valid
 */
function validatePriority(priority, isRequired = false) {
  if (priority === undefined || priority === null) {
    return isRequired ? 'Priority is required' : null;
  }
  if (!VALID_PRIORITIES.includes(priority)) {
    return `Priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  return null;
}

/**
 * Validates the dueDate field.
 * @param {any} dueDate
 * @returns {string|null} error message or null if valid
 */
function validateDueDate(dueDate) {
  if (dueDate === undefined || dueDate === null || dueDate === '') {
    return null;
  }
  if (!isValidDateString(dueDate)) {
    return 'Due date must be a valid date in YYYY-MM-DD format';
  }
  return null;
}

/**
 * Validates payload for POST /api/tasks (Creation).
 * Client-supplied owner, id, and timestamps are strictly stripped.
 * @param {Object} body
 * @returns {{ isValid: boolean, errors: Array, sanitized: Object }}
 */
function validateCreateTask(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
      sanitized: {}
    };
  }

  // Validate title (required)
  const titleErr = validateTitle(body.title, true);
  if (titleErr) errors.push({ field: 'title', message: titleErr });

  // Validate description (optional)
  const descErr = validateDescription(body.description);
  if (descErr) errors.push({ field: 'description', message: descErr });

  // Validate status (optional, defaults to 'todo')
  const statusErr = validateStatus(body.status, false);
  if (statusErr) errors.push({ field: 'status', message: statusErr });

  // Validate priority (optional, defaults to 'medium')
  const priorityErr = validatePriority(body.priority, false);
  if (priorityErr) errors.push({ field: 'priority', message: priorityErr });

  // Validate dueDate (optional)
  const dueErr = validateDueDate(body.dueDate);
  if (dueErr) errors.push({ field: 'dueDate', message: dueErr });

  // Extract ONLY recognized fields (ignore unknown fields, client-provided id, owner, timestamps)
  const sanitized = {};
  if (body.title !== undefined) sanitized.title = body.title;
  if (body.description !== undefined) sanitized.description = body.description;
  if (body.status !== undefined) sanitized.status = body.status;
  if (body.priority !== undefined) sanitized.priority = body.priority;
  if (body.dueDate !== undefined && body.dueDate !== '') sanitized.dueDate = body.dueDate;

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validates payload for PUT /api/tasks/:id (Full Replacement).
 * All editable fields are validated. Client-supplied owner is stripped.
 * @param {Object} body
 * @returns {{ isValid: boolean, errors: Array, sanitized: Object }}
 */
function validateUpdateTask(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
      sanitized: {}
    };
  }

  // Title is required
  const titleErr = validateTitle(body.title, true);
  if (titleErr) errors.push({ field: 'title', message: titleErr });

  // Description is optional
  const descErr = validateDescription(body.description);
  if (descErr) errors.push({ field: 'description', message: descErr });

  // Status is required for full replace
  const statusErr = validateStatus(body.status, true);
  if (statusErr) errors.push({ field: 'status', message: statusErr });

  // Priority is required for full replace
  const priorityErr = validatePriority(body.priority, true);
  if (priorityErr) errors.push({ field: 'priority', message: priorityErr });

  // DueDate is optional
  const dueErr = validateDueDate(body.dueDate);
  if (dueErr) errors.push({ field: 'dueDate', message: dueErr });

  const sanitized = {
    title: body.title,
    description: body.description || '',
    status: body.status,
    priority: body.priority,
    dueDate: body.dueDate && body.dueDate !== '' ? body.dueDate : null
  };

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validates payload for PATCH /api/tasks/:id (Partial Update).
 * Rejects empty bodies and validates only fields provided.
 * @param {Object} body
 * @returns {{ isValid: boolean, errors: Array, sanitized: Object }}
 */
function validatePatchTask(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
      sanitized: {}
    };
  }

  const allowedKeys = ['title', 'description', 'status', 'priority', 'dueDate'];
  const presentKeys = Object.keys(body).filter(key => allowedKeys.includes(key));

  if (presentKeys.length === 0) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must contain at least one editable field (title, description, status, priority, dueDate)' }],
      sanitized: {}
    };
  }

  const sanitized = {};

  if ('title' in body) {
    const err = validateTitle(body.title, true);
    if (err) errors.push({ field: 'title', message: err });
    else sanitized.title = body.title;
  }

  if ('description' in body) {
    const err = validateDescription(body.description);
    if (err) errors.push({ field: 'description', message: err });
    else sanitized.description = body.description;
  }

  if ('status' in body) {
    const err = validateStatus(body.status, true);
    if (err) errors.push({ field: 'status', message: err });
    else sanitized.status = body.status;
  }

  if ('priority' in body) {
    const err = validatePriority(body.priority, true);
    if (err) errors.push({ field: 'priority', message: err });
    else sanitized.priority = body.priority;
  }

  if ('dueDate' in body) {
    const err = validateDueDate(body.dueDate);
    if (err) errors.push({ field: 'dueDate', message: err });
    else sanitized.dueDate = body.dueDate && body.dueDate !== '' ? body.dueDate : null;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

module.exports = {
  isValidId,
  validateCreateTask,
  validateUpdateTask,
  validatePatchTask,
  VALID_STATUSES,
  VALID_PRIORITIES
};
