/**
 * validators/authValidator.js
 * Request validation and sanitization for user authentication endpoints.
 * Strictly verifies types (rejects objects/arrays for NoSQL injection prevention).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the registration request body.
 * @param {any} body
 * @returns {{ isValid: boolean, errors: Array<{ field: string, message: string }>, sanitized: Object }}
 */
function validateRegister(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
      sanitized: {}
    };
  }

  // Validate Name
  if (body.name === undefined || body.name === null) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (typeof body.name !== 'string') {
    errors.push({ field: 'name', message: 'Name must be a string' });
  } else {
    const trimmedName = body.name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 50) {
      errors.push({ field: 'name', message: 'Name must be between 3 and 50 characters' });
    }
  }

  // Validate Email
  if (body.email === undefined || body.email === null) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (typeof body.email !== 'string') {
    errors.push({ field: 'email', message: 'Email must be a string' });
  } else {
    const trimmedEmail = body.email.trim();
    if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 254) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    }
  }

  // Validate Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)
  if (body.password === undefined || body.password === null) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Password must be a string' });
  } else {
    const pwd = body.password;
    if (pwd.length < 8) {
      errors.push({ field: 'password', message: 'Password must be at least 8 characters long' });
    } else if (!/[A-Z]/.test(pwd)) {
      errors.push({ field: 'password', message: 'Password must contain at least one uppercase letter' });
    } else if (!/[a-z]/.test(pwd)) {
      errors.push({ field: 'password', message: 'Password must contain at least one lowercase letter' });
    } else if (!/[0-9]/.test(pwd)) {
      errors.push({ field: 'password', message: 'Password must contain at least one number' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password
    } : {}
  };
}

/**
 * Validates the login request body.
 * @param {any} body
 * @returns {{ isValid: boolean, errors: Array<{ field: string, message: string }>, sanitized: Object }}
 */
function validateLogin(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
      sanitized: {}
    };
  }

  if (body.email === undefined || body.email === null || typeof body.email !== 'string' || !body.email.trim()) {
    errors.push({ field: 'email', message: 'Email is required and must be a string' });
  }

  if (body.password === undefined || body.password === null || typeof body.password !== 'string' || !body.password) {
    errors.push({ field: 'password', message: 'Password is required and must be a string' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: errors.length === 0 ? {
      email: body.email.trim().toLowerCase(),
      password: body.password
    } : {}
  };
}

module.exports = {
  validateRegister,
  validateLogin
};
