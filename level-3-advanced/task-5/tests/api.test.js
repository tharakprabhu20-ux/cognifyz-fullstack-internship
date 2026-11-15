/**
 * tests/api.test.js
 * Comprehensive integration test suite for the Student Task Manager REST API.
 * Uses ONLY Node.js built-in modules (`http`, `assert`).
 */

const http = require('http');
const assert = require('assert');
const app = require('../app');
const taskStore = require('../store/taskStore');

let server;
let baseUrl;

/**
 * Helper to perform HTTP requests against the test server using Node's built-in `http`.
 * @param {Object} options
 * @param {string} options.method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param {string} options.path - Request path (e.g. /api/tasks)
 * @param {Object} [options.headers] - Additional request headers
 * @param {any} [options.body] - Request body (string or object)
 * @returns {Promise<{ statusCode: number, headers: Object, body: string, json: any }>}
 */
function request({ method, path, headers = {}, body = null }) {
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
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          if (rawData.trim()) {
            json = JSON.parse(rawData);
          }
        } catch (_) {
          json = null;
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

// Test runner state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

/**
 * Defines a single test case.
 * @param {string} description
 * @param {Function} fn
 */
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

async function runTests() {
  console.log('Starting Student Task Manager API Test Suite...\n');

  // Start HTTP server on a dynamic port
  await new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`Test server listening on ${baseUrl}\n`);
      resolve();
    });
    server.on('error', reject);
  });

  try {
    // Reset store to known baseline seed data
    taskStore.reset();

    // 1. Health check
    await test('GET /api/health returns 200 with { status: "ok" }', async () => {
      const res = await request({ method: 'GET', path: '/api/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { status: 'ok' });
    });

    // 2. Create task (201, Location header, default values applied)
    let createdTaskId;
    await test('POST /api/tasks creates a task with defaults (201, Location header)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: {
          title: 'Prepare Physics Presentation'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.headers.location, 'Location header must be present');
      assert.ok(res.headers.location.startsWith('/api/tasks/'), 'Location must point to /api/tasks/:id');
      assert.ok(res.json, 'Response must be JSON');
      assert.strictEqual(typeof res.json.id, 'number');
      assert.strictEqual(res.json.title, 'Prepare Physics Presentation');
      assert.strictEqual(res.json.description, '');
      assert.strictEqual(res.json.status, 'todo', 'Default status must be todo');
      assert.strictEqual(res.json.priority, 'medium', 'Default priority must be medium');
      assert.strictEqual(res.json.dueDate, null, 'Default dueDate must be null');
      assert.ok(res.json.createdAt, 'createdAt timestamp must be set');
      assert.ok(res.json.updatedAt, 'updatedAt timestamp must be set');
      createdTaskId = res.json.id;
    });

    // 3. Create with invalid fields (400 with details)
    await test('POST /api/tasks with title too short returns 400 with validation details', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'AB' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      assert.ok(Array.isArray(res.json.error.details));
      const hasTitleErr = res.json.error.details.some(d => d.field === 'title');
      assert.ok(hasTitleErr, 'Details must specify title validation error');
    });

    await test('POST /api/tasks with title too long (> 100 chars) returns 400', async () => {
      const longTitle = 'A'.repeat(101);
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: longTitle }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      const hasTitleErr = res.json.error.details.some(d => d.field === 'title');
      assert.ok(hasTitleErr);
    });

    await test('POST /api/tasks with invalid status returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'Valid Task Title', status: 'archived' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      const hasStatusErr = res.json.error.details.some(d => d.field === 'status');
      assert.ok(hasStatusErr);
    });

    await test('POST /api/tasks with invalid priority returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'Valid Task Title', priority: 'critical' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      const hasPriorityErr = res.json.error.details.some(d => d.field === 'priority');
      assert.ok(hasPriorityErr);
    });

    await test('POST /api/tasks with invalid dueDate returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'Valid Task Title', dueDate: '2026-02-30' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      const hasDateErr = res.json.error.details.some(d => d.field === 'dueDate');
      assert.ok(hasDateErr);
    });

    // 4. Malformed JSON payload (400)
    await test('POST /api/tasks with malformed JSON body returns 400 BAD_REQUEST', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { 'Content-Type': 'application/json' },
        body: '{"title": "Broken JSON, missing brace'
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
    });

    // 5. Unknown fields ignored
    await test('POST /api/tasks ignores unknown fields (not stored or returned)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: {
          title: 'Math Homework Exercise 4',
          extraBogusField: 'malicious-data',
          hackAttempt: true
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.json.extraBogusField, undefined);
      assert.strictEqual(res.json.hackAttempt, undefined);
    });

    // 6. Client-supplied id/createdAt ignored
    await test('POST /api/tasks ignores client-supplied id and createdAt', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: {
          id: 8888,
          createdAt: '1999-01-01T00:00:00.000Z',
          updatedAt: '1999-01-01T00:00:00.000Z',
          title: 'Chemistry Lab Report Writing'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.notStrictEqual(res.json.id, 8888);
      assert.notStrictEqual(res.json.createdAt, '1999-01-01T00:00:00.000Z');
    });

    // 7. List tasks with filters, search, sort, and pagination
    await test('GET /api/tasks returns paginated list with meta', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks' });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.json.data));
      assert.ok(res.json.meta);
      assert.strictEqual(typeof res.json.meta.total, 'number');
      assert.strictEqual(res.json.meta.page, 1);
      assert.strictEqual(res.json.meta.limit, 10);
      assert.ok(res.json.meta.totalPages >= 1);
    });

    await test('GET /api/tasks?status=todo filters tasks by status', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?status=todo' });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length > 0);
      assert.ok(res.json.data.every(t => t.status === 'todo'));
    });

    await test('GET /api/tasks?priority=high filters tasks by priority', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?priority=high' });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length > 0);
      assert.ok(res.json.data.every(t => t.priority === 'high'));
    });

    await test('GET /api/tasks?search=discrete performs case-insensitive text search', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?search=discrete' });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length >= 1);
      assert.ok(res.json.data.some(t => t.title.toLowerCase().includes('discrete')));
    });

    await test('GET /api/tasks?sort=priority&order=desc sorts high to low priority', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?sort=priority&order=desc' });
      assert.strictEqual(res.statusCode, 200);
      const ranks = { high: 3, medium: 2, low: 1 };
      for (let i = 0; i < res.json.data.length - 1; i++) {
        assert.ok(ranks[res.json.data[i].priority] >= ranks[res.json.data[i + 1].priority]);
      }
    });

    await test('GET /api/tasks?page=999 returns empty data array when page is beyond end', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?page=999' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json.data, []);
      assert.strictEqual(res.json.meta.page, 999);
      assert.ok(res.json.meta.total > 0);
    });

    await test('GET /api/tasks?limit=99 clamps limit to maximum 50', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks?limit=99' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.meta.limit, 50);
    });

    // 8. Get task by ID
    await test('GET /api/tasks/:id returns single task by ID (200)', async () => {
      const res = await request({ method: 'GET', path: `/api/tasks/${createdTaskId}` });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.id, createdTaskId);
      assert.strictEqual(res.json.title, 'Prepare Physics Presentation');
    });

    // 9. Get with non-numeric ID (400) and missing ID (404)
    await test('GET /api/tasks/not-a-number returns 400 BAD_REQUEST', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks/not-a-number' });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
    });

    await test('GET /api/tasks/0 returns 400 BAD_REQUEST (must be positive integer)', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks/0' });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
    });

    await test('GET /api/tasks/99999 returns 404 NOT_FOUND for non-existent task', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks/99999' });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    // 10. PUT full replace
    await test('PUT /api/tasks/:id fully replaces editable fields (200)', async () => {
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${createdTaskId}`,
        body: {
          title: 'Prepare Physics Presentation - Updated',
          description: 'Slides finalized with team members.',
          status: 'in-progress',
          priority: 'high',
          dueDate: '2026-11-28'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.id, createdTaskId);
      assert.strictEqual(res.json.title, 'Prepare Physics Presentation - Updated');
      assert.strictEqual(res.json.description, 'Slides finalized with team members.');
      assert.strictEqual(res.json.status, 'in-progress');
      assert.strictEqual(res.json.priority, 'high');
      assert.strictEqual(res.json.dueDate, '2026-11-28');
    });

    await test('PUT /api/tasks/99999 returns 404 for missing task', async () => {
      const res = await request({
        method: 'PUT',
        path: '/api/tasks/99999',
        body: {
          title: 'Non-existent task replacement',
          status: 'todo',
          priority: 'low'
        }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    // 11. PATCH partial update and empty body rejection
    await test('PATCH /api/tasks/:id partially updates only specified fields (200)', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${createdTaskId}`,
        body: {
          status: 'done'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.id, createdTaskId);
      assert.strictEqual(res.json.status, 'done');
      // Previous fields remain preserved
      assert.strictEqual(res.json.title, 'Prepare Physics Presentation - Updated');
      assert.strictEqual(res.json.priority, 'high');
    });

    await test('PATCH /api/tasks/:id with empty body rejects with 400', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${createdTaskId}`,
        body: {}
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
    });

    await test('PATCH /api/tasks/99999 returns 404 for non-existent task', async () => {
      const res = await request({
        method: 'PATCH',
        path: '/api/tasks/99999',
        body: { status: 'todo' }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    // 12. DELETE (204) followed by GET (404)
    await test('DELETE /api/tasks/:id deletes task (204) and subsequent GET returns 404', async () => {
      const delRes = await request({
        method: 'DELETE',
        path: `/api/tasks/${createdTaskId}`
      });
      assert.strictEqual(delRes.statusCode, 204);
      assert.strictEqual(delRes.body, '', '204 response must have no body');

      const getRes = await request({
        method: 'GET',
        path: `/api/tasks/${createdTaskId}`
      });
      assert.strictEqual(getRes.statusCode, 404);
      assert.strictEqual(getRes.json.error.code, 'NOT_FOUND');
    });

    await test('DELETE /api/tasks/99999 returns 404 for missing task', async () => {
      const res = await request({
        method: 'DELETE',
        path: '/api/tasks/99999'
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    // 13. Unknown /api route returns 404 with JSON error shape
    await test('GET /api/nonexistent returns 404 with consistent JSON error shape', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/nonexistent'
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
      assert.ok(res.json.error.message.includes('/api/nonexistent'));
    });

    // 14. Stored script tag title comes back as plain data, not executed/mutilated
    await test('Stored script tag title comes back as plain text data, not executed', async () => {
      const xssTitle = '<script>alert("xss")</script>';
      const createRes = await request({
        method: 'POST',
        path: '/api/tasks',
        body: {
          title: xssTitle,
          description: '<img src=x onerror=alert(1)>'
        }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const xssId = createRes.json.id;

      const getRes = await request({
        method: 'GET',
        path: `/api/tasks/${xssId}`
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.json.title, xssTitle, 'Title must be returned as exact unaltered string');
      assert.strictEqual(getRes.json.description, '<img src=x onerror=alert(1)>');
    });

  } finally {
    // Close the HTTP test server cleanly
    await new Promise(resolve => server.close(resolve));
    console.log('\nTest server shut down cleanly.');
  }

  // Summary
  console.log('\n========================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('========================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
