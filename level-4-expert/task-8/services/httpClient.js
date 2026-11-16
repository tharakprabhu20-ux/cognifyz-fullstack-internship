/**
 * services/httpClient.js
 * Hardened HTTP client for external API requests.
 * Enforces strict timeouts, exponential backoff with jitter,
 * HTTP 429 Retry-After handling, response size caps, and non-JSON checks.
 */

'use strict';

const { UpstreamError } = require('../errors/AppError');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1 MB

/**
 * Delays execution for specified milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates backoff delay with jitter or respects Retry-After header.
 * @param {number} attempt
 * @param {Response|null} response
 * @param {number} baseDelayMs
 * @param {number} maxDelayMs
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, response, baseDelayMs = 100, maxDelayMs = 2000) {
  if (response && response.status === 429) {
    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      const parsedSeconds = parseInt(retryAfterHeader, 10);
      if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
        return Math.min(parsedSeconds * 1000, maxDelayMs);
      }
    }
  }

  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 50);
  return Math.min(exp + jitter, maxDelayMs);
}

/**
 * Performs a fetch request with timeouts, retries, size cap, and JSON verification.
 * @param {string} url - Destination URL
 * @param {Object} [options={}] - Fetch options
 * @param {Object} [deps={}] - Injectable dependencies
 * @param {Function} [deps.fetchImpl] - Fetch implementation (defaults to global fetch)
 * @param {number} [deps.timeoutMs=5000] - Timeout in milliseconds
 * @param {number} [deps.maxRetries=2] - Maximum retry attempts
 * @param {number} [deps.baseDelayMs=50] - Base backoff delay
 * @param {number} [deps.maxDelayMs=1000] - Maximum backoff delay
 * @param {number} [deps.maxSizeBytes=1048576] - Maximum allowed response size
 * @returns {Promise<{ status: number, headers: Headers, data: any }>}
 */
async function fetchJsonWithRetry(url, options = {}, deps = {}) {
  const fetchFn = deps.fetchImpl || globalThis.fetch;
  const timeoutMs = deps.timeoutMs !== undefined ? deps.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxRetries = deps.maxRetries !== undefined ? deps.maxRetries : DEFAULT_MAX_RETRIES;
  const baseDelayMs = deps.baseDelayMs || 50;
  const maxDelayMs = deps.maxDelayMs || 1000;
  const maxSizeBytes = deps.maxSizeBytes || MAX_RESPONSE_SIZE;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let didTimeout = false;

    const timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      const fetchOpts = {
        ...options,
        signal: controller.signal
      };

      const response = await fetchFn(url, fetchOpts);
      clearTimeout(timer);

      // Check status: 5xx or 429 should be retried
      if (response.status >= 500 || response.status === 429) {
        if (attempt < maxRetries) {
          const delay = calculateBackoff(attempt, response, baseDelayMs, maxDelayMs);
          await sleep(delay);
          continue;
        }
        throw new UpstreamError(`Upstream returned HTTP status ${response.status}`, 502, 'UPSTREAM_ERROR');
      }

      // 4xx client errors (other than 429) must NOT be retried
      if (!response.ok) {
        throw new UpstreamError(`Upstream returned client error ${response.status}`, response.status >= 400 && response.status < 500 ? response.status : 502, 'UPSTREAM_ERROR');
      }

      // Check Content-Type header
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new UpstreamError('Upstream response is not JSON', 502, 'UPSTREAM_ERROR');
      }

      // Enforce response size cap via Content-Length if present
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
        throw new UpstreamError('Upstream payload exceeded allowable size limit', 502, 'UPSTREAM_ERROR');
      }

      // Read buffer and check actual size
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > maxSizeBytes) {
        throw new UpstreamError('Upstream payload exceeded allowable size limit', 502, 'UPSTREAM_ERROR');
      }

      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new UpstreamError('Upstream returned malformed JSON', 502, 'UPSTREAM_ERROR');
      }

      return {
        status: response.status,
        headers: response.headers,
        data
      };
    } catch (err) {
      clearTimeout(timer);

      if (didTimeout || err.name === 'AbortError') {
        throw new UpstreamError('Upstream request timed out', 504, 'UPSTREAM_TIMEOUT');
      }

      if (err instanceof UpstreamError) {
        lastError = err;
        // Don't retry non-retriable UpstreamErrors (e.g. non-JSON, size cap, or 4xx other than 429)
        if (err.status !== 502 && err.status !== 429 && err.status < 500) {
          throw err;
        }
      } else {
        lastError = new UpstreamError('Upstream network connection error', 502, 'UPSTREAM_ERROR');
      }

      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, null, baseDelayMs, maxDelayMs);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  throw lastError || new UpstreamError('Upstream service request failed', 502, 'UPSTREAM_ERROR');
}

module.exports = {
  fetchJsonWithRetry,
  sleep,
  calculateBackoff
};
