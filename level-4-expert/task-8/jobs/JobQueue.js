/**
 * jobs/JobQueue.js
 * In-memory resilient background job processing queue.
 *
 * Features:
 * - Configurable concurrency control (default 2)
 * - Explicit job state machine: queued -> running -> succeeded | failed
 * - Automatic retries with exponential backoff
 * - Per-job timeout protection
 * - Bounded queue length with 503 rejection on overload
 * - Granular progress tracking (0-100%)
 * - TTL-based result retention and automatic pruning
 * - Process crash isolation: throwing job handlers never crash the server
 * - Injectable scheduler and clock for deterministic, fast-forward testing
 * - BullMQ/Redis-compatible queue interface design
 */

'use strict';

const crypto = require('crypto');

class QueueFullError extends Error {
  constructor(message = 'Task queue capacity exceeded') {
    super(message);
    this.name = 'QueueFullError';
    this.status = 503;
    this.code = 'SERVICE_UNAVAILABLE';
  }
}

class JobQueue {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.concurrency=2] - Max parallel active jobs
   * @param {number} [options.maxQueueLength=100] - Max queued items before 503 rejection
   * @param {number} [options.jobTtlMs=3600000] - Result retention duration (1 hour default)
   * @param {number} [options.defaultTimeoutMs=30000] - Default job execution timeout (30s)
   * @param {number} [options.defaultRetries=3] - Maximum retry attempts per job
   * @param {number} [options.backoffBaseMs=100] - Base delay for exponential backoff (ms)
   * @param {Function} [options.clock=Date.now] - Injectable millisecond clock
   * @param {Object} [options.scheduler] - Injectable timer scheduler
   */
  constructor({
    concurrency = 2,
    maxQueueLength = 100,
    jobTtlMs = 60 * 60 * 1000,
    defaultTimeoutMs = 30 * 1000,
    defaultRetries = 3,
    backoffBaseMs = 100,
    clock = () => Date.now(),
    scheduler = {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id)
    }
  } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.maxQueueLength = Math.max(1, maxQueueLength);
    this.jobTtlMs = Math.max(1000, jobTtlMs);
    this.defaultTimeoutMs = Math.max(100, defaultTimeoutMs);
    this.defaultRetries = Math.max(0, defaultRetries);
    this.backoffBaseMs = Math.max(1, backoffBaseMs);
    this.clock = clock;
    this.scheduler = scheduler;

    this.jobs = new Map(); // jobId -> Job
    this.waitingQueue = []; // array of jobs in 'queued' state
    this.runningCount = 0;
    this.handlers = new Map(); // type -> handlerFunction
    this.isPaused = false;
    this.drainResolvers = [];
  }

  /**
   * Registers a job processor handler for a specific job type.
   * @param {string} type
   * @param {Function} handler - async (job, { updateProgress }) => result
   */
  define(type, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for job type "${type}" must be a function`);
    }
    this.handlers.set(type, handler);
  }

  /**
   * Enqueues a job for background processing.
   * @param {string} type - Job identifier
   * @param {any} data - Job payload
   * @param {Object} [options={}]
   * @param {string} [options.userId] - Authenticated owner ID
   * @param {number} [options.retries] - Maximum retries
   * @param {number} [options.timeoutMs] - Timeout in milliseconds
   * @returns {Object} Enqueued job metadata
   */
  enqueue(type, data, options = {}) {
    this.prune();

    if (this.waitingQueue.length >= this.maxQueueLength) {
      throw new QueueFullError('Task queue capacity reached; please retry later.');
    }

    const id = crypto.randomUUID();
    const now = this.clock();

    const job = {
      id,
      type,
      data,
      userId: options.userId ? String(options.userId) : null,
      state: 'queued', // queued | running | succeeded | failed
      progress: 0,
      result: null,
      error: null,
      attempts: 0,
      maxRetries: options.retries !== undefined ? Math.max(0, options.retries) : this.defaultRetries,
      timeoutMs: options.timeoutMs !== undefined ? Math.max(100, options.timeoutMs) : this.defaultTimeoutMs,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: null
    };

    this.jobs.set(id, job);
    this.waitingQueue.push(job);

    // Asynchronously dispatch work to keep enqueue non-blocking
    this.scheduler.setTimeout(() => this._processNext(), 0);

    return job;
  }

  /**
   * Retrieves a job by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getJob(id) {
    this.prune();
    return this.jobs.get(id) || null;
  }

  /**
   * Updates progress of an active job (0 to 100).
   * @param {string} id
   * @param {number} percent
   */
  updateProgress(id, percent) {
    const job = this.jobs.get(id);
    if (job && job.state === 'running') {
      job.progress = Math.max(0, Math.min(100, Math.round(percent)));
    }
  }

  /**
   * Internal scheduler loop: picks queued jobs up to available concurrency slots.
   */
  _processNext() {
    if (this.isPaused) {
      return;
    }

    while (this.runningCount < this.concurrency && this.waitingQueue.length > 0) {
      const job = this.waitingQueue.shift();
      if (!job || job.state !== 'queued') {
        continue;
      }

      this.runningCount++;
      this._runJob(job);
    }

    this._checkDrain();
  }

  /**
   * Executes a single job with timeout and retry protection.
   * @param {Object} job
   */
  async _runJob(job) {
    job.state = 'running';
    job.startedAt = this.clock();
    job.attempts++;

    const handler = this.handlers.get(job.type);

    if (!handler) {
      this._handleFailure(job, new Error(`No registered handler found for job type: ${job.type}`));
      return;
    }

    let timeoutId = null;
    let timedOut = false;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = this.scheduler.setTimeout(() => {
        timedOut = true;
        reject(new Error(`Job timed out after ${job.timeoutMs}ms`));
      }, job.timeoutMs);
    });

    try {
      const execPromise = (async () => {
        return handler(job, {
          updateProgress: (pct) => this.updateProgress(job.id, pct)
        });
      })();

      const result = await Promise.race([
        execPromise,
        timeoutPromise
      ]);

      if (timeoutId !== null) {
        this.scheduler.clearTimeout(timeoutId);
      }

      // Success transition
      job.state = 'succeeded';
      job.progress = 100;
      job.result = result;
      job.completedAt = this.clock();
      job.expiresAt = this.clock() + this.jobTtlMs;
      job.error = null;

      this.runningCount--;
      this._processNext();
    } catch (err) {
      if (timeoutId !== null) {
        this.scheduler.clearTimeout(timeoutId);
      }
      this._handleFailure(job, err);
    }
  }

  /**
   * Evaluates job retry policy or transitions to failed state.
   * @param {Object} job
   * @param {Error} err
   */
  _handleFailure(job, err) {
    const errorMessage = err?.message || 'Job execution error';
    job.error = errorMessage;

    if (job.attempts <= job.maxRetries) {
      // Exponential backoff delay calculation
      const backoffDelay = this.backoffBaseMs * Math.pow(2, job.attempts - 1);
      job.state = 'queued';

      this.runningCount--;
      this.scheduler.setTimeout(() => {
        // Enqueue again if not already in waitingQueue
        if (!this.waitingQueue.includes(job)) {
          this.waitingQueue.push(job);
        }
        this._processNext();
      }, backoffDelay);

      this._processNext();
    } else {
      // Terminal failure
      job.state = 'failed';
      job.completedAt = this.clock();
      job.expiresAt = this.clock() + this.jobTtlMs;

      this.runningCount--;
      this._processNext();
    }
  }

  /**
   * Prunes jobs that have surpassed their TTL retention window.
   */
  prune() {
    const now = this.clock();
    for (const [id, job] of this.jobs.entries()) {
      if (job.expiresAt !== null && now >= job.expiresAt) {
        this.jobs.delete(id);
      }
    }
  }

  /**
   * Returns snapshot metrics of current queue activity.
   * @returns {{ queued: number, running: number, succeeded: number, failed: number, total: number }}
   */
  getStats() {
    this.prune();
    let succeeded = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (job.state === 'succeeded') succeeded++;
      else if (job.state === 'failed') failed++;
    }

    return {
      queued: this.waitingQueue.length,
      running: this.runningCount,
      succeeded,
      failed,
      total: this.jobs.size
    };
  }

  /**
   * Drains the queue until all active and queued jobs complete, or until timeout.
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<void>}
   */
  drain(timeoutMs = 5000) {
    if (this.runningCount === 0 && this.waitingQueue.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let timer = null;
      const onDrain = () => {
        if (timer) this.scheduler.clearTimeout(timer);
        resolve();
      };

      this.drainResolvers.push(onDrain);

      timer = this.scheduler.setTimeout(() => {
        // Timeout expired: remove resolver and resolve to prevent hanging
        const idx = this.drainResolvers.indexOf(onDrain);
        if (idx !== -1) {
          this.drainResolvers.splice(idx, 1);
        }
        resolve();
      }, timeoutMs);
    });
  }

  _checkDrain() {
    if (this.runningCount === 0 && this.waitingQueue.length === 0 && this.drainResolvers.length > 0) {
      const resolvers = [...this.drainResolvers];
      this.drainResolvers = [];
      for (const res of resolvers) {
        res();
      }
    }
  }

  /**
   * Empties the queue and resets state.
   */
  clear() {
    this.waitingQueue = [];
    this.jobs.clear();
    this.runningCount = 0;
    this.isPaused = false;
  }
}

module.exports = {
  JobQueue,
  QueueFullError
};
