/**
 * store/taskStore.memory.js
 * In-memory task data store for tests and development.
 * Conforms to the identical asynchronous taskStore interface as taskStore.mongo.js.
 * All task operations are strictly scoped to the authenticated owner.
 */

const crypto = require('crypto');

// Priority rank mapping for sorting
const PRIORITY_RANK = {
  low: 1,
  medium: 2,
  high: 3
};

class MemoryTaskStore {
  constructor() {
    this.tasks = [];
  }

  /**
   * Resets the store with optional seed data.
   * @param {Array} [seedData]
   */
  async reset(seedData = []) {
    this.tasks = seedData.map(t => ({ ...t }));
  }

  /**
   * Retrieves paginated tasks matching search/filter/sort criteria, strictly scoped to ownerId.
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
    // Strictly isolate tasks owned by the requesting user
    let result = this.tasks.filter(t => t.owner === String(ownerId));

    // Filter by status (todo, in-progress, done)
    if (status) {
      result = result.filter(t => t.status === status);
    }

    // Filter by priority (low, medium, high)
    if (priority) {
      result = result.filter(t => t.priority === priority);
    }

    // Case-insensitive text search across title and description
    if (search && typeof search === 'string') {
      const q = search.trim().toLowerCase();
      if (q) {
        result = result.filter(t =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q))
        );
      }
    }

    // Sorting
    const sortOrder = order && order.toLowerCase() === 'desc' ? -1 : 1;
    if (sort) {
      const sortField = sort.toLowerCase();
      result.sort((a, b) => {
        if (sortField === 'priority') {
          const rankA = PRIORITY_RANK[a.priority] || 0;
          const rankB = PRIORITY_RANK[b.priority] || 0;
          return (rankA - rankB) * sortOrder;
        }

        if (sortField === 'duedate') {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate) * sortOrder;
        }

        if (sortField === 'createdat') {
          return a.createdAt.localeCompare(b.createdAt) * sortOrder;
        }

        return 0;
      });
    } else {
      // Default sort by createdAt descending
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // Pagination calculations
    const total = result.length;
    const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);
    const totalPages = total === 0 ? 0 : Math.ceil(total / sanitizedLimit);

    const startIndex = (sanitizedPage - 1) * sanitizedLimit;
    const paginatedTasks = result.slice(startIndex, startIndex + sanitizedLimit);

    return {
      data: paginatedTasks.map(t => ({ ...t })),
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
    const task = this.tasks.find(t => t.id === String(id) && t.owner === String(ownerId));
    return task ? { ...task } : null;
  }

  /**
   * Creates a new task scoped to ownerId.
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object>}
   */
  async create(data, ownerId) {
    const now = new Date().toISOString();
    const newTask = {
      id: crypto.randomBytes(12).toString('hex'), // 24-char hex string matching ObjectId format
      title: data.title.trim(),
      description: data.description !== undefined && data.description !== null ? String(data.description).trim() : '',
      status: data.status || 'todo',
      priority: data.priority || 'medium',
      dueDate: data.dueDate || null,
      owner: String(ownerId),
      createdAt: now,
      updatedAt: now
    };

    this.tasks.push(newTask);
    return { ...newTask };
  }

  /**
   * Full replacement (PUT) of a task's editable fields, scoped to ownerId.
   * @param {string} id
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object|null>}
   */
  async update(id, data, ownerId) {
    const index = this.tasks.findIndex(t => t.id === String(id) && t.owner === String(ownerId));
    if (index === -1) {
      return null;
    }

    const existing = this.tasks[index];
    const now = new Date().toISOString();

    const updatedTask = {
      id: existing.id,
      title: data.title.trim(),
      description: data.description !== undefined && data.description !== null ? String(data.description).trim() : '',
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate || null,
      owner: existing.owner,
      createdAt: existing.createdAt,
      updatedAt: now
    };

    this.tasks[index] = updatedTask;
    return { ...updatedTask };
  }

  /**
   * Partial update (PATCH) of a task's editable fields, scoped to ownerId.
   * @param {string} id
   * @param {Object} data
   * @param {string} ownerId
   * @returns {Promise<Object|null>}
   */
  async patch(id, data, ownerId) {
    const index = this.tasks.findIndex(t => t.id === String(id) && t.owner === String(ownerId));
    if (index === -1) {
      return null;
    }

    const existing = this.tasks[index];
    const now = new Date().toISOString();

    const patchedTask = {
      ...existing,
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && { description: String(data.description).trim() }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate || null }),
      id: existing.id,
      owner: existing.owner,
      createdAt: existing.createdAt,
      updatedAt: now
    };

    this.tasks[index] = patchedTask;
    return { ...patchedTask };
  }

  /**
   * Deletes a task by ID, scoped to ownerId.
   * @param {string} id
   * @param {string} ownerId
   * @returns {Promise<boolean>} true if deleted, false if not found
   */
  async delete(id, ownerId) {
    const index = this.tasks.findIndex(t => t.id === String(id) && t.owner === String(ownerId));
    if (index === -1) {
      return false;
    }
    this.tasks.splice(index, 1);
    return true;
  }
}

module.exports = new MemoryTaskStore();
