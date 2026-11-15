/**
 * store/taskStore.js
 * In-memory data store for tasks.
 * All task data access goes through this layer so an actual database
 * (e.g., MongoDB, PostgreSQL, SQLite) can seamlessly replace it in Task 6.
 */

// Initial seed tasks tailored for a student task manager
const INITIAL_SEED_TASKS = [
  {
    id: 1,
    title: 'Complete CS101 Web Development Assignment',
    description: 'Build a responsive portfolio page and submit the GitHub repository link.',
    status: 'in-progress',
    priority: 'high',
    dueDate: '2026-11-20',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z'
  },
  {
    id: 2,
    title: 'Review Discrete Mathematics Lecture Notes',
    description: 'Go through chapters 4 and 5 on graph theory and proof methods.',
    status: 'todo',
    priority: 'medium',
    dueDate: '2026-11-25',
    createdAt: '2026-11-11T10:30:00.000Z',
    updatedAt: '2026-11-11T10:30:00.000Z'
  },
  {
    id: 3,
    title: 'Submit Internship Weekly Progress Report',
    description: 'Summarize work completed on Level 3 Task 5 and send via portal.',
    status: 'done',
    priority: 'low',
    dueDate: '2026-11-12',
    createdAt: '2026-11-09T08:15:00.000Z',
    updatedAt: '2026-11-12T16:00:00.000Z'
  }
];

// Priority rank mapping for sorting
const PRIORITY_RANK = {
  low: 1,
  medium: 2,
  high: 3
};

class TaskStore {
  constructor() {
    this.reset();
  }

  /**
   * Resets the store with initial seed data or custom dataset.
   * Useful for test isolation.
   * @param {Array} [seedData]
   */
  reset(seedData = null) {
    const dataToLoad = seedData || INITIAL_SEED_TASKS;
    // Deep copy to prevent accidental mutations
    this.tasks = dataToLoad.map(task => ({ ...task }));
    const maxId = this.tasks.reduce((max, task) => Math.max(max, task.id), 0);
    this.nextId = maxId + 1;
  }

  /**
   * Retrieves a paginated list of tasks matching search/filter/sort criteria.
   * @param {Object} query
   * @returns {{ data: Array, meta: Object }}
   */
  getAll({ status, priority, search, sort, order = 'asc', page = 1, limit = 10 } = {}) {
    let result = [...this.tasks];

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
          // Push null/empty due dates to the end regardless of order
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
      // Default sort by id ascending if no explicit sort specified
      result.sort((a, b) => (a.id - b.id) * sortOrder);
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
   * Retrieves a single task by numeric ID.
   * @param {number} id
   * @returns {Object|null}
   */
  getById(id) {
    const numericId = Number(id);
    const task = this.tasks.find(t => t.id === numericId);
    return task ? { ...task } : null;
  }

  /**
   * Creates a new task with server-generated ID and timestamps.
   * Client-supplied ID and timestamps are ignored.
   * @param {Object} data
   * @returns {Object}
   */
  create(data) {
    const now = new Date().toISOString();
    const newTask = {
      id: this.nextId++,
      title: data.title.trim(),
      description: data.description !== undefined && data.description !== null ? String(data.description).trim() : '',
      status: data.status || 'todo',
      priority: data.priority || 'medium',
      dueDate: data.dueDate || null,
      createdAt: now,
      updatedAt: now
    };

    this.tasks.push(newTask);
    return { ...newTask };
  }

  /**
   * Full replacement (PUT) of a task's editable fields.
   * ID and createdAt remain unchanged; updatedAt is refreshed.
   * @param {number} id
   * @param {Object} data
   * @returns {Object|null}
   */
  update(id, data) {
    const numericId = Number(id);
    const index = this.tasks.findIndex(t => t.id === numericId);
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
      createdAt: existing.createdAt,
      updatedAt: now
    };

    this.tasks[index] = updatedTask;
    return { ...updatedTask };
  }

  /**
   * Partial update (PATCH) of a task's editable fields.
   * Only provided fields are updated; updatedAt is refreshed.
   * @param {number} id
   * @param {Object} data
   * @returns {Object|null}
   */
  patch(id, data) {
    const numericId = Number(id);
    const index = this.tasks.findIndex(t => t.id === numericId);
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
      createdAt: existing.createdAt,
      updatedAt: now
    };

    this.tasks[index] = patchedTask;
    return { ...patchedTask };
  }

  /**
   * Deletes a task by ID.
   * @param {number} id
   * @returns {boolean} true if deleted, false if not found
   */
  delete(id) {
    const numericId = Number(id);
    const index = this.tasks.findIndex(t => t.id === numericId);
    if (index === -1) {
      return false;
    }
    this.tasks.splice(index, 1);
    return true;
  }
}

// Export a singleton instance of TaskStore
module.exports = new TaskStore();
