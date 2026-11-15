/**
 * services/githubOAuth.js
 * GitHub OAuth 2.0 service utilities.
 * Handles configuration checking, authorization URL generation,
 * state verification with timing attack protection, code exchange,
 * profile/email retrieval, and ephemeral one-time exchange codes.
 */

'use strict';

const crypto = require('crypto');
const { fetchJsonWithRetry } = require('./httpClient');
const { UpstreamError } = require('../errors/AppError');

/**
 * Checks whether GitHub OAuth credentials are fully and genuinely configured.
 * Values that are missing, empty, or start with "PASTE_" count as not configured.
 * @param {Object} [config]
 * @param {string} [config.clientId]
 * @param {string} [config.clientSecret]
 * @returns {boolean}
 */
function isOAuthConfigured(config) {
  if (!config) return false;
  const { clientId, clientSecret } = config;
  if (!clientId || typeof clientId !== 'string' || clientId.trim() === '' || clientId.startsWith('PASTE_')) {
    return false;
  }
  if (!clientSecret || typeof clientSecret !== 'string' || clientSecret.trim() === '' || clientSecret.startsWith('PASTE_')) {
    return false;
  }
  return true;
}

/**
 * Generates a cryptographically strong 32-byte hex state token.
 * @returns {string}
 */
function generateOAuthState() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compares two state strings in constant time to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompareState(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts a cookie value from the incoming request's Cookie header.
 * @param {import('express').Request} req
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [key, ...val] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(val.join('='));
    }
  }
  return null;
}

/**
 * In-memory store for ephemeral, single-use one-time exchange codes.
 */
class OAuthCodeStore {
  constructor({ defaultTtlMs = 60 * 1000, clock = () => Date.now() } = {}) {
    this.codes = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.clock = clock;
  }

  /**
   * Generates and stores a new one-time code bound to a user.
   * @param {Object} userData - User record to bind
   * @param {number} [ttlMs] - Time-to-live in milliseconds
   * @returns {string} 32-byte hex code
   */
  createCode(userData, ttlMs) {
    const code = crypto.randomBytes(32).toString('hex');
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = this.clock() + ttl;

    this.codes.set(code, {
      user: userData,
      expiresAt
    });

    return code;
  }

  /**
   * Atomically consumes a code (single-use). Returns null if expired or not found.
   * @param {string} code
   * @returns {Object|null} Bound user data or null
   */
  consumeCode(code) {
    if (!code || typeof code !== 'string') return null;
    const entry = this.codes.get(code);
    if (!entry) return null;

    // Immediately remove code to enforce single use
    this.codes.delete(code);

    if (this.clock() > entry.expiresAt) {
      return null;
    }

    return entry.user;
  }

  /**
   * Cleans up expired codes.
   */
  cleanup() {
    const now = this.clock();
    for (const [code, entry] of this.codes.entries()) {
      if (now > entry.expiresAt) {
        this.codes.delete(code);
      }
    }
  }
}

/**
 * Exchanges a GitHub OAuth authorization code for an access token.
 * Never logs or returns the client secret or access token.
 * @param {string} code - Authorization code
 * @param {Object} oauthConfig - { clientId, clientSecret, baseUrl }
 * @param {Object} [deps={}] - Dependency injection options
 * @returns {Promise<string>} Access token
 */
async function exchangeGitHubCode(code, oauthConfig, deps = {}) {
  const tokenUrl = 'https://github.com/login/oauth/access_token';
  const redirectUri = `${oauthConfig.baseUrl}/api/auth/github/callback`;

  const body = JSON.stringify({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const res = await fetchJsonWithRetry(tokenUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body
  }, {
    fetchImpl: deps.fetchImpl,
    maxRetries: 1,
    timeoutMs: 5000
  });

  if (!res.data || !res.data.access_token || res.data.error) {
    throw new UpstreamError('GitHub token exchange failed', 502, 'UPSTREAM_ERROR');
  }

  return res.data.access_token;
}

/**
 * Fetches user profile and verified primary email from GitHub API.
 * @param {string} accessToken
 * @param {Object} [deps={}]
 * @returns {Promise<{ githubUser: Object, primaryEmail: string }>}
 */
async function fetchGitHubUserAndEmail(accessToken, deps = {}) {
  const userUrl = 'https://api.github.com/user';
  const emailsUrl = 'https://api.github.com/user/emails';

  const userHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Student-Task-Manager'
  };

  const userRes = await fetchJsonWithRetry(userUrl, { method: 'GET', headers: userHeaders }, {
    fetchImpl: deps.fetchImpl,
    maxRetries: 1,
    timeoutMs: 5000
  });

  const emailsRes = await fetchJsonWithRetry(emailsUrl, { method: 'GET', headers: userHeaders }, {
    fetchImpl: deps.fetchImpl,
    maxRetries: 1,
    timeoutMs: 5000
  });

  const emails = Array.isArray(emailsRes.data) ? emailsRes.data : [];
  const primaryVerified = emails.find(e => e.primary === true && e.verified === true);

  if (!primaryVerified || !primaryVerified.email) {
    throw new UpstreamError('No primary verified email found in GitHub account', 502, 'UNVERIFIED_EMAIL');
  }

  return {
    githubUser: userRes.data,
    primaryEmail: primaryVerified.email.trim().toLowerCase()
  };
}

module.exports = {
  isOAuthConfigured,
  generateOAuthState,
  safeCompareState,
  getCookie,
  OAuthCodeStore,
  exchangeGitHubCode,
  fetchGitHubUserAndEmail
};
