/**
 * routes/oauth.js
 * Express router for GitHub OAuth 2.0 authentication endpoints:
 * - GET /api/auth/providers
 * - GET /api/auth/github
 * - GET /api/auth/github/callback
 * - POST /api/auth/oauth/exchange
 */

'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const {
  isOAuthConfigured,
  generateOAuthState,
  safeCompareState,
  getCookie,
  exchangeGitHubCode,
  fetchGitHubUserAndEmail
} = require('../services/githubOAuth');
const { ValidationError, AuthError, asyncHandler } = require('../errors/AppError');

/**
 * Creates the OAuth router.
 * @param {Object} options
 * @param {Object} options.oauthConfig - { clientId, clientSecret, baseUrl }
 * @param {Object} options.userStore - User store
 * @param {string} options.jwtSecret - JWT signing secret
 * @param {Object} options.codeStore - OAuthCodeStore instance
 * @param {Function} [options.fetchImpl] - Fetch implementation
 * @param {Object} [options.rateLimiters] - Rate limiters
 * @returns {express.Router}
 */
function createOAuthRouter({ oauthConfig, userStore, jwtSecret, codeStore, fetchImpl, rateLimiters = {} }) {
  const router = express.Router();
  const oauthLimiter = rateLimiters.oauthExchange || ((req, res, next) => next());

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/auth/providers
  // Operation: Returns which auth providers are configured on this server
  // Status Codes: 200 (OK)
  // =========================================================================
  router.get('/providers', (req, res) => {
    const configured = isOAuthConfigured(oauthConfig);
    return res.status(200).json({
      github: configured
    });
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/auth/github
  // Operation: Initiates GitHub OAuth authorization flow
  // Status Codes: 302 (Redirect to GitHub) or 503 (OAuth Not Configured)
  // =========================================================================
  router.get('/github', (req, res) => {
    if (!isOAuthConfigured(oauthConfig)) {
      const requestId = req.id || req.headers['x-request-id'];
      return res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'GitHub OAuth is not configured on this server',
          ...(requestId ? { requestId } : {})
        }
      });
    }

    const state = generateOAuthState();
    const isProd = process.env.NODE_ENV === 'production';
    const cookieHeader = `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isProd ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookieHeader);

    const redirectUri = `${oauthConfig.baseUrl}/api/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state
    });

    return res.redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // =========================================================================
  // HTTP Method: GET
  // Path: /api/auth/github/callback
  // Operation: GitHub OAuth authorization callback
  // Status Codes: 302 (Redirect to /?oauth_code=... or /?oauth_error=...)
  // =========================================================================
  router.get('/github/callback', asyncHandler(async (req, res) => {
    const { code, state: queryState } = req.query;

    // 1. Validate incoming query parameters
    if (!code || !queryState || typeof code !== 'string' || typeof queryState !== 'string') {
      return res.redirect('/?oauth_error=missing_params');
    }

    // 2. Validate session state cookie
    const cookieState = getCookie(req, 'oauth_state');
    if (!cookieState) {
      return res.redirect('/?oauth_error=state_missing');
    }

    // 3. Clear cookie immediately to prevent reuse
    res.setHeader('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');

    // 4. Constant-time compare state tokens to prevent CSRF
    if (!safeCompareState(queryState, cookieState)) {
      return res.redirect('/?oauth_error=state_mismatch');
    }

    // 5. Server-side token exchange (secret is never exposed to browser)
    let accessToken;
    try {
      accessToken = await exchangeGitHubCode(code, oauthConfig, { fetchImpl });
    } catch (_) {
      return res.redirect('/?oauth_error=token_exchange_failed');
    }

    // 6. Fetch GitHub user profile and verified email
    let githubUser;
    let primaryEmail;
    try {
      const fetched = await fetchGitHubUserAndEmail(accessToken, { fetchImpl });
      githubUser = fetched.githubUser;
      primaryEmail = fetched.primaryEmail;
    } catch (err) {
      if (err.code === 'UNVERIFIED_EMAIL') {
        return res.redirect('/?oauth_error=unverified_email');
      }
      return res.redirect('/?oauth_error=user_fetch_failed');
    }

    // Access token is discarded here; never stored or logged
    accessToken = null;

    // 7. Find or create user, strictly preventing silent account linking
    let user = await userStore.findByProvider('github', githubUser.id);
    if (!user) {
      const existingEmailUser = await userStore.findByEmail(primaryEmail);
      if (existingEmailUser) {
        // Refuse to silently link to an existing local account
        return res.redirect('/?oauth_error=account_exists');
      }

      user = await userStore.create({
        name: githubUser.name || githubUser.login || 'GitHub User',
        email: primaryEmail,
        provider: 'github',
        providerId: String(githubUser.id)
      });
    }

    // 8. Generate short-lived, single-use one-time code for front-end exchange
    const oneTimeCode = codeStore.createCode(user);

    return res.redirect(`/?oauth_code=${oneTimeCode}`);
  }));

  // =========================================================================
  // HTTP Method: POST
  // Path: /api/auth/oauth/exchange
  // Operation: Exchanges single-use one-time code for JWT session
  // Status Codes: 200 (OK), 400 (Bad Request), 401 (Unauthorized), 429 (Rate Limited)
  // =========================================================================
  router.post('/oauth/exchange', oauthLimiter, asyncHandler(async (req, res) => {
    const { code } = req.body || {};

    if (!code || typeof code !== 'string') {
      throw new ValidationError('Exchange code is required', [
        { field: 'code', message: 'Code must be a non-empty string' }
      ]);
    }

    const user = codeStore.consumeCode(code);
    if (!user) {
      throw new AuthError('Invalid or expired OAuth exchange code', 'INVALID_OAUTH_CODE');
    }

    // Issue signed JWT with HS256 algorithm and 1-hour expiration
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
        provider: user.provider || 'github',
        createdAt: user.createdAt
      }
    });
  }));

  return router;
}

module.exports = createOAuthRouter;
