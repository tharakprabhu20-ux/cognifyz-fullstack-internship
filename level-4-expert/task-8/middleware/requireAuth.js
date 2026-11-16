/**
 * middleware/requireAuth.js
 * Authorization middleware enforcing JWT authentication and user validation.
 * Verifies signature, expiration, and explicit HS256 algorithm.
 */

const jwt = require('jsonwebtoken');

/**
 * Creates requireAuth middleware with injected dependencies.
 * @param {Object} options
 * @param {string} options.jwtSecret
 * @param {Object} options.userStore
 * @returns {Function} Express middleware function
 */
function createRequireAuth({ jwtSecret, userStore }) {
  return async function requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || typeof authHeader !== 'string') {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization header is missing'
          }
        });
      }

      const parts = authHeader.trim().split(' ');
      if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authorization format must be Bearer <token>'
          }
        });
      }

      const token = parts[1];
      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      } catch (err) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid, expired, or tampered authorization token'
          }
        });
      }

      const userId = decoded.id || decoded.sub;
      if (!userId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid token payload'
          }
        });
      }

      const user = await userStore.findById(userId);
      if (!user) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authenticated user account no longer exists'
          }
        });
      }

      // Attach authenticated safe user object (no passwordHash) to request
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = createRequireAuth;
