/**
 * jobs/reminderScheduler.js
 * Periodic reminder scanner scheduler.
 * Runs on a configurable interval (REMINDER_INTERVAL_MINUTES),
 * uses an overlap guard (isRunning), unref()s timers so they do not block process exit,
 * and maintains an in-memory notification list capped at 50 per user.
 */

'use strict';

const crypto = require('crypto');

class ReminderScheduler {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.intervalMinutes] - Scan interval in minutes (default: 60)
   * @param {boolean} [options.enabled] - Master switch (defaults to false in test/dev unless enabled)
   * @param {Object} [options.taskStore] - Injected task store
   * @param {Object} [options.jobQueue] - Optional JobQueue instance to enqueue jobs
   * @param {Function} [options.clock=Date.now] - Clock function
   */
  constructor({
    intervalMinutes = parseInt(process.env.REMINDER_INTERVAL_MINUTES, 10) || 60,
    enabled = false,
    taskStore = null,
    jobQueue = null,
    clock = () => Date.now()
  } = {}) {
    this.intervalMinutes = Math.max(1, intervalMinutes);
    this.enabled = enabled;
    this.taskStore = taskStore;
    this.jobQueue = jobQueue;
    this.clock = clock;

    this.timer = null;
    this.isRunning = false;
    this.notificationsByUser = new Map(); // userId -> Array<Notification> (max 50)

    // Register job handler if jobQueue is provided
    if (this.jobQueue && typeof this.jobQueue.define === 'function') {
      this.jobQueue.define('reminder-scan', async () => {
        await this._performScan();
      });
    }
  }

  /**
   * Starts periodic reminder scheduler using setInterval with unref().
   */
  start() {
    if (!this.enabled || this.timer !== null) {
      return;
    }

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      this.triggerScan();
    }, intervalMs);

    // Ensure timer does not prevent Node.js process from exiting cleanly
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Stops the active scheduler interval.
   */
  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Triggers a reminder scan either by enqueuing onto JobQueue or running directly.
   */
  async triggerScan() {
    if (this.isRunning) {
      return; // Overlap guard: skip if already running
    }

    if (this.jobQueue && typeof this.jobQueue.enqueue === 'function') {
      try {
        this.jobQueue.enqueue('reminder-scan', { triggeredAt: this.clock() });
        return;
      } catch {
        // Fallback to direct scan if queue full
      }
    }

    await this._performScan();
  }

  /**
   * Directly executes a scan (useful in tests and manual invocations).
   * @param {Object} [overrideTaskStore]
   */
  async scanNow(overrideTaskStore = null) {
    const store = overrideTaskStore || this.taskStore;
    await this._performScan(store);
  }

  /**
   * Internal scanner logic: finds tasks due within 24 hours that are not done.
   * @param {Object} [store]
   */
  async _performScan(store = this.taskStore) {
    if (this.isRunning) {
      return; // Overlap guard
    }

    this.isRunning = true;
    try {
      if (!store) {
        return;
      }

      let tasks = [];
      if (typeof store.getUpcomingTasks === 'function') {
        tasks = await store.getUpcomingTasks({ withinMs: 24 * 60 * 60 * 1000, clock: this.clock });
      } else if (Array.isArray(store.tasks)) {
        const now = this.clock();
        const cutoff = now + 24 * 60 * 60 * 1000;
        tasks = store.tasks.filter((t) => {
          if (t.status === 'done' || !t.dueDate) return false;
          const dueTime = new Date(t.dueDate.includes('T') ? t.dueDate : `${t.dueDate}T23:59:59.999Z`).getTime();
          return !isNaN(dueTime) && dueTime <= cutoff;
        });
      }

      const now = this.clock();

      for (const task of tasks) {
        const ownerId = String(task.owner);
        const userList = this.notificationsByUser.get(ownerId) || [];

        // Check if a reminder for this task was already recorded
        const exists = userList.some(n => n.taskId === String(task.id));
        if (!exists) {
          userList.unshift({
            id: crypto.randomUUID(),
            taskId: String(task.id),
            title: task.title,
            dueDate: task.dueDate,
            message: `Task "${task.title}" is due soon (${task.dueDate})`,
            createdAt: new Date(now).toISOString()
          });

          // Cap notifications to maximum 50 per user
          if (userList.length > 50) {
            userList.length = 50;
          }

          this.notificationsByUser.set(ownerId, userList);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Returns list of notifications for a specific user.
   * @param {string} userId
   * @returns {Array<Object>}
   */
  getNotifications(userId) {
    if (!userId) return [];
    const list = this.notificationsByUser.get(String(userId));
    return list ? [...list] : [];
  }

  /**
   * Clears in-memory notifications (for tests).
   */
  clear() {
    this.notificationsByUser.clear();
    this.isRunning = false;
  }
}

module.exports = ReminderScheduler;
