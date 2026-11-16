/**
 * cache/RedisCache.js
 * Redis-backed cache implementation with lazy module loading and
 * automatic, resilient fallback to MemoryCache if Redis encounters any error.
 * Ensures that Redis downtime never crashes the server or fails user requests.
 */

'use strict';

const MemoryCache = require('./MemoryCache');

class RedisCache {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.redisUrl] - Redis connection URI
   * @param {Object} [options.client] - Pre-constructed or fake Redis client for tests
   * @param {MemoryCache} [options.fallbackMemoryCache] - Memory fallback cache instance
   * @param {Function} [options.logger] - Logger for failure events
   * @param {Function} [options.clock] - Clock function
   */
  constructor({
    redisUrl = process.env.REDIS_URL,
    client = null,
    fallbackMemoryCache = null,
    logger = console.warn,
    clock = () => Date.now()
  } = {}) {
    this.redisUrl = redisUrl;
    this.client = client;
    this.fallback = fallbackMemoryCache || new MemoryCache({ clock });
    this.logger = logger;
    this.clock = clock;
    this.hasLoggedError = false;
    this.isDegraded = false;
    this.clientConnected = false;

    // Only attempt connection if client wasn't directly provided
    if (!this.client && this.redisUrl) {
      try {
        // Lazy require so app starts smoothly when redis is not used or installed
        // eslint-disable-next-line global-require
        const redis = require('redis');
        this.client = redis.createClient({ url: this.redisUrl });
        this.client.on('error', (err) => {
          this._handleError(err);
        });
        this.client.connect().then(() => {
          this.clientConnected = true;
          this.isDegraded = false;
        }).catch((err) => {
          this._handleError(err);
        });
      } catch (err) {
        this._handleError(err);
      }
    }
  }

  _handleError(err) {
    this.isDegraded = true;
    if (!this.hasLoggedError) {
      this.hasLoggedError = true;
      if (typeof this.logger === 'function') {
        this.logger(`[CACHE-WARN] Redis connection failed, falling back to in-memory cache: ${err?.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Retrieves a cached value from Redis or fallback.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    if (this.isDegraded || !this.client) {
      return this.fallback.get(key);
    }

    try {
      const val = await this.client.get(key);
      if (val !== null && val !== undefined) {
        this.fallback.hits++;
        return String(val);
      }
      this.fallback.misses++;
      return null;
    } catch (err) {
      this._handleError(err);
      return this.fallback.get(key);
    }
  }

  /**
   * Sets a cached value in Redis or fallback with TTL in seconds.
   * @param {string} key
   * @param {string} value
   * @param {number} [ttlSeconds=0]
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = 0) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    // Keep fallback in sync
    this.fallback.set(key, serialized, ttlSeconds);

    if (this.isDegraded || !this.client) {
      return;
    }

    try {
      if (ttlSeconds > 0) {
        await this.client.set(key, serialized, { EX: ttlSeconds });
      } else {
        await this.client.set(key, serialized);
      }
    } catch (err) {
      this._handleError(err);
    }
  }

  /**
   * Deletes a cached key.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async del(key) {
    this.fallback.del(key);

    if (this.isDegraded || !this.client) {
      return true;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      this._handleError(err);
      return true;
    }
  }

  /**
   * Returns cache metrics.
   * @returns {{ hits: number, misses: number, size: number, maxEntries: number, isDegraded: boolean }}
   */
  stats() {
    return {
      ...this.fallback.stats(),
      isDegraded: this.isDegraded
    };
  }

  /**
   * Clears cache entries.
   * @returns {Promise<void>}
   */
  async clear() {
    this.fallback.clear();
    if (!this.isDegraded && this.client) {
      try {
        await this.client.flushAll();
      } catch (err) {
        this._handleError(err);
      }
    }
  }

  /**
   * Closes Redis client on server shutdown.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client && typeof this.client.quit === 'function') {
      try {
        await this.client.quit();
      } catch {
        // Disconnect silently
      }
    }
  }
}

module.exports = RedisCache;
