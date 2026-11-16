/**
 * store/taskStore.mongo.js
 * Production MongoDB/Mongoose-backed task data store.
 * Conforms to the identical asynchronous taskStore interface as taskStore.memory.js.
 * All task queries and mutations are strictly scoped to the authenticated owner.
 */

const mongoose = require('mongoose');
const Task = require('../models/Task');

/**
 * Constructs a sanitized MongoDB query filter for tasks.
 * Restricts field types, escapes regex characters, anchors ownerId,
 * and uses per-value mongoose.trusted() so Mongoose sanitizeFilter
 * does not neutralize the regex search conditions into a CastError.
 *
 * @param {string} ownerId - Authenticated owner user ID
 * @param {Object} [query={}] - Query options (status, priority, search)
 * @returns {Object} Valid MongoDB filter object
 */
function buildTaskFilter(ownerId, { status, priority, search } = {}) {
  const filter = { owner: ownerId };

  // Strict type verification: ignore non-string inputs to prevent NoSQL operator injection
  if (status && typeof status === 'string') {
    filter.status = status;
  }

  if (priority && typeof priority === 'string') {
    filter.priority = priority;
  }

  if (search && typeof search === 'string') {
    const q = search.trim();
    if (q) {
      // Escape regex special characters so search input is strictly literal
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Per-value trusted wrapper: individual regex objects are trusted,
      // preventing Mongoose sanitizeFilter from neutralizing them into an invalid String CastError
      filter.$or = [
        { title: mongoose.trusted({ $regex: escaped, $options: 'i' }) },
        { description: mongoose.trusted({ $regex: escaped, $options: 'i' }) }
      ];
    }
  }

  return filter;
}

class MongoTaskStore {
  /**
   * Retrieves paginated tasks matching criteria, strictly scoped to ownerId.
   * @param {Object} options
   * @param {string} options.ownerId
   * @param {string} [options.status]
   * @param {string} [options.priority]
   * @param {string} [options.search]
   * @param {string} [options.sort]
   * @param {string} [options.order]
   * @param {number} [options.page]
   * @param {number} [options.limit]
   * @returns {Promise<{ data: Array, meta: Object }>}
   */
  async getAll({ ownerId, status, priority, search, sort, order = 'asc', page = 1, limit = 10 } = {}) {
    const filter = buildTaskFilter(ownerId, { status, priority, search });

    const sortOrder = order && order.toLowerCase() === 'desc' ? -1 : 1;
    let sortObj = { createdAt: -1 };

    if (sort) {
      const sortField = sort.toLowerCase();
      if (sortField === 'priority') {
        sortObj = { priority: sortOrder, createdAt: -1 };
      } else if (sortField === 'duedate') {
        sortObj = { dueDate: sortOrder, createdAt: -1 };
      } else if (sortField === 'createdat') {
        sortObj = { createdAt: sortOrder };
      }
    }

    const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);
    const total = await Task.countDocuments(filter).exec();
    const totalPages = total === 0 ? 0 : Math.ceil(total / sanitizedLimit);
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    const tasks = await Task.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(sanitizedLimit)
      .exec();

    return {
      data: tasks.map(t => t.toJSON()),
      meta: {
        total,
        page: sanitizedPage,
        limit: sanitizedLimit,
        totalPages
      }
    };
  }

  /**
   * Retrieves a single task by ID, scoped to ownerId.
   * @param {string} id
   * @param {string} ownerId
   * @returns {Promise<Object|null>}
   */
  async getById(id, ownerId) {
    const task = await Task.findOne({ _id: id, owner: ownerId }).exec();
    return task ? task.toJSON() : null;
  }

  /**
   * Creates a new task in MongoDB, scoped to ownerId.
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object>}
   */
  async create(data, ownerId) {
    const task = new Task({
      title: data.title.trim(),
      description: data.description !== undefined && data.description !== null ? String(data.description).trim() : '',
      status: data.status || 'todo',
      priority: data.priority || 'medium',
      dueDate: data.dueDate || null,
      owner: ownerId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await task.save();
    return task.toJSON();
  }

  /**
   * Full replacement (PUT) of a task, scoped to ownerId.
   * @param {string} id
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object|null>}
   */
  async update(id, data, ownerId) {
    const updated = await Task.findOneAndUpdate(
      { _id: id, owner: ownerId },
      {
        $set: {
          title: data.title.trim(),
          description: data.description !== undefined && data.description !== null ? String(data.description).trim() : '',
          status: data.status,
          priority: data.priority,
          dueDate: data.dueDate || null,
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    ).exec();

    return updated ? updated.toJSON() : null;
  }

  /**
   * Partial update (PATCH) of a task, scoped to ownerId.
   * @param {string} id
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object|null>}
   */
  async patch(id, data, ownerId) {
    const updateFields = { updatedAt: new Date() };
    if (data.title !== undefined) updateFields.title = data.title.trim();
    if (data.description !== undefined) updateFields.description = String(data.description).trim();
    if (data.status !== undefined) updateFields.status = data.status;
    if (data.priority !== undefined) updateFields.priority = data.priority;
    if (data.dueDate !== undefined) updateFields.dueDate = data.dueDate || null;

    const patched = await Task.findOneAndUpdate(
      { _id: id, owner: ownerId },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).exec();

    return patched ? patched.toJSON() : null;
  }

  /**
   * Deletes a task by ID, scoped to ownerId.
   * @param {string} id
   * @param {string} ownerId
   * @returns {Promise<boolean>}
   */
  async delete(id, ownerId) {
    const deleted = await Task.findOneAndDelete({ _id: id, owner: ownerId }).exec();
    return !!deleted;
  }

  /**
   * Retrieves non-done tasks with a due date within the specified timeframe.
   * @param {Object} [options={}]
   * @param {number} [options.withinMs=86400000]
   * @param {Function} [options.clock=Date.now]
   * @returns {Promise<Array<Object>>}
   */
  async getUpcomingTasks({ withinMs = 24 * 60 * 60 * 1000, clock = () => Date.now() } = {}) {
    const now = clock();
    const cutoff = now + withinMs;
    const docs = await Task.find({ status: { $ne: 'done' }, dueDate: { $ne: null } }).exec();
    return docs.map(d => d.toJSON()).filter((t) => {
      if (!t.dueDate) return false;
      const dueTime = new Date(t.dueDate.includes('T') ? t.dueDate : `${t.dueDate}T23:59:59.999Z`).getTime();
      return !isNaN(dueTime) && dueTime <= cutoff;
    });
  }
}

const instance = new MongoTaskStore();
instance.buildTaskFilter = buildTaskFilter;
module.exports = instance;
module.exports.buildTaskFilter = buildTaskFilter;
