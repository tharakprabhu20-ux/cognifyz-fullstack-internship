/**
 * store/userStore.mongo.js
 * Production MongoDB/Mongoose-backed user data store.
 * Conforms to the identical asynchronous userStore interface as userStore.memory.js.
 */

const User = require('../models/User');

class MongoUserStore {
  /**
   * Creates a new user in MongoDB.
   * @param {Object} userData
   * @param {string} userData.name
   * @param {string} userData.email
   * @param {string} userData.passwordHash
   * @returns {Promise<Object>} Safe user object (without passwordHash)
   */
  async create({ name, email, passwordHash }) {
    const user = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash
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
