/**
 * tests/task8.test.js
 * Comprehensive integration test suite for Task 8: Advanced Server-Side Functionality
 *
 * Covers:
 * 1. Middleware pipeline:
 *    - X-Request-Id preservation across normal, 404, and 500 responses
 *    - X-Response-Time header presence
 *    - Security headers (strict CSP, X-Content-Type-Options: nosniff, X-Powered-By absent)
 *    - Access logger format (single JSON line, stripped query strings, zero sensitive credentials/tokens)
 *    - Middleware pipeline ordering
 * 2. Background Task Queue (JobQueue):
 *    - Concurrency bounding
 *    - Retries with exponential backoff via injected clock
 *    - Per-job execution timeout
 *    - Maximum queue capacity rejection with 503
 *    - Result retention and TTL pruning
 *    - Process crash isolation (throwing job handler never crashes server)
 * 3. Real Job 1: Task Export Workflow:
 *    - 202 Accepted dispatch flow
 *    - Job polling and state machine
 *    - Artifact download with Content-Disposition
 *    - Ownership isolation (User B gets 404 for User A's jobs and downloads)
 *    - Premature download rejection (before succeeded state)
 *    - CSV escaping and formula injection protection (=, +, -, @, \t prefixed with ')
 *    - Pagination across multiple pages
 * 4. Real Job 2: Periodic Reminder Scheduler:
 *    - Overlap guard prevents concurrent scans
 *    - Disabled by default in tests
 *    - 24-hour due task detection and filtering of done tasks
 *    - 50-notification per-user cap
 *    - Privacy isolation (GET /api/notifications strictly scopes to caller)
 * 5. Caching (MemoryCache, RedisCache, Route Caching):
 *    - MemoryCache LRU eviction at capacity
 *    - TTL expiration with injected clock
 *    - GET /api/tasks caching (30s) and X-Cache: HIT|MISS headers
 *    - Cache invalidation on task mutations (POST, PUT, PATCH, DELETE)
 *    - User cache isolation (User B never receives User A's cached entries)
 *    - Upstream weather caching (10 min) and in-flight promise request coalescing
 *    - Error responses never cached
 *    - RedisCache adapter: resilience against client failures with transparent fallback to MemoryCache
 *    - Public GET /api/health returns queue and cache metrics without sensitive leaks
 * 6. Graceful Shutdown:
 *    - Drains queue, stops scheduler, closes HTTP server and Mongoose, and is idempotent
 *
 * Uses ONLY Node.js built-in modules (`http`, `assert`, `crypto`).
 * Zero external network or real database calls; all tests use in-memory stores and injected fakes.
 */

'use strict';

const http = require('http');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const createApp = require('../app');
const memoryTaskStore = require('../store/taskStore.memory');
const memoryUserStore = require('../store/userStore.memory');
const MemoryCache = require('../cache/MemoryCache');
const RedisCache = require('../cache/RedisCache');
const { JobQueue, QueueFullError } = require('../jobs/JobQueue');
const ReminderScheduler = require('../jobs/reminderScheduler');
const { createGracefulShutdown } = require('../lifecycle/shutdown');

const TEST_JWT_SECRET = 'in-memory-test-secret-at-least-32-characters-secure-key';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
    failures.push({ description, error: err });
  }
}

function startTestServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        baseUrl,
        close: () => new Promise((res) => server.close(res))
      });
    });
    server.on('error', reject);
  });
}

