/**
 * tests/api.test.js
 * Comprehensive integration test suite for the Student Task Manager REST API (Task 6).
 * Uses ONLY Node.js built-in modules (`http`, `assert`, `crypto`).
 * Executes entirely against in-memory stores with zero database or .env dependencies.
 */

const http = require('http');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const taskStore = require('../store/taskStore.memory');
const userStore = require('../store/userStore.memory');

const TEST_JWT_SECRET = 'in-memory-test-secret-at-least-32-characters-secure-key';

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

        // Verify that passwordHash is never leaked anywhere in any response
        if (rawData.includes('passwordHash')) {
          reject(new Error('CRITICAL SECURITY VIOLATION: passwordHash detected in HTTP response body!'));
          return;
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
  console.log('Starting Student Task Manager API Test Suite (Task 6: Auth & DB Integration)...\n');

  // Build isolated test app using in-memory stores and designated test secret
  const app = createApp({
    taskStore,
    userStore,
    jwtSecret: TEST_JWT_SECRET
  });

  // Start HTTP server on a dynamic local port
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
    // Reset stores to empty baseline
    await taskStore.reset();
    await userStore.reset();

    // =======================================================================
    // 1. Health Check (Public endpoint)
    // =======================================================================
    await test('GET /api/health returns 200 with { status: "ok" } without auth', async () => {
      const res = await request({ method: 'GET', path: '/api/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { status: 'ok' });
    });

    // =======================================================================
    // 2. Authentication: User Registration
    // =======================================================================
    let userAId;
    let userAToken;
    let userBToken;

    await test('POST /api/auth/register creates user (201, safe object without passwordHash)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Alice Student',
          email: 'alice@university.edu',
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.json.id, 'User ID must be returned');
      assert.strictEqual(res.json.name, 'Alice Student');
      assert.strictEqual(res.json.email, 'alice@university.edu');
      assert.ok(res.json.createdAt);
      assert.strictEqual(res.json.passwordHash, undefined, 'passwordHash must never be exposed');
      userAId = res.json.id;
    });

    await test('POST /api/auth/register with duplicate email returns 409 CONFLICT', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Alice Duplicate',
          email: 'ALICE@UNIVERSITY.EDU', // Case-insensitive duplicate check
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.json.error.code, 'CONFLICT');
      assert.strictEqual(res.json.error.message, 'Email already registered');
    });

    await test('POST /api/auth/register with invalid name (<3 chars) returns 400 VALIDATION_ERROR', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Al',
          email: 'valid@example.com',
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      assert.ok(res.json.error.details.some(d => d.field === 'name'));
    });

    await test('POST /api/auth/register with invalid email returns 400 VALIDATION_ERROR', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Valid Name',
          email: 'invalid-email-address',
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      assert.ok(res.json.error.details.some(d => d.field === 'email'));
    });

    await test('POST /api/auth/register with weak password (<8 chars / missing numbers) returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Valid Name',
          email: 'valid2@example.com',
          password: 'password' // Missing uppercase and number
        }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
      assert.ok(res.json.error.details.some(d => d.field === 'password'));
    });

    await test('POST /api/auth/register rejects object-valued email/password (NoSQL injection guard)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        body: {
          name: 'Hacker Name',
          email: { '$ne': null },
          password: { '$gt': '' }
        }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
    });

    await test('POST /api/auth/register with non-JSON content type returns 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/register',
        headers: { 'Content-Type': 'text/plain' },
        body: 'name=Test&email=test@example.com'
      });
      assert.strictEqual(res.statusCode, 415);
      assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    // =======================================================================
    // 3. Authentication: User Login & Timing Attack Resilience
    // =======================================================================
    await test('POST /api/auth/login with valid credentials returns 200, JWT token, and safe user', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: 'alice@university.edu',
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.token, 'JWT token must be returned');
      assert.strictEqual(typeof res.json.token, 'string');
      assert.strictEqual(res.json.user.email, 'alice@university.edu');
      assert.strictEqual(res.json.user.passwordHash, undefined);
      userAToken = res.json.token;

      // Verify token decoded claims
      const decoded = jwt.verify(userAToken, TEST_JWT_SECRET, { algorithms: ['HS256'] });
      assert.strictEqual(decoded.id, userAId);
    });

    await test('POST /api/auth/login returns IDENTICAL 401 response for wrong password and unknown email', async () => {
      const wrongPasswordRes = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: 'alice@university.edu',
          password: 'IncorrectPassword123'
        }
      });

      const unknownEmailRes = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: 'unknown-student@university.edu',
          password: 'Password123'
        }
      });

      assert.strictEqual(wrongPasswordRes.statusCode, 401);
      assert.strictEqual(unknownEmailRes.statusCode, 401);
      assert.deepStrictEqual(wrongPasswordRes.json, unknownEmailRes.json, 'Error shapes and messages must be identical');
      assert.strictEqual(wrongPasswordRes.json.error.message, 'Invalid email or password');
    });

    await test('POST /api/auth/login rejects object-valued email or password', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: { '$ne': null },
          password: 'Password123'
        }
      });
      assert.strictEqual(res.statusCode, 400);
    });

    await test('POST /api/auth/login with non-JSON content type returns 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/auth/login',
        headers: { 'Content-Type': 'text/plain' },
        body: 'email=alice@university.edu&password=Password123'
      });
      assert.strictEqual(res.statusCode, 415);
      assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    // =======================================================================
    // 4. Authentication: Profile /me Endpoint
    // =======================================================================
    await test('GET /api/auth/me without token returns 401 UNAUTHORIZED', async () => {
      const res = await request({ method: 'GET', path: '/api/auth/me' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.code, 'UNAUTHORIZED');
    });

    await test('GET /api/auth/me with valid token returns current user profile', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.user);
      assert.strictEqual(res.json.user.id, userAId);
      assert.strictEqual(res.json.user.email, 'alice@university.edu');
      assert.strictEqual(res.json.user.passwordHash, undefined);
    });

    // =======================================================================
    // 5. Token Validation: Tampering, Expiration, Malformed Headers, and Algorithms
    // =======================================================================
    await test('GET /api/auth/me with malformed Authorization header returns 401', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: 'NotBearerToken' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.code, 'UNAUTHORIZED');
    });

    await test('GET /api/auth/me with tampered JWT returns 401', async () => {
      const tamperedToken = userAToken.slice(0, -4) + 'abcd';
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${tamperedToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.code, 'UNAUTHORIZED');
    });

    await test('GET /api/auth/me with expired token returns 401', async () => {
      const expiredToken = jwt.sign(
        { id: userAId },
        TEST_JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '-10s' }
      );
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.code, 'UNAUTHORIZED');
    });

    await test('GET /api/auth/me with wrong algorithm token returns 401', async () => {
      // Sign with HS512 while server expects HS256
      const wrongAlgoToken = jwt.sign(
        { id: userAId },
        TEST_JWT_SECRET,
        { algorithm: 'HS512' }
      );
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${wrongAlgoToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.code, 'UNAUTHORIZED');
    });

    await test('GET /api/auth/me with token for non-existent user returns 401', async () => {
      const ghostId = crypto.randomBytes(12).toString('hex');
      const ghostToken = jwt.sign(
        { id: ghostId },
        TEST_JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const res = await request({
        method: 'GET',
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${ghostToken}` }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json.error.message, 'Authenticated user account no longer exists');
    });

    // =======================================================================
    // 6. Protection: All /api/tasks endpoints require authentication
    // =======================================================================
    const dummyObjectId = '507f1f77bcf86cd799439011';

    await test('GET /api/tasks without token returns 401', async () => {
      const res = await request({ method: 'GET', path: '/api/tasks' });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('GET /api/tasks/:id without token returns 401', async () => {
      const res = await request({ method: 'GET', path: `/api/tasks/${dummyObjectId}` });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('POST /api/tasks without token returns 401', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        body: { title: 'Unauthorized Task' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('PUT /api/tasks/:id without token returns 401', async () => {
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${dummyObjectId}`,
        body: { title: 'Updated Title', status: 'todo', priority: 'medium' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('PATCH /api/tasks/:id without token returns 401', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${dummyObjectId}`,
        body: { status: 'done' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('DELETE /api/tasks/:id without token returns 401', async () => {
      const res = await request({ method: 'DELETE', path: `/api/tasks/${dummyObjectId}` });
      assert.strictEqual(res.statusCode, 401);
    });

    // =======================================================================
    // 7. Authorization & Data Isolation between Users (User A vs User B)
    // =======================================================================
    // Register and login User B (Bob)
    const bobRegRes = await request({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Bob Peer',
        email: 'bob@university.edu',
        password: 'Password456'
      }
    });
    assert.strictEqual(bobRegRes.statusCode, 201);

    const bobLoginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: 'bob@university.edu',
        password: 'Password456'
      }
    });
    userBToken = bobLoginRes.json.token;

    let userATaskId;
    await test('User A creates a task; task owner is assigned automatically', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Alice Private Math Assignment',
          description: 'Top secret thesis proofs',
          status: 'todo',
          priority: 'high',
          dueDate: '2026-12-01'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.json.id);
      assert.strictEqual(res.json.owner, userAId);
      userATaskId = res.json.id;
    });

    await test('User B does NOT see User A task in task list', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json.data, [], 'User B task list must be empty');
      assert.strictEqual(res.json.meta.total, 0);
    });

    await test('User B reading User A task returns 404 (does NOT leak existence via 403)', async () => {
      const res = await request({
        method: 'GET',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('User B PUT update on User A task returns 404', async () => {
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userBToken}` },
        body: {
          title: 'Bob Tamper Attempt',
          description: 'Should fail',
          status: 'done',
          priority: 'low'
        }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('User B PATCH update on User A task returns 404', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userBToken}` },
        body: { status: 'done' }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('User B DELETE on User A task returns 404', async () => {
      const res = await request({
        method: 'DELETE',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('Task owner cannot be set or spoofed in request body on creation', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Spoof Attempt Task',
          owner: bobRegRes.json.id // Malicious client attempt to set owner to Bob
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.json.owner, userAId, 'Owner must remain authenticated User A');
    });

    await test('Task owner cannot be modified via PUT or PATCH body', async () => {
      const putRes = await request({
        method: 'PUT',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Alice Private Math Assignment - Updated',
          description: 'Updated notes',
          status: 'in-progress',
          priority: 'high',
          owner: bobRegRes.json.id
        }
      });
      assert.strictEqual(putRes.statusCode, 200);
      assert.strictEqual(putRes.json.owner, userAId, 'Owner must not change on PUT');

      const patchRes = await request({
        method: 'PATCH',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          owner: bobRegRes.json.id,
          status: 'done'
        }
      });
      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.json.owner, userAId, 'Owner must not change on PATCH');
    });

    // =======================================================================
    // 8. Full CRUD Flow for Authenticated User A
    // =======================================================================
    let testTaskId;
    await test('User A: Create task with defaults and Location header (POST)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Complete Operating Systems Lab'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.ok(res.headers.location);
      assert.ok(res.headers.location.startsWith('/api/tasks/'));
      assert.strictEqual(res.json.title, 'Complete Operating Systems Lab');
      assert.strictEqual(res.json.description, '');
      assert.strictEqual(res.json.status, 'todo');
      assert.strictEqual(res.json.priority, 'medium');
      assert.strictEqual(res.json.dueDate, null);
      testTaskId = res.json.id;
    });

    await test('POST /api/tasks ignores unknown fields (not stored or returned)', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
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

    await test('POST /api/tasks ignores client-supplied id, createdAt, and updatedAt', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          id: '507f1f77bcf86cd799439099',
          createdAt: '1999-01-01T00:00:00.000Z',
          updatedAt: '1999-01-01T00:00:00.000Z',
          title: 'Chemistry Lab Report Writing'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.notStrictEqual(res.json.id, '507f1f77bcf86cd799439099');
      assert.notStrictEqual(res.json.createdAt, '1999-01-01T00:00:00.000Z');
      assert.notStrictEqual(res.json.updatedAt, '1999-01-01T00:00:00.000Z');
    });

    await test('Stored script tag title comes back as plain text data, not executed', async () => {
      const xssTitle = '<script>alert("xss")</script>';
      const xssDesc = '<img src=x onerror=alert(1)>';
      const createRes = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: xssTitle,
          description: xssDesc
        }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const xssId = createRes.json.id;

      const getRes = await request({
        method: 'GET',
        path: `/api/tasks/${xssId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.json.title, xssTitle, 'Title must be returned as exact unaltered string');
      assert.strictEqual(getRes.json.description, xssDesc);
    });

    await test('User A: Retrieve task by ID (GET /api/tasks/:id)', async () => {
      const res = await request({
        method: 'GET',
        path: `/api/tasks/${testTaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.id, testTaskId);
      assert.strictEqual(res.json.title, 'Complete Operating Systems Lab');
    });

    await test('User A: Full update of task (PUT /api/tasks/:id)', async () => {
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${testTaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Complete Operating Systems Lab - Finalized',
          description: 'Paging algorithm implementation completed',
          status: 'in-progress',
          priority: 'high',
          dueDate: '2026-11-30'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.title, 'Complete Operating Systems Lab - Finalized');
      assert.strictEqual(res.json.status, 'in-progress');
      assert.strictEqual(res.json.priority, 'high');
      assert.strictEqual(res.json.dueDate, '2026-11-30');
    });

    await test('User A: Partial update of task (PATCH /api/tasks/:id)', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${testTaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          status: 'done'
        }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.status, 'done');
      assert.strictEqual(res.json.title, 'Complete Operating Systems Lab - Finalized');
    });

    await test('User A: Delete task (DELETE 204) and subsequent GET returns 404', async () => {
      const delRes = await request({
        method: 'DELETE',
        path: `/api/tasks/${testTaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(delRes.statusCode, 204);
      assert.strictEqual(delRes.body, '');

      const getRes = await request({
        method: 'GET',
        path: `/api/tasks/${testTaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(getRes.statusCode, 404);
      assert.strictEqual(getRes.json.error.code, 'NOT_FOUND');
    });

    // =======================================================================
    // 9. ObjectId Validation & Task 5 Features (Search, Filter, Sort, Pagination)
    // =======================================================================
    await test('Invalid ObjectId format returns 400 BAD_REQUEST', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks/not-a-24-char-hex-id',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
      assert.ok(res.json.error.message.includes('24-character hexadecimal ObjectId'));
    });

    await test('GET /api/tasks/0 returns 400 BAD_REQUEST (must be 24-char hex ObjectId)', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks/0',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
    });

    await test('Valid 24-char ObjectId format but missing task returns 404 NOT_FOUND', async () => {
      const nonExistentId = 'ffffffffffffffffffffffff';
      const res = await request({
        method: 'GET',
        path: `/api/tasks/${nonExistentId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('PUT /api/tasks/:id with non-existent ObjectId returns 404 NOT_FOUND', async () => {
      const nonExistentId = 'ffffffffffffffffffffffff';
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${nonExistentId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {
          title: 'Missing Task PUT',
          status: 'todo',
          priority: 'medium'
        }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('PATCH /api/tasks/:id with non-existent ObjectId returns 404 NOT_FOUND', async () => {
      const nonExistentId = 'ffffffffffffffffffffffff';
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${nonExistentId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { status: 'done' }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('DELETE /api/tasks/:id with non-existent ObjectId returns 404 NOT_FOUND', async () => {
      const nonExistentId = 'ffffffffffffffffffffffff';
      const res = await request({
        method: 'DELETE',
        path: `/api/tasks/${nonExistentId}`,
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    await test('POST /api/tasks with title too short (<3) returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { title: 'AB' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
    });

    await test('POST /api/tasks with title too long (>100) returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { title: 'A'.repeat(101) }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
    });

    await test('POST /api/tasks with invalid status returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { title: 'Valid Title', status: 'invalid-status' }
      });
      assert.strictEqual(res.statusCode, 400);
    });

    await test('POST /api/tasks with invalid priority returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { title: 'Valid Title', priority: 'ultra-high' }
      });
      assert.strictEqual(res.statusCode, 400);
    });

    await test('POST /api/tasks with invalid dueDate returns 400', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userAToken}` },
        body: { title: 'Valid Title', dueDate: '2026-02-30' }
      });
      assert.strictEqual(res.statusCode, 400);
    });

    await test('POST /api/tasks with malformed JSON body returns 400 BAD_REQUEST', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`
        },
        body: '{"title": "Unclosed string'
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'BAD_REQUEST');
    });

    await test('POST /api/tasks with non-JSON content type returns 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: {
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${userAToken}`
        },
        body: 'title=SimpleText'
      });
      assert.strictEqual(res.statusCode, 415);
      assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    await test('PUT /api/tasks/:id with non-JSON content type returns 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request({
        method: 'PUT',
        path: `/api/tasks/${userATaskId}`,
        headers: {
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${userAToken}`
        },
        body: 'title=SimpleText'
      });
      assert.strictEqual(res.statusCode, 415);
      assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    await test('PATCH /api/tasks/:id with non-JSON content type returns 415 UNSUPPORTED_MEDIA_TYPE', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${userATaskId}`,
        headers: {
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${userAToken}`
        },
        body: 'status=done'
      });
      assert.strictEqual(res.statusCode, 415);
      assert.strictEqual(res.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    });

    await test('POST /api/tasks with body exceeding 10kb returns clean JSON error (413)', async () => {
      const largePayload = JSON.stringify({
        title: 'Large Payload Task',
        description: 'X'.repeat(11000)
      });
      const res = await request({
        method: 'POST',
        path: '/api/tasks',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`
        },
        body: largePayload
      });
      assert.strictEqual(res.statusCode, 413);
      assert.strictEqual(res.json.error.code, 'PAYLOAD_TOO_LARGE');
      assert.ok(res.json.error.message.includes('10kb limit'));
    });

    await test('PATCH with empty body returns 400 VALIDATION_ERROR', async () => {
      const res = await request({
        method: 'PATCH',
        path: `/api/tasks/${userATaskId}`,
        headers: { Authorization: `Bearer ${userAToken}` },
        body: {}
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'VALIDATION_ERROR');
    });

    // Populate several tasks for User A to test filtering, sorting, pagination
    await request({
      method: 'POST',
      path: '/api/tasks',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { title: 'Biology Lab Report', status: 'todo', priority: 'low', dueDate: '2026-11-25' }
    });
    await request({
      method: 'POST',
      path: '/api/tasks',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { title: 'Calculus Problem Set', status: 'in-progress', priority: 'medium', dueDate: '2026-11-20' }
    });
    await request({
      method: 'POST',
      path: '/api/tasks',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: { title: 'Computer Networks Project', status: 'done', priority: 'high', dueDate: '2026-11-15' }
    });

    await test('GET /api/tasks?status=todo filters User A tasks by status', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?status=todo',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length >= 1);
      assert.ok(res.json.data.every(t => t.status === 'todo'));
    });

    await test('GET /api/tasks?priority=high filters User A tasks by priority', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?priority=high',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length >= 1);
      assert.ok(res.json.data.every(t => t.priority === 'high'));
    });

    await test('GET /api/tasks?search=networks performs case-insensitive text search', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?search=networks',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json.data.length >= 1);
      assert.ok(res.json.data.some(t => t.title.toLowerCase().includes('networks')));
    });

    // Populate a task containing regex special characters
    await request({
      method: 'POST',
      path: '/api/tasks',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        title: 'Special Symbols Task (Math .*+?)',
        description: 'Contains parentheses (and dots .*) as literal text'
      }
    });

    await test('GET /api/tasks?search=... with regex special characters treats them as literal text', async () => {
      // Search with literal "(Math" containing unescaped open parenthesis
      const resParens = await request({
        method: 'GET',
        path: '/api/tasks?search=(Math',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(resParens.statusCode, 200);
      assert.ok(resParens.json.data.length >= 1);
      assert.ok(resParens.json.data.some(t => t.title.includes('(Math')));

      // Search with literal ".*" containing wildcard regex syntax
      const resDotStar = await request({
        method: 'GET',
        path: '/api/tasks?search=.*',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(resDotStar.statusCode, 200);
      assert.ok(resDotStar.json.data.length >= 1);
      assert.ok(resDotStar.json.data.some(t => t.title.includes('.*')));

      // Search with non-matching special regex "(NonExistent"
      const resNone = await request({
        method: 'GET',
        path: '/api/tasks?search=(NonExistent',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(resNone.statusCode, 200);
      assert.strictEqual(resNone.json.data.length, 0);
    });

    await test('GET /api/tasks?sort=priority&order=desc sorts high to low priority', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?sort=priority&order=desc',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const ranks = { high: 3, medium: 2, low: 1 };
      for (let i = 0; i < res.json.data.length - 1; i++) {
        assert.ok(ranks[res.json.data[i].priority] >= ranks[res.json.data[i + 1].priority]);
      }
    });

    await test('GET /api/tasks?limit=99 clamps limit to maximum 50', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?limit=99',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.meta.limit, 50);
    });

    await test('GET /api/tasks?page=999 returns empty data array when beyond total pages', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/tasks?page=999',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json.data, []);
      assert.strictEqual(res.json.meta.page, 999);
    });

    // =======================================================================
    // 10. Fallthrough: Unknown API routes return standard 404
    // =======================================================================
    await test('GET /api/nonexistent returns 404 with JSON error shape', async () => {
      const res = await request({
        method: 'GET',
        path: '/api/nonexistent',
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
    });

    // =======================================================================
    // 11. Unit & Cast Tests for MongoDB Task Filter (sanitizeFilter interaction)
    // =======================================================================
    const mongoose = require('mongoose');
    const { buildTaskFilter } = require('../store/taskStore.mongo');
    const Task = require('../models/Task');

    await test('buildTaskFilter: strictly anchors owner field to authenticated user', async () => {
      const ownerId = '507f1f77bcf86cd799439011';
      const filter = buildTaskFilter(ownerId, { search: 'biology' });
      assert.strictEqual(filter.owner, ownerId);
    });

    await test('buildTaskFilter: search conditions use escaped literal text', async () => {
      const ownerId = '507f1f77bcf86cd799439011';
      const filter = buildTaskFilter(ownerId, { search: 'lecture notes' });
      assert.ok(Array.isArray(filter.$or));
      assert.strictEqual(filter.$or[0].title.$regex, 'lecture notes');
      assert.strictEqual(filter.$or[0].title.$options, 'i');
      assert.strictEqual(filter.$or[1].description.$regex, 'lecture notes');
      assert.strictEqual(filter.$or[1].description.$options, 'i');
    });

    await test('buildTaskFilter: regex special characters like ".*" or "(" are properly escaped', async () => {
      const ownerId = '507f1f77bcf86cd799439011';
      const filter = buildTaskFilter(ownerId, { search: '.* (test) [brackets] + ? ^ $' });
      assert.strictEqual(
        filter.$or[0].title.$regex,
        '\\.\\* \\(test\\) \\[brackets\\] \\+ \\? \\^ \\$'
      );
      assert.strictEqual(
        filter.$or[1].description.$regex,
        '\\.\\* \\(test\\) \\[brackets\\] \\+ \\? \\^ \\$'
      );
    });

    await test('buildTaskFilter: ignores object-valued status, priority, and search inputs', async () => {
      const ownerId = '507f1f77bcf86cd799439011';
      const filter = buildTaskFilter(ownerId, {
        status: { '$ne': null },
        priority: { '$gt': '' },
        search: { '$regex': '.*' }
      });
      assert.strictEqual(filter.status, undefined);
      assert.strictEqual(filter.priority, undefined);
      assert.strictEqual(filter.$or, undefined);
      assert.strictEqual(filter.owner, ownerId);
    });

    await test('Mongoose Query cast with sanitizeFilter proves trusted wrapper avoids CastError', async () => {
      // Turn on sanitizeFilter on Mongoose explicitly for this cast verification
      mongoose.set('sanitizeFilter', true);
      const ownerId = '507f1f77bcf86cd799439011';

      // 1. Untrusted filter: Mongoose sanitizeFilter neutralizes $regex in description and causes CastError
      const untrustedFilter = {
        owner: ownerId,
        $or: [
          { title: { $regex: 'search-term', $options: 'i' } },
          { description: { $regex: 'search-term', $options: 'i' } }
        ]
      };
      const qUntrusted = Task.find(untrustedFilter);
      qUntrusted._castConditions();
      assert.ok(qUntrusted.error(), 'Untrusted query must register a cast error');
      assert.strictEqual(qUntrusted.error().name, 'CastError');
      assert.strictEqual(qUntrusted.error().path, 'description');

      // 2. Filter built with buildTaskFilter: per-value mongoose.trusted() casts cleanly with no CastError
      const trustedFilter = buildTaskFilter(ownerId, { search: 'search-term' });
      const qTrusted = Task.find(trustedFilter);
      qTrusted._castConditions();
      assert.strictEqual(qTrusted.error(), undefined, 'Trusted query must not register any cast error');
    });

  } finally {
    // Cleanly terminate HTTP test server
    await new Promise(resolve => server.close(resolve));
    console.log('\nTest server shut down cleanly.');
  }

  // Summary Report
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
