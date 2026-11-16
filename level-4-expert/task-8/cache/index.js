/**
 * cache/index.js
 * Cache factory module: initializes MemoryCache or RedisCache based on environment/options.
 */

'use strict';

const MemoryCache = require('./MemoryCache');
const RedisCache = require('./RedisCache');

/**
 * Creates and returns the appropriate cache provider.
 * @param {Object} [options={}]
 * @param {string} [options.redisUrl] - Optional Redis connection URL
 * @param {number} [options.maxEntries] - Max entries for memory cache
 * @param {Function} [options.clock] - Clock function
 * @param {Object} [options.redisClient] - Pre-initialized Redis client for tests
 * @param {Function} [options.logger] - Error logging handler
 * @returns {MemoryCache|RedisCache}
 */
function createCache(options = {}) {
  const redisUrl = options.redisUrl !== undefined ? options.redisUrl : process.env.REDIS_URL;

  if (redisUrl || options.redisClient) {
    return new RedisCache({
      redisUrl,
      client: options.redisClient,
      clock: options.clock,
      logger: options.logger
    });
  }

  return new MemoryCache({
    maxEntries: options.maxEntries || 500,
    clock: options.clock
  });
}

module.exports = {
  createCache,
  MemoryCache,
  RedisCache
};
