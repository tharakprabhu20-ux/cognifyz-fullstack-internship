/**
 * cache/MemoryCache.js
 * In-memory Least Recently Used (LRU) cache with per-item TTL,
 * lazy expiration, and an injectable clock for precise test control.
 */

'use strict';

class MemoryCache {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxEntries=500] - Maximum cache capacity before LRU eviction
   * @param {Function} [options.clock=Date.now] - Injectable millisecond timestamp clock
   */
  constructor({ maxEntries = 500, clock = () => Date.now() } = {}) {
    this.maxEntries = Math.max(1, maxEntries);
    this.clock = clock;
    this.store = new Map(); // Preserves insertion/recency order
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Retrieves a cached value.
   * If expired, lazily deletes the entry and counts as a miss.
   * If valid, updates LRU recency and counts as a hit.
   * @param {string} key
   * @returns {string|null} Serialized cached value or null
   */
  get(key) {
    if (!this.store.has(key)) {
      this.misses++;
      return null;
    }

    const entry = this.store.get(key);
    const now = this.clock();

    // Check lazy expiration
    if (entry.expiresAt !== null && now >= entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    // Refresh LRU recency by re-inserting at the end of the Map
    this.store.delete(key);
    this.store.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Stores a value in cache with a TTL (in seconds).
   * Evicts the Least Recently Used item if the cache is at capacity.
   * @param {string} key
   * @param {string} value - Serialized string payload
   * @param {number} [ttlSeconds=0] - Time to live in seconds (0 = no expiry)
   */
  set(key, value, ttlSeconds = 0) {
    const now = this.clock();
    const expiresAt = ttlSeconds > 0 ? now + (ttlSeconds * 1000) : null;

    // If key already exists, delete it so re-insertion places it at the most recent end
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict Least Recently Used (first key in Map iterator)
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
      }
    }

    this.store.set(key, {
      value: typeof value === 'string' ? value : JSON.stringify(value),
      expiresAt
    });
  }

  /**
   * Removes an entry from the cache.
   * @param {string} key
   * @returns {boolean}
   */
  del(key) {
    return this.store.delete(key);
  }

  /**
   * Returns cache metrics (counts only, no sensitive values).
   * @returns {{ hits: number, misses: number, size: number, maxEntries: number }}
   */
  stats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      maxEntries: this.maxEntries
    };
  }

  /**
   * Clears all entries and resets metric counters.
   */
  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = MemoryCache;