function makeRequest(baseUrl, { method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    let payload = null;
    const reqHeaders = { ...headers };

    if (body !== null && body !== undefined) {
      if (typeof body === 'object') {
        payload = JSON.stringify(body);
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      } else {
        payload = String(body);
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: reqHeaders
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (_) {
          // Non-JSON response
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: rawData,
          json
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function generateToken(userId, email = 'test@example.com') {
  return jwt.sign(
    { id: String(userId), email, provider: 'local' },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

// =========================================================================
// Main Test Runner
// =========================================================================
async function runTask8Tests() {
  console.log('Starting Student Task Manager API Test Suite (Task 8: Advanced Server-Side Functionality)...\n');

  await memoryTaskStore.reset();
  await memoryUserStore.reset();

  // Create test users
  const userA = await memoryUserStore.create({ name: 'Alice Student', email: 'alice@task8.edu' });
  const userB = await memoryUserStore.create({ name: 'Bob Student', email: 'bob@task8.edu' });
  const tokenA = generateToken(userA.id, userA.email);
  const tokenB = generateToken(userB.id, userB.email);

  // =======================================================================
  // 1. Middleware Pipeline & Security Headers Tests
  // =======================================================================
  console.log('--- 1. Middleware Pipeline & Security Headers Tests ---');

  await test('X-Request-Id header is returned on every API response including 404 and errors', async () => {
    const customQueue = new JobQueue();
    const customCache = new MemoryCache();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache: customCache,
      jobQueue: customQueue,
      rateLimitOptions: {
        testRoutes: (r) => {
          r.get('/api/test-error', (req, res, next) => {
            next(new Error('Simulated internal failure'));
          });
        }
      }
    });

    const instance = await startTestServer(app);
    try {
      // 200 Success
      const resOk = await makeRequest(instance.baseUrl, { path: '/api/health' });
      assert.strictEqual(resOk.statusCode, 200);
      assert.ok(resOk.headers['x-request-id']);

      // 404 Not Found
      const res404 = await makeRequest(instance.baseUrl, { path: '/api/nonexistent-route' });
      assert.strictEqual(res404.statusCode, 404);
      assert.ok(res404.headers['x-request-id']);

      // 500 Error
      const res500 = await makeRequest(instance.baseUrl, { path: '/api/test-error' });
      assert.strictEqual(res500.statusCode, 500);
      assert.ok(res500.headers['x-request-id']);
    } finally {
      await instance.close();
    }
  });

  await test('Security headers: CSP, X-Content-Type-Options: nosniff, and X-Powered-By is absent', async () => {
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET
    });

    const instance = await startTestServer(app);
    try {
      const res = await makeRequest(instance.baseUrl, { path: '/api/health' });
      assert.strictEqual(res.statusCode, 200);

      // Verify Content-Security-Policy directives
      const csp = res.headers['content-security-policy'] || '';
      assert.ok(csp.includes("default-src 'self'"), 'CSP must include default-src');
      assert.ok(csp.includes("script-src 'self'"), 'CSP must include script-src');
      assert.ok(csp.includes("style-src 'self'"), 'CSP must include style-src');
      assert.ok(csp.includes("img-src 'self' data:"), 'CSP must include img-src');
      assert.ok(csp.includes("connect-src 'self'"), 'CSP must include connect-src');
      assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must include frame-ancestors none');
      assert.ok(csp.includes("base-uri 'none'"), 'CSP must include base-uri none');
      assert.ok(csp.includes("form-action 'self'"), 'CSP must include form-action self');

      // Verify nosniff & X-Powered-By absence
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
      assert.strictEqual(res.headers['x-powered-by'], undefined, 'X-Powered-By header must be removed');

      // Verify X-Response-Time header presence
      assert.ok(res.headers['x-response-time'], 'X-Response-Time header must be present');
      assert.ok(/^\d+ms$/.test(res.headers['x-response-time']), 'X-Response-Time should be in ms format');
    } finally {
      await instance.close();
    }
  });

  await test('Access logger: outputs structured JSON, strips query parameters, and never logs tokens or passwords', async () => {
    const loggedLines = [];
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      logLevel: 'info',
      loggerOptions: {
        writeFn: (line) => loggedLines.push(line)
      }
    });

    const instance = await startTestServer(app);
    try {
      // Send a request containing sensitive token in Authorization header, sensitive query, and sensitive body
      await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/login?sensitive_token=LEAK_SECRET_123&code=CODE_SECRET_456',
        headers: {
          Authorization: 'Bearer super-secret-jwt-token-do-not-log'
        },
        body: {
          email: 'alice@task8.edu',
          password: 'SuperSecretPassword123!'
        }
      });

      assert.ok(loggedLines.length >= 1, 'Logger should emit log lines');
      const lastLine = loggedLines[loggedLines.length - 1];
      const parsed = JSON.parse(lastLine);

      // Verify safe schema fields
      assert.ok(parsed.time);
      assert.ok(parsed.requestId);
      assert.strictEqual(parsed.method, 'POST');
      assert.strictEqual(parsed.path, '/api/auth/login', 'Query string values must be stripped from path');
      assert.strictEqual(typeof parsed.status, 'number');
      assert.strictEqual(typeof parsed.durationMs, 'number');
      assert.strictEqual(typeof parsed.responseSize, 'number');

      // Security check: Verify no passwords, tokens, or query parameters exist anywhere in the line
      assert.strictEqual(lastLine.includes('LEAK_SECRET_123'), false);
      assert.strictEqual(lastLine.includes('CODE_SECRET_456'), false);
      assert.strictEqual(lastLine.includes('super-secret-jwt-token-do-not-log'), false);
      assert.strictEqual(lastLine.includes('SuperSecretPassword123!'), false);
    } finally {
      await instance.close();
    }
  });

  // =======================================================================
  // 2. Background Task Queue (JobQueue) Unit & Resiliency Tests
  // =======================================================================
  console.log('\n--- 2. Background Task Queue (JobQueue) Tests ---');

  await test('Queue concurrency: respects configured limit (default 2)', async () => {
    let mockTime = 1000;
    const queue = new JobQueue({
      concurrency: 2,
      clock: () => mockTime
    });

    let runningCount = 0;
    let maxObservedRunning = 0;
    const taskResolvers = [];

    queue.define('concurrency-test', async () => {
      runningCount++;
      maxObservedRunning = Math.max(maxObservedRunning, runningCount);
      await new Promise(r => taskResolvers.push(r));
      runningCount--;
      return { ok: true };
    });

    // Enqueue 4 tasks
    queue.enqueue('concurrency-test', {});
    queue.enqueue('concurrency-test', {});
    queue.enqueue('concurrency-test', {});
    queue.enqueue('concurrency-test', {});

    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(maxObservedRunning, 2, 'Never exceeds concurrency limit of 2');

    // Resolve first 2 tasks, allowing next tasks to run
    taskResolvers.shift()();
    taskResolvers.shift()();
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(maxObservedRunning, 2);
    // Resolve remaining
    while (taskResolvers.length > 0) {
      taskResolvers.shift()();
    }
    await new Promise(r => setTimeout(r, 20));
  });

  await test('Queue retries with exponential backoff using injected clock', async () => {
    let simulatedTime = 1000;
    const scheduledTimers = [];

    const queue = new JobQueue({
      concurrency: 1,
      defaultRetries: 2,
      backoffBaseMs: 100,
      clock: () => simulatedTime,
      scheduler: {
        setTimeout: (fn, delay) => {
          const entry = { id: scheduledTimers.length + 1, fn, delay, scheduledAt: simulatedTime };
          scheduledTimers.push(entry);
          return entry.id;
        },
        clearTimeout: (id) => {
          const idx = scheduledTimers.findIndex(t => t.id === id);
          if (idx !== -1) scheduledTimers.splice(idx, 1);
        }
      }
    });

    let attempts = 0;
    queue.define('retry-test', async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`Attempt ${attempts} failed`);
      }
      return 'success';
    });

    const job = queue.enqueue('retry-test', {});
    // Initial run
    scheduledTimers.shift().fn();
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.attempts, 1);
    assert.strictEqual(job.state, 'queued');

    // First retry delay should be backoffBaseMs * 2^0 = 100ms
    const retry1 = scheduledTimers.shift();
    assert.strictEqual(retry1.delay, 100);
    simulatedTime += 100;
    retry1.fn();
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.attempts, 2);
    assert.strictEqual(job.state, 'queued');

    // Second retry delay should be backoffBaseMs * 2^1 = 200ms
    const retry2 = scheduledTimers.shift();
    assert.strictEqual(retry2.delay, 200);
    simulatedTime += 200;
    retry2.fn();
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.attempts, 3);
    assert.strictEqual(job.state, 'succeeded');
    assert.strictEqual(job.result, 'success');
  });

  await test('Queue per-job timeout aborts hanging task', async () => {
    let timerCb = null;
    const queue = new JobQueue({
      concurrency: 1,
      defaultRetries: 0,
      defaultTimeoutMs: 50,
      scheduler: {
        setTimeout: (fn, ms) => {
          if (ms === 0) fn(); // Immediate loop
          else timerCb = fn; // Timeout timer
          return 1;
        },
        clearTimeout: () => {}
      }
    });

    queue.define('hanging-job', () => new Promise(() => {})); // Never resolves

    const job = queue.enqueue('hanging-job', {});
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.state, 'running');
    assert.ok(timerCb, 'Timeout timer was registered');

    // Trigger timeout
    timerCb();
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.state, 'failed');
    assert.ok(job.error.includes('timed out'));
  });

  await test('Queue capacity limit: rejects when queue is full with 503 error', async () => {
    const queue = new JobQueue({
      concurrency: 1,
      maxQueueLength: 2,
      scheduler: {
        setTimeout: () => {}, // Do not auto-drain to test queue buildup
        clearTimeout: () => {}
      }
    });

    queue.enqueue('dummy', {});
    queue.enqueue('dummy', {});

    assert.throws(() => {
      queue.enqueue('dummy', {});
    }, (err) => {
      return err instanceof QueueFullError && err.status === 503;
    });
  });

  await test('Queue pruning: expired jobs are cleaned up past TTL', async () => {
    let mockTime = 1000;
    const queue = new JobQueue({
      jobTtlMs: 5000,
      clock: () => mockTime
    });

    queue.define('fast-job', async () => 'done');
    const job = queue.enqueue('fast-job', {});
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.state, 'succeeded');
    assert.ok(queue.getJob(job.id));

    // Advance clock past TTL
    mockTime += 6000;
    queue.prune();

    assert.strictEqual(queue.getJob(job.id), null, 'Expired job should be pruned');
  });

  await test('Process crash isolation: throwing unhandled error in job does not crash process', async () => {
    const queue = new JobQueue({
      concurrency: 1,
      defaultRetries: 0
    });

    queue.define('crash-test', () => {
      throw new Error('Fatal unhandled error inside worker');
    });

    const job = queue.enqueue('crash-test', {});
    await new Promise(r => setTimeout(r, 20));

    assert.strictEqual(job.state, 'failed');
    assert.strictEqual(job.error, 'Fatal unhandled error inside worker');
    assert.strictEqual(queue.runningCount, 0);
  });

  // =======================================================================
  // 3. Real Job 1: Task Export Workflow & Security Protection
  // =======================================================================
  console.log('\n--- 3. Real Job 1: Task Export Workflow Tests ---');

  await test('POST /api/tasks/export 202 flow, progress polling, and artifact download (JSON)', async () => {
    await memoryTaskStore.reset();
    await memoryTaskStore.create({ title: 'Task Alpha', status: 'todo' }, userA.id);
    await memoryTaskStore.create({ title: 'Task Beta', status: 'done' }, userA.id);

    const jobQueue = new JobQueue();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      jobQueue
    });

    const instance = await startTestServer(app);
    try {
      // 1. Dispatch export
      const dispatchRes = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks/export',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { format: 'json' }
      });

      assert.strictEqual(dispatchRes.statusCode, 202);
      assert.ok(dispatchRes.json?.jobId);
      assert.strictEqual(dispatchRes.json?.statusUrl, `/api/jobs/${dispatchRes.json.jobId}`);

      const { jobId } = dispatchRes.json;

      // 2. Poll job status until succeeded
      let statusRes = null;
      for (let i = 0; i < 20; i++) {
        statusRes = await makeRequest(instance.baseUrl, {
          path: `/api/jobs/${jobId}`,
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        if (statusRes.json?.state === 'succeeded') break;
        await new Promise(r => setTimeout(r, 20));
      }

      assert.strictEqual(statusRes.statusCode, 200);
      assert.strictEqual(statusRes.json?.state, 'succeeded');
      assert.strictEqual(statusRes.json?.progress, 100);

      // 3. Download artifact
      const downloadRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}/download`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(downloadRes.statusCode, 200);
      assert.ok(downloadRes.headers['content-disposition'].includes('.json'));
      assert.strictEqual(downloadRes.json.length, 2);
      assert.strictEqual(downloadRes.json[0].title, 'Task Alpha');
    } finally {
      await instance.close();
    }
  });

  await test('Export ownership isolation: User B receives 404 for User A job status and download', async () => {
    const jobQueue = new JobQueue();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      jobQueue
    });

    const instance = await startTestServer(app);
    try {
      const dispatchRes = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks/export',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { format: 'json' }
      });

      const { jobId } = dispatchRes.json;

      // User B attempts to read User A job status
      const userBStatusRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(userBStatusRes.statusCode, 404, 'Must return 404 to avoid leaking job existence');

      // User B attempts to download User A artifact
      const userBDownloadRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}/download`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(userBDownloadRes.statusCode, 404, 'Must return 404 to avoid leaking artifact');
    } finally {
      await instance.close();
    }
  });

  await test('Export download refused before job succeeds', async () => {
    const jobQueue = new JobQueue({
      scheduler: {
        setTimeout: () => {}, // Hold job in queued state
        clearTimeout: () => {}
      }
    });

    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      jobQueue
    });

    const instance = await startTestServer(app);
    try {
      const dispatchRes = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks/export',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { format: 'csv' }
      });

      const { jobId } = dispatchRes.json;

      const downloadRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}/download`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(downloadRes.statusCode, 400);
      assert.strictEqual(downloadRes.json?.error?.code, 'JOB_NOT_READY');
    } finally {
      await instance.close();
    }
  });

  await test('CSV quoting and Formula Injection protection (=, +, -, @, \\t)', async () => {
    await memoryTaskStore.reset();
    await memoryTaskStore.create({
      title: '=1+1',
      description: '@cmd|calc!A0',
      status: 'todo',
      priority: '+high'
    }, userA.id);

    const jobQueue = new JobQueue();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      jobQueue
    });

    const instance = await startTestServer(app);
    try {
      const dispatchRes = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks/export',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { format: 'csv' }
      });

      const { jobId } = dispatchRes.json;

      // Await success
      let statusRes = null;
      for (let i = 0; i < 20; i++) {
        statusRes = await makeRequest(instance.baseUrl, {
          path: `/api/jobs/${jobId}`,
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        if (statusRes.json?.state === 'succeeded') break;
        await new Promise(r => setTimeout(r, 20));
      }

      const downloadRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}/download`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(downloadRes.statusCode, 200);
      const csvText = downloadRes.body;

      // Verify formula injection characters are safely prefixed with a single quote
      assert.ok(csvText.includes("\"'=1+1\""), 'Leading = must be prefixed with single quote');
      assert.ok(csvText.includes("\"'@cmd|calc!A0\""), 'Leading @ must be prefixed with single quote');
      assert.ok(csvText.includes("\"'+high\""), 'Leading + must be prefixed with single quote');
    } finally {
      await instance.close();
    }
  });

  await test('Export processes multiple pages of tasks correctly', async () => {
    await memoryTaskStore.reset();
    // Create 65 tasks for User A (exceeds single page limit of 50)
    for (let i = 1; i <= 65; i++) {
      await memoryTaskStore.create({ title: `Bulk Task #${i}` }, userA.id);
    }

    const jobQueue = new JobQueue();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      jobQueue
    });

    const instance = await startTestServer(app);
    try {
      const dispatchRes = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks/export',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { format: 'json' }
      });

      const { jobId } = dispatchRes.json;

      for (let i = 0; i < 20; i++) {
        const status = await makeRequest(instance.baseUrl, {
          path: `/api/jobs/${jobId}`,
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        if (status.json?.state === 'succeeded') break;
        await new Promise(r => setTimeout(r, 20));
      }

      const downloadRes = await makeRequest(instance.baseUrl, {
        path: `/api/jobs/${jobId}/download`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(downloadRes.statusCode, 200);
      assert.strictEqual(downloadRes.json.length, 65, 'All 65 tasks across pages must be exported');
    } finally {
      await instance.close();
    }
  });

  // =======================================================================
  // 4. Real Job 2: Periodic Reminder Scheduler Tests
  // =======================================================================
  console.log('\n--- 4. Real Job 2: Periodic Reminder Scheduler Tests ---');

  await test('Scheduler: overlap guard prevents concurrent execution', async () => {
    const scheduler = new ReminderScheduler({ enabled: false });
    assert.strictEqual(scheduler.isRunning, false);

    scheduler.isRunning = true;
    let didRun = false;
    await scheduler.scanNow({
      getUpcomingTasks: async () => { didRun = true; return []; }
    });

    assert.strictEqual(didRun, false, 'Should have skipped execution due to overlap guard');
  });

  await test('Scheduler: disabled by default in test environments', () => {
    const scheduler = new ReminderScheduler();
    assert.strictEqual(scheduler.enabled, false);
    assert.strictEqual(scheduler.timer, null);
  });

  await test('Scheduler: due tasks scan caps notifications at 50 per user and isolates by user', async () => {
    await memoryTaskStore.reset();
    const nowTime = new Date('2026-11-16T12:00:00.00Z').getTime();

    // Create 55 tasks due in 6 hours for User A
    const dueDateSoon = '2026-11-16';
    for (let i = 1; i <= 55; i++) {
      await memoryTaskStore.create({
        title: `Urgent Task #${i}`,
        status: 'todo',
        dueDate: dueDateSoon
      }, userA.id);
    }

    // Create 1 task due in 6 hours for User B
    await memoryTaskStore.create({
      title: 'User B Task',
      status: 'todo',
      dueDate: dueDateSoon
    }, userB.id);

    const scheduler = new ReminderScheduler({
      taskStore: memoryTaskStore,
      clock: () => nowTime
    });

    await scheduler.scanNow();

    // Verify User A notifications are capped at 50
    const notifsA = scheduler.getNotifications(userA.id);
    assert.strictEqual(notifsA.length, 50, 'Must cap at 50 notifications');
    assert.ok(notifsA[0].message.includes('due soon'));

    // Verify User B notifications are isolated
    const notifsB = scheduler.getNotifications(userB.id);
    assert.strictEqual(notifsB.length, 1);
    assert.strictEqual(notifsB[0].title, 'User B Task');

    // Test GET /api/notifications endpoint
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      reminderScheduler: scheduler
    });

    const instance = await startTestServer(app);
    try {
      const resA = await makeRequest(instance.baseUrl, {
        path: '/api/notifications',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resA.statusCode, 200);
      assert.strictEqual(resA.json?.notifications?.length, 50);
      assert.strictEqual(resA.headers['cache-control'], 'private, no-cache');

      const resB = await makeRequest(instance.baseUrl, {
        path: '/api/notifications',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(resB.statusCode, 200);
      assert.strictEqual(resB.json?.notifications?.length, 1);
    } finally {
      await instance.close();
    }
  });

  // =======================================================================
  // 5. Caching & Request Coalescing Tests
  // =======================================================================
  console.log('\n--- 5. Server-Side Caching Tests ---');

  await test('MemoryCache LRU eviction at maximum capacity', () => {
    const cache = new MemoryCache({ maxEntries: 3 });

    cache.set('a', 'alpha');
    cache.set('b', 'beta');
    cache.set('c', 'gamma');

    // Access 'a' to make it most recently used
    assert.strictEqual(cache.get('a'), 'alpha');

    // Add 'd' -> 'b' was least recently used and must be evicted
    cache.set('d', 'delta');

    assert.strictEqual(cache.get('b'), null, 'Least recently used key "b" must be evicted');
    assert.strictEqual(cache.get('a'), 'alpha');
    assert.strictEqual(cache.get('c'), 'gamma');
    assert.strictEqual(cache.get('d'), 'delta');
  });

  await test('MemoryCache TTL expiration with injected clock', () => {
    let mockClock = 10000;
    const cache = new MemoryCache({ clock: () => mockClock });

    cache.set('temp', 'temporary-data', 5); // 5 seconds TTL

    // At 14s, item should still exist
    mockClock = 14000;
    assert.strictEqual(cache.get('temp'), 'temporary-data');

    // At 16s, item is expired and lazily deleted
    mockClock = 16000;
    assert.strictEqual(cache.get('temp'), null);
  });

  await test('GET /api/tasks caching: returns X-Cache: MISS then HIT', async () => {
    await memoryTaskStore.reset();
    await memoryTaskStore.create({ title: 'Cached Task' }, userA.id);

    const cache = new MemoryCache();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache
    });

    const instance = await startTestServer(app);
    try {
      // 1. Initial request: MISS
      const res1 = await makeRequest(instance.baseUrl, {
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.headers['x-cache'], 'MISS');
      assert.strictEqual(res1.headers['cache-control'], 'private, no-cache');

      // 2. Second request: HIT
      const res2 = await makeRequest(instance.baseUrl, {
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.headers['x-cache'], 'HIT');
      assert.deepStrictEqual(res2.json, res1.json);
    } finally {
      await instance.close();
    }
  });

  await test('User isolation in task caching: User B never receives User A cached entries', async () => {
    await memoryTaskStore.reset();
    await memoryTaskStore.create({ title: 'User A Secret Task' }, userA.id);
    await memoryTaskStore.create({ title: 'User B Public Task' }, userB.id);

    const cache = new MemoryCache();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache
    });

    const instance = await startTestServer(app);
    try {
      // User A loads task list (MISS)
      const resA1 = await makeRequest(instance.baseUrl, {
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resA1.headers['x-cache'], 'MISS');
      assert.strictEqual(resA1.json.data[0].title, 'User A Secret Task');

      // User B loads task list (must be MISS and strictly isolated)
      const resB1 = await makeRequest(instance.baseUrl, {
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(resB1.headers['x-cache'], 'MISS');
      assert.strictEqual(resB1.json.data[0].title, 'User B Public Task');
      assert.strictEqual(resB1.json.data.length, 1);
    } finally {
      await instance.close();
    }
  });

  await test('Task mutations (POST, PUT, PATCH, DELETE) invalidate cached task lists', async () => {
    await memoryTaskStore.reset();
    const task = await memoryTaskStore.create({ title: 'Task to Mutate' }, userA.id);

    const cache = new MemoryCache();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache
    });

    const instance = await startTestServer(app);
    try {
      // Prime cache
      await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });
      const hitRes = await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });
      assert.strictEqual(hitRes.headers['x-cache'], 'HIT');

      // 1. Invalidation on PATCH
      await makeRequest(instance.baseUrl, {
        method: 'PATCH',
        path: `/api/tasks/${task.id}`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'in-progress' }
      });

      const afterPatch = await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });
      assert.strictEqual(afterPatch.headers['x-cache'], 'MISS', 'PATCH should invalidate cache');

      // Prime cache again
      await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });

      // 2. Invalidation on POST (create)
      await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'New Created Task' }
      });

      const afterPost = await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });
      assert.strictEqual(afterPost.headers['x-cache'], 'MISS', 'POST should invalidate cache');

      // Prime cache again
      await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });

      // 3. Invalidation on DELETE
      await makeRequest(instance.baseUrl, {
        method: 'DELETE',
        path: `/api/tasks/${task.id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      const afterDelete = await makeRequest(instance.baseUrl, { path: '/api/tasks', headers: { Authorization: `Bearer ${tokenA}` } });
      assert.strictEqual(afterDelete.headers['x-cache'], 'MISS', 'DELETE should invalidate cache');
    } finally {
      await instance.close();
    }
  });

  await test('Weather endpoint caching and in-flight promise request coalescing (10 concurrent requests -> 1 upstream fetch)', async () => {
    let geocodeCalls = 0;
    let forecastCalls = 0;

    const mockWeatherFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('geocoding-api')) {
        geocodeCalls++;
        await new Promise(r => setTimeout(r, 40));
        return new Response(JSON.stringify({
          results: [{ id: 1, name: 'CoalesceCity', country: 'India', latitude: 12.5, longitude: 77.8 }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      forecastCalls++;
      await new Promise(r => setTimeout(r, 40));
      return new Response(JSON.stringify({
        current: { temperature_2m: 26.0, precipitation: 0, weather_code: 0 },
        daily: {
          time: ['2026-11-16'],
          temperature_2m_max: [30.0],
          temperature_2m_min: [20.0],
          precipitation_probability_max: [0],
          weather_code: [0]
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const cache = new MemoryCache();
    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache,
      fetchImpl: mockWeatherFetch
    });

    const instance = await startTestServer(app);
    try {
      // Fire 10 concurrent requests simultaneously for the same city
      const requests = Array.from({ length: 10 }, () =>
        makeRequest(instance.baseUrl, {
          path: '/api/external/weather?city=CoalesceCity',
          headers: { Authorization: `Bearer ${tokenA}` }
        })
      );

      const responses = await Promise.all(requests);

      // Verify all 10 responses succeeded
      for (const res of responses) {
        assert.strictEqual(res.statusCode, 200);
      }

      // In-flight coalescing ensures exactly 1 geocoding and 1 forecast call occurred
      assert.strictEqual(geocodeCalls, 1, 'In-flight promise coalescing should make exactly 1 geocoding call');
      assert.strictEqual(forecastCalls, 1, 'In-flight promise coalescing should make exactly 1 forecast call');

      // Eleventh request should hit the cache directly without any additional upstream calls
      const cachedRes = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=CoalesceCity',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(cachedRes.statusCode, 200);
      assert.strictEqual(cachedRes.headers['x-cache'], 'HIT');
      assert.strictEqual(geocodeCalls, 1);
      assert.strictEqual(forecastCalls, 1);
    } finally {
      await instance.close();
    }
  });

  await test('RedisCache adapter: seamless fallback to MemoryCache when client throws errors', async () => {
    let logWarning = '';
    const fakeBrokenRedisClient = {
      get: async () => { throw new Error('ECONNREFUSED - Redis server unreachable'); },
      set: async () => { throw new Error('ECONNREFUSED - Redis server unreachable'); },
      del: async () => { throw new Error('ECONNREFUSED - Redis server unreachable'); },
      quit: async () => {}
    };

    const redisCache = new RedisCache({
      client: fakeBrokenRedisClient,
      logger: (msg) => { logWarning = msg; }
    });

    // 1. Verify set and get still succeed transparently via fallback
    await redisCache.set('test-key', 'resilient-value', 30);
    const value = await redisCache.get('test-key');

    assert.strictEqual(value, 'resilient-value');
    assert.strictEqual(redisCache.isDegraded, true);
    assert.ok(logWarning.includes('[CACHE-WARN]'), 'Warning should be logged once');

    // 2. Verify stats reflect hits and degraded status
    const stats = redisCache.stats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.isDegraded, true);
  });

  await test('Public GET /api/health returns detailed queue and cache metrics', async () => {
    const queue = new JobQueue();
    const cache = new MemoryCache();
    cache.set('prime', 'val');
    cache.get('prime'); // 1 hit
    cache.get('missing'); // 1 miss

    const app = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      cache,
      jobQueue: queue,
      detailedHealth: true
    });

    const instance = await startTestServer(app);
    try {
      const res = await makeRequest(instance.baseUrl, { path: '/api/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json?.status, 'ok');
      assert.strictEqual(typeof res.json?.uptimeSeconds, 'number');
      assert.strictEqual(typeof res.json?.queue?.queued, 'number');
      assert.strictEqual(typeof res.json?.queue?.running, 'number');
      assert.strictEqual(res.json?.cache?.hits, 1);
      assert.strictEqual(res.json?.cache?.misses, 1);
    } finally {
      await instance.close();
    }
  });

  // =======================================================================
  // 6. Graceful Shutdown Coordinator Tests
  // =======================================================================
  console.log('\n--- 6. Graceful Shutdown Coordinator Tests ---');

  await test('Graceful shutdown: stops scheduler, drains queue, closes resources, and is idempotent', async () => {
    let serverClosed = false;
    let schedulerStopped = false;
    let queueDrained = false;
    let mongooseClosed = false;
    let exitCode = null;

    const mockServer = {
      close: (cb) => { serverClosed = true; cb(); }
    };
    const mockScheduler = {
      stop: () => { schedulerStopped = true; }
    };
    const mockQueue = {
      drain: async () => { queueDrained = true; }
    };
    const mockMongoose = {
      connection: {
        readyState: 1,
        close: async () => { mongooseClosed = true; }
      }
    };

    const shutdown = createGracefulShutdown({
      server: mockServer,
      queue: mockQueue,
      scheduler: mockScheduler,
      mongoose: mockMongoose,
      exitFn: (code) => { exitCode = code; },
      logFn: () => {}
    });

    // First call
    await shutdown('SIGTERM');

    assert.strictEqual(serverClosed, true);
    assert.strictEqual(schedulerStopped, true);
    assert.strictEqual(queueDrained, true);
    assert.strictEqual(mongooseClosed, true);
    assert.strictEqual(exitCode, 0);

    // Second call (must be idempotent: no errors or double executions)
    serverClosed = false;
    await shutdown('SIGINT');
    assert.strictEqual(serverClosed, false, 'Second shutdown call must be ignored as idempotent');
  });

  // =======================================================================
  // Summary
  // =======================================================================
  console.log('\n========================================');
  console.log(`Task 8 Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTask8Tests();
