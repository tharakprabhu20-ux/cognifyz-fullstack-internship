/**
 * store/userStore.mongo.js
 * Production MongoDB/Mongoose-backed user data store.
 * Conforms to the identical asynchronous userStore interface as userStore.memory.js.
 */

'use strict';

const User = require('../models/User');

class MongoUserStore {
  /**
   * Creates a new user in MongoDB.
   * @param {Object} userData
   * @param {string} userData.name
   * @param {string} userData.email
   * @param {string} [userData.passwordHash]
   * @param {string} [userData.provider='local']
   * @param {string} [userData.providerId=null]
   * @returns {Promise<Object>} Safe user object (without passwordHash)
   */
  async create({ name, email, passwordHash = null, provider = 'local', providerId = null }) {
    const user = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: passwordHash || undefined,
      provider: provider || 'local',
      providerId: providerId ? String(providerId) : undefined
    });
    await user.save();
    return user.toJSON();
  }

  /**
   * Finds a user by email in MongoDB.
   * @param {string} email
   * @returns {Promise<Object|null>} Includes passwordHash for verification
   */
  async findByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const user = await User.findOne({ email: email.trim().toLowerCase() }).exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      passwordHash: user.passwordHash,
      provider: user.provider,
      providerId: user.providerId,
      createdAt: user.createdAt
    };
  }

  /**
   * Finds a user by OAuth provider and providerId in MongoDB.
   * @param {string} provider
   * @param {string|number} providerId
   * @returns {Promise<Object|null>}
   */
  async findByProvider(provider, providerId) {
    if (!provider || !providerId) return null;
    const user = await User.findOne({ provider, providerId: String(providerId) }).exec();
    if (!user) return null;
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      provider: user.provider,
      providerId: user.providerId,
      createdAt: user.createdAt
    };
  }

  /**
   * Finds a user by ID in MongoDB.
   * @param {string} id
   * @returns {Promise<Object|null>} Safe user object (without passwordHash)
   */
  async findById(id) {
    const user = await User.findById(id).exec();
    return user ? user.toJSON() : null;
  }
}

module.exports = new MongoUserStore();
