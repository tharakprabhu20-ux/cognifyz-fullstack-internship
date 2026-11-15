/**
 * routes/auth.js
 * Express router handling user registration, login, and profile retrieval.
 * Employs bcryptjs (cost factor 12) for password hashing and issues signed HS256 JWTs.
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validateRegister, validateLogin } = require('../validators/authValidator');
const { asyncHandler } = require('../errors/AppError');

// Precomputed cost-12 dummy hash for constant-time comparison against nonexistent users
const DUMMY_BCRYPT_HASH = '$2a$12$e80yq9gP.Z7b7rP3wH07U.o8ZgGgD1yQ57z6J20mI0uK8mD/V1Q6K';

/**
 * Factory creating the authentication router with injected dependencies.
 * @param {Object} options
 * @param {Object} options.userStore
 * @param {string} options.jwtSecret
 * @param {Function} options.requireAuth
 * @param {Object} [options.rateLimiters]
 * @returns {express.Router}
 */
function createAuthRouter({ userStore, jwtSecret, requireAuth, rateLimiters = {} }) {
  const router = express.Router();

  const registerLimiter = rateLimiters.register || ((req, res, next) => next());
  const loginLimiter = rateLimiters.login || ((req, res, next) => next());

  // =========================================================================
  // HTTP Method: POST
  // Path: /api/auth/register
  // Operation: Create (Register new student user account)
  // Auth Requirement: Public (No token required)
  // Status Codes: 201 (Created), 400 (Validation Error), 409 (Conflict), 415 (Unsupported Media Type), 500 (Internal Server Error)
  // =========================================================================
  router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
    const { isValid, errors, sanitized } = validateRegister(req.body);

    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'User registration validation failed',
          details: errors
        }
      });
    }

    // Check for duplicate email
    const existingUser = await userStore.findByEmail(sanitized.email);
    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Email already registered'
        }
      });
    }

    // Hash password using bcryptjs with cost factor 12
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(sanitized.password, salt);

    const newUser = await userStore.create({
      name: sanitized.name,
      email: sanitized.email,
      passwordHash,
      provider: 'local'
    });

    // Ensure passwordHash is never exposed in response
    return res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      provider: newUser.provider || 'local',
      createdAt: newUser.createdAt
    });
  }));

  // =========================================================================
  // HTTP Method: POST
  // Path: /api/auth/login
  // Operation: Authenticate (Verify credentials and issue signed JWT)
  // Auth Requirement: Public (No token required)
  // Status Codes: 200 (OK), 400 (Bad Request), 401 (Unauthorized), 415 (Unsupported Media Type), 500 (Internal Server Error)
  // =========================================================================
  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { isValid, errors, sanitized } = validateLogin(req.body);

    if (!isValid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Login validation failed',
          details: errors
        }
      });
    }

    const user = await userStore.findByEmail(sanitized.email);

    // Defend against timing attacks: always perform bcrypt comparison.
    // For OAuth-only users (no passwordHash or provider !== 'local'), compare against dummy hash
    // and return the exact same 401 response as for wrong passwords.
    const isLocalUser = Boolean(user && user.passwordHash && (!user.provider || user.provider === 'local'));
    const hashToCompare = isLocalUser ? user.passwordHash : DUMMY_BCRYPT_HASH;
    const isMatch = await bcrypt.compare(sanitized.password, hashToCompare);

    if (!user || !isLocalUser || !isMatch) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password'
        }
      });
    }

    // Issue signed JWT with HS256 algorithm and 1-hour expiration
    // Payload contains only the user ID
    const token = jwt.sign(
      { id: user.id },
      jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: '1h'
      }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        provider: user.provider || 'local',
        createdAt: user.createdAt
      }
    });
  }));

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/auth/me
  // Operation: Read (Retrieve current authenticated user profile)
  // Auth Requirement: Authenticated (Valid Bearer JWT required)
  // Status Codes: 200 (OK), 401 (Unauthorized), 500 (Internal Server Error)
  // =========================================================================
  router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        provider: req.user.provider || 'local',
        createdAt: req.user.createdAt
      }
    });
  });

  return router;
}

module.exports = createAuthRouter;
