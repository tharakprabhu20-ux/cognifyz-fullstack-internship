/**
 * store/userStore.memory.js
 * In-memory user data store for isolated testing and development.
 * Conforms to the identical asynchronous userStore interface as userStore.mongo.js.
 */

'use strict';

const crypto = require('crypto');

class MemoryUserStore {
  constructor() {
    this.users = [];
  }

  /**
   * Resets the store with optional seed data.
   * @param {Array} [seedUsers]
   */
  async reset(seedUsers = []) {
    this.users = seedUsers.map(u => ({ ...u }));
  }

  /**
   * Creates a new user record.
   * @param {Object} userData
   * @param {string} userData.name
   * @param {string} userData.email
   * @param {string} [userData.passwordHash]
   * @param {string} [userData.provider='local']
   * @param {string} [userData.providerId=null]
   * @returns {Promise<Object>} Safe user object (without passwordHash)
   */
  async create({ name, email, passwordHash = null, provider = 'local', providerId = null }) {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const newUser = {
      id: crypto.randomBytes(12).toString('hex'), // 24-char hex string matching ObjectId format
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: passwordHash || null,
      provider,
      providerId: providerId ? String(providerId) : null,
      createdAt: now
    };

    this.users.push(newUser);

    // Return safe projection
    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      provider: newUser.provider,
      providerId: newUser.providerId,
      createdAt: newUser.createdAt
    };
  }

  /**
   * Finds a user by email address (for login authentication).
   * @param {string} email
   * @returns {Promise<Object|null>} Includes passwordHash for credential verification
   */
  async findByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.users.find(u => u.email.toLowerCase() === normalizedEmail);
    return user ? { ...user } : null;
  }

  /**
   * Finds a user by provider and providerId (for OAuth authentication).
   * @param {string} provider - e.g. 'github'
   * @param {string|number} providerId - e.g. '12345678'
   * @returns {Promise<Object|null>}
   */
  async findByProvider(provider, providerId) {
    if (!provider || !providerId) return null;
    const user = this.users.find(u => u.provider === provider && String(u.providerId) === String(providerId));
    return user ? { ...user } : null;
  }

  /**
   * Finds a user by unique ID.
   * @param {string} id
   * @returns {Promise<Object|null>} Safe user object (without passwordHash)
   */
  async findById(id) {
    const user = this.users.find(u => u.id === String(id));
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      provider: user.provider,
      providerId: user.providerId,
      createdAt: user.createdAt
    };
  }
}

module.exports = new MemoryUserStore();
