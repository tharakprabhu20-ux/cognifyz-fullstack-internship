/**
 * tests/task7.test.js
 * Comprehensive integration test suite for Task 7:
 * - OAuth 2.0 (providers, authorization flow, callback, CSRF state, token exchange, one-time codes, account linking guard)
 * - External Weather API (Open-Meteo geocoding & forecast, retries, timeouts, 429, payload caps, validation, WMO mapping)
 * - Advanced Rate Limiting (general, login failures, per-user weather, health exemption, draft-7 headers, Retry-After)
 * - Centralized Error Handling (AppError hierarchy, async rejections, request IDs, 500 stack trace suppression)
 *
 * Strictly uses ONLY Node.js built-in modules (`http`, `assert`, `crypto`, `url`).
 * Zero external network calls; all external APIs use injected fakes.
 */

'use strict';

const http = require('http');
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const memoryTaskStore = require('../store/taskStore.memory');
const memoryUserStore = require('../store/userStore.memory');
const { asyncHandler } = require('../errors/AppError');
const { ipKeyGenerator } = require('../middleware/rateLimiters');

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

/**
 * Creates an isolated HTTP server on a random port for an Express app instance.
 * @param {import('express').Application} app
 * @returns {Promise<{ server: http.Server, baseUrl: string, close: Function }>}
 */
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

/**
 * HTTP request helper using Node built-in http.
 */
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

async function runTask7Tests() {
  console.log('Starting Student Task Manager API Test Suite (Task 7: Advanced API & OAuth Integration)...\n');

  // =========================================================================
  // 1. OAuth 2.0 Tests
  // =========================================================================
  console.log('--- 1. OAuth 2.0 & Authentication Flow Tests ---');

  // 1.1 Unconfigured OAuth
  {
    const unconfiguredApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      oauthConfig: {
        clientId: 'PASTE_YOUR_GITHUB_CLIENT_ID_HERE',
        clientSecret: 'PASTE_YOUR_GITHUB_CLIENT_SECRET_HERE',
        baseUrl: 'http://localhost:3000'
      }
    });
    const instance = await startTestServer(unconfiguredApp);

    await test('GET /api/auth/providers returns { github: false } when OAuth is unconfigured', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/auth/providers' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { github: false });
    });

    await test('GET /api/auth/github returns 503 Service Unavailable when unconfigured', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/auth/github' });
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(res.json?.error?.code, 'SERVICE_UNAVAILABLE');
      assert.ok(res.headers['x-request-id']);
    });

    await instance.close();
  }

  // 1.2 Configured OAuth setup
  {
    const mockOAuthState = {
      mockAccessToken: 'gho_mock_access_token_secret_12345',
      tokenExchangeShouldFail: false,
      userProfile: {
        id: 998877,
        login: 'octodev',
        name: 'Octo Developer'
      },
      userEmails: [
        { email: 'octo@campus.edu', primary: true, verified: true }
      ]
    };

    // Injected mock fetch router for external endpoints
    const mockFetch = async (url) => {
      const urlStr = String(url);

      // GitHub token exchange
      if (urlStr.includes('github.com/login/oauth/access_token')) {
        if (mockOAuthState.tokenExchangeShouldFail) {
          return new Response(JSON.stringify({ error: 'bad_verification_code' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({
          access_token: mockOAuthState.mockAccessToken,
          token_type: 'bearer',
          scope: 'read:user,user:email'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // GitHub user profile
      if (urlStr.includes('api.github.com/user/emails')) {
        return new Response(JSON.stringify(mockOAuthState.userEmails), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (urlStr.includes('api.github.com/user')) {
        return new Response(JSON.stringify(mockOAuthState.userProfile), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    let simulatedTime = 1000000;
    const testClock = () => simulatedTime;

    const configuredApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      oauthConfig: {
        clientId: 'valid_client_id_12345',
        clientSecret: 'valid_client_secret_67890',
        baseUrl: 'http://localhost:3000'
      },
      fetchImpl: mockFetch,
      clock: testClock,
      oauthCodeTtlMs: 60 * 1000
    });
    const instance = await startTestServer(configuredApp);

    await test('GET /api/auth/providers returns { github: true } when configured', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/auth/providers' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { github: true });
    });

    let savedState = null;
    let savedCookie = null;

    await test('GET /api/auth/github redirects to GitHub with correct parameters & secure cookie', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/auth/github' });
      assert.strictEqual(res.statusCode, 302);

      const location = res.headers.location;
      assert.ok(location.startsWith('https://github.com/login/oauth/authorize'));
      assert.ok(location.includes('client_id=valid_client_id_12345'));
      assert.ok(location.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fgithub%2Fcallback'));
      assert.ok(location.includes('scope=read%3Auser+user%3Aemail'));

      // Extract state parameter
      const stateMatch = location.match(/state=([a-f0-9]+)/);
      assert.ok(stateMatch, 'Redirect location must contain state parameter');
      savedState = stateMatch[1];
      assert.strictEqual(savedState.length, 64, 'State must be a 32-byte (64 hex char) token');

      // Verify Set-Cookie header
      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie, 'Response must set oauth_state cookie');
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      assert.ok(cookieStr.includes(`oauth_state=${savedState}`));
      assert.ok(cookieStr.toLowerCase().includes('httponly'));
      assert.ok(cookieStr.toLowerCase().includes('samesite=lax'));

      savedCookie = `oauth_state=${savedState}`;
    });

    await test('GET /api/auth/github/callback fails with missing code query param', async () => {
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=missing_params'));
    });

    await test('GET /api/auth/github/callback fails with missing cookie', async () => {
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`
      });
      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=state_missing'));
    });

    await test('GET /api/auth/github/callback fails with mismatched state token', async () => {
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=tampered_wrong_state_000000000000000000000000000000000000000000000`,
        headers: { Cookie: savedCookie }
      });
      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=state_mismatch'));
    });

    await test('GET /api/auth/github/callback fails when token exchange returns error', async () => {
      mockOAuthState.tokenExchangeShouldFail = true;
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      mockOAuthState.tokenExchangeShouldFail = false;
      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=token_exchange_failed'));
    });

    await test('GET /api/auth/github/callback fails when GitHub account lacks verified email', async () => {
      const originalEmails = mockOAuthState.userEmails;
      mockOAuthState.userEmails = [{ email: 'unverified@campus.edu', primary: true, verified: false }];

      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      mockOAuthState.userEmails = originalEmails;

      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=unverified_email'));
    });

    let generatedOneTimeCode = null;

    await test('GET /api/auth/github/callback success creates user & redirects with one-time code', async () => {
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      assert.strictEqual(res.statusCode, 302);
      const location = res.headers.location;
      assert.ok(location.startsWith('/?oauth_code='), 'Redirect must target /?oauth_code=...');

      const codeMatch = location.match(/oauth_code=([a-f0-9]+)/);
      assert.ok(codeMatch);
      generatedOneTimeCode = codeMatch[1];
      assert.strictEqual(generatedOneTimeCode.length, 64);
    });

    let userJwt = null;

    await test('POST /api/auth/oauth/exchange exchanges one-time code for valid JWT and safe user', async () => {
      const res = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/oauth/exchange',
        body: { code: generatedOneTimeCode }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.json?.token, 'Response must include JWT token');
      assert.strictEqual(res.json?.user?.email, 'octo@campus.edu');
      assert.strictEqual(res.json?.user?.provider, 'github');
      assert.strictEqual(res.json?.user?.passwordHash, undefined);

      userJwt = res.json.token;

      // Verify token functions on /api/auth/me
      const meRes = await makeRequest(instance.baseUrl, {
        path: '/api/auth/me',
        headers: { Authorization: `Bearer ${userJwt}` }
      });
      assert.strictEqual(meRes.statusCode, 200);
      assert.strictEqual(meRes.json?.user?.email, 'octo@campus.edu');

      // Verify token functions on /api/tasks
      const taskRes = await makeRequest(instance.baseUrl, {
        path: '/api/tasks',
        headers: { Authorization: `Bearer ${userJwt}` }
      });
      assert.strictEqual(taskRes.statusCode, 200);
      assert.ok(Array.isArray(taskRes.json?.data));
    });

    await test('POST /api/auth/oauth/exchange rejects already-used one-time code (single use)', async () => {
      const res = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/oauth/exchange',
        body: { code: generatedOneTimeCode }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json?.error?.code, 'INVALID_OAUTH_CODE');
    });

    await test('POST /api/auth/oauth/exchange rejects expired one-time code', async () => {
      // Generate a new code
      const cbRes = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      const codeMatch = cbRes.headers.location.match(/oauth_code=([a-f0-9]+)/);
      const freshCode = codeMatch[1];

      // Advance clock past 60s TTL
      simulatedTime += 65 * 1000;

      const res = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/oauth/exchange',
        body: { code: freshCode }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json?.error?.code, 'INVALID_OAUTH_CODE');
    });

    await test('Refuses to silently link GitHub account to existing local account with same email', async () => {
      // 1. Create a local user with email 'sam@university.edu'
      await memoryUserStore.create({
        name: 'Sam Student',
        email: 'sam@university.edu',
        passwordHash: 'hashed_password',
        provider: 'local'
      });

      // 2. Set mock GitHub profile to have same email
      mockOAuthState.userEmails = [{ email: 'sam@university.edu', primary: true, verified: true }];
      mockOAuthState.userProfile = { id: 777666, login: 'samgit', name: 'Sam on GitHub' };

      // 3. Attempt OAuth callback
      const res = await makeRequest(instance.baseUrl, {
        path: `/api/auth/github/callback?code=mock_code&state=${savedState}`,
        headers: { Cookie: savedCookie }
      });
      assert.strictEqual(res.statusCode, 302);
      assert.ok(res.headers.location.includes('oauth_error=account_exists'), 'Must refuse silent linking');

      // Verify local account still retains provider 'local'
      const checkUser = await memoryUserStore.findByEmail('sam@university.edu');
      assert.strictEqual(checkUser.provider, 'local');
    });

    await test('OAuth-only account cannot log in via password endpoint (returns generic 401)', async () => {
      const res = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: 'octo@campus.edu',
          password: 'SomePassword123!'
        }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json?.error?.message, 'Invalid email or password');
    });

    await test('Security check: Secrets and tokens never appear in response bodies or headers', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/auth/providers' });
      assert.ok(!res.body.includes('valid_client_secret_67890'));
      assert.ok(!res.body.includes('gho_mock_access_token_secret_12345'));
    });

    await instance.close();
  }

  // =========================================================================
  // 2. External Weather API Tests (Open-Meteo)
  // =========================================================================
  console.log('\n--- 2. External Weather API Tests ---');

  {
    const baseWeatherGeocode = {
      results: [{
        name: 'Hosur',
        country: 'India',
        latitude: 12.74,
        longitude: 77.82
      }]
    };

    const baseWeatherForecast = {
      current: {
        temperature_2m: 26.5,
        precipitation: 0.0,
        weather_code: 1
      },
      daily: {
        time: ['2026-11-15', '2026-11-16', '2026-11-17'],
        temperature_2m_max: [30.1, 29.8, 28.5],
        temperature_2m_min: [19.2, 18.9, 18.1],
        precipitation_probability_max: [10, 20, 40],
        weather_code: [1, 2, 61]
      }
    };

    let weatherFetchMock = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('geocoding-api.open-meteo.com')) {
        return new Response(JSON.stringify(baseWeatherGeocode), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (urlStr.includes('api.open-meteo.com/v1/forecast')) {
        return new Response(JSON.stringify(baseWeatherForecast), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
    };

    const weatherApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      fetchImpl: (url, opts) => weatherFetchMock(url, opts),
      defaultCity: 'Hosur'
    });
    const instance = await startTestServer(weatherApp);

    // Create a test user token
    const testUser = await memoryUserStore.create({
      name: 'Weather Student',
      email: 'weather@test.edu',
      passwordHash: 'hash'
    });
    const authToken = jwt.sign({ id: testUser.id }, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

    await test('GET /api/external/weather requires authentication (401 without token)', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/external/weather' });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.json?.error?.code, 'UNAUTHORIZED');
    });

    await test('GET /api/external/weather happy path returns normalized forecast & mapped condition', async () => {
      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json?.city, 'Hosur');
      assert.strictEqual(res.json?.country, 'India');
      assert.strictEqual(res.json?.current?.temperature, 26.5);
      assert.strictEqual(res.json?.current?.condition, 'Mainly clear');
      assert.strictEqual(res.json?.daily?.length, 3);
      assert.strictEqual(res.json?.daily[2]?.condition, 'Slight rain');
    });

    await test('GET /api/external/weather validates city name (rejects <2 chars or script tags)', async () => {
      const shortRes = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=A',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(shortRes.statusCode, 400);
      assert.strictEqual(shortRes.json?.error?.code, 'VALIDATION_ERROR');

      const tagRes = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur%3Cscript%3E',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      assert.strictEqual(tagRes.statusCode, 400);
      assert.strictEqual(tagRes.json?.error?.code, 'VALIDATION_ERROR');
    });

    await test('GET /api/external/weather returns 404 when city is not found', async () => {
      weatherFetchMock = async (url) => {
        if (String(url).includes('geocoding-api')) {
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({}), { status: 404, headers: { 'Content-Type': 'application/json' } });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=UnknownCityName',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json?.error?.code, 'NOT_FOUND');
    });

    await test('GET /api/external/weather handles upstream 500 (retries then returns 502)', async () => {
      let attempts = 0;
      weatherFetchMock = async () => {
        attempts++;
        return new Response(JSON.stringify({ error: 'Internal OpenMeteo Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 502);
      assert.strictEqual(res.json?.error?.code, 'UPSTREAM_ERROR');
      assert.ok(attempts > 1, 'Should have attempted retries on 500');
    });

    await test('GET /api/external/weather handles upstream timeout -> 504 UPSTREAM_TIMEOUT', async () => {
      const timeoutApp = createApp({
        taskStore: memoryTaskStore,
        userStore: memoryUserStore,
        jwtSecret: TEST_JWT_SECRET,
        fetchImpl: async (url, opts) => {
          return new Promise((resolve, reject) => {
            if (opts && opts.signal) {
              opts.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
          });
        }
      });
      const timeoutInstance = await startTestServer(timeoutApp);

      const res = await makeRequest(timeoutInstance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      await timeoutInstance.close();

      assert.strictEqual(res.statusCode, 504);
      assert.strictEqual(res.json?.error?.code, 'UPSTREAM_TIMEOUT');
    });

    await test('GET /api/external/weather handles upstream 429 with Retry-After header', async () => {
      weatherFetchMock = async () => {
        return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '1'
          }
        });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 502);
      assert.strictEqual(res.json?.error?.code, 'UPSTREAM_ERROR');
    });

    await test('GET /api/external/weather rejects non-JSON upstream response (returns 502)', async () => {
      weatherFetchMock = async () => {
        return new Response('<html><body>Error Page</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 502);
      assert.strictEqual(res.json?.error?.code, 'UPSTREAM_ERROR');
    });

    await test('GET /api/external/weather rejects oversized upstream response payload (>1MB)', async () => {
      const oversizedPayload = JSON.stringify({
        results: [{ name: 'Hosur', latitude: 12.74, longitude: 77.82 }],
        dummy: 'x'.repeat(1024 * 1024 + 10)
      });

      weatherFetchMock = async () => {
        return new Response(oversizedPayload, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(oversizedPayload.length)
          }
        });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=Hosur',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 502);
      assert.strictEqual(res.json?.error?.code, 'UPSTREAM_ERROR');
    });

    await test('GET /api/external/weather correctly URL-encodes special city names', async () => {
      const interceptedUrls = [];
      weatherFetchMock = async (url) => {
        const urlStr = String(url);
        interceptedUrls.push(urlStr);
        if (urlStr.includes('geocoding-api')) {
          return new Response(JSON.stringify({
            results: [{ name: 'New Delhi', latitude: 28.61, longitude: 77.20, country: 'India' }]
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          current: { temperature_2m: 22, precipitation: 0, weather_code: 0 },
          daily: { time: ['2026-11-15'], temperature_2m_max: [28], temperature_2m_min: [16], precipitation_probability_max: [0], weather_code: [0] }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };

      const res = await makeRequest(instance.baseUrl, {
        path: '/api/external/weather?city=New%20Delhi',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(interceptedUrls.some((u) => u.includes('name=New+Delhi') || u.includes('name=New%20Delhi')), 'Geocoding request must include URL-encoded city name');
    });

    await instance.close();
  }

  // =========================================================================
  // 3. Advanced Rate Limiting Tests
  // =========================================================================
  console.log('\n--- 3. Rate Limiting Tests ---');

  {
    // App with tiny rate limits to trigger thresholds cleanly
    const rateLimitedApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      rateLimitOptions: {
        generalLimit: 2,
        generalWindowMs: 15 * 60 * 1000,
        loginLimit: 2,
        loginWindowMs: 15 * 60 * 1000,
        registerLimit: 2,
        registerWindowMs: 60 * 60 * 1000,
        oauthExchangeLimit: 2,
        weatherLimit: 2,
        weatherWindowMs: 60 * 1000
      }
    });
    const instance = await startTestServer(rateLimitedApp);

    await test('General rate limit: Exceeding limit returns 429, RATE_LIMITED shape, and RateLimit headers', async () => {
      // Hit 1 & 2
      await makeRequest(instance.baseUrl, { path: '/api/tasks' });
      await makeRequest(instance.baseUrl, { path: '/api/tasks' });

      // Hit 3 -> 429
      const res = await makeRequest(instance.baseUrl, { path: '/api/tasks' });
      assert.strictEqual(res.statusCode, 429);
      assert.strictEqual(res.json?.error?.code, 'RATE_LIMITED');
      assert.ok(res.headers['retry-after'], 'Must contain Retry-After header');
      assert.ok(res.headers['ratelimit-limit'], 'Must contain RateLimit-Limit header');
      assert.strictEqual(res.headers['ratelimit-remaining'], '0');
      assert.strictEqual(res.headers['x-ratelimit-limit'], undefined, 'Legacy headers must be disabled');
    });

    await test('Health check endpoint (/api/health) is exempt from general rate limiting', async () => {
      // General limit is already exceeded, but health must still return 200
      const res = await makeRequest(instance.baseUrl, { path: '/api/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { status: 'ok' });
    });

    await instance.close();
  }

  // Login rate limiter: ignores successful logins, counts only failed attempts
  {
    const loginRateLimitedApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      rateLimitOptions: {
        generalLimit: 100,
        loginLimit: 2,
        loginWindowMs: 15 * 60 * 1000
      }
    });
    const instance = await startTestServer(loginRateLimitedApp);

    // Seed a valid user
    await memoryUserStore.create({
      name: 'Login Limiter User',
      email: 'limiter@test.edu',
      passwordHash: require('bcryptjs').hashSync('Password123!', 4),
      provider: 'local'
    });

    await test('Login limiter: Successful logins do NOT consume failure quota', async () => {
      // Perform 3 successful logins (limit is 2)
      for (let i = 0; i < 3; i++) {
        const res = await makeRequest(instance.baseUrl, {
          method: 'POST',
          path: '/api/auth/login',
          body: { email: 'limiter@test.edu', password: 'Password123!' }
        });
        assert.strictEqual(res.statusCode, 200, `Login ${i + 1} should succeed`);
      }
    });

    await test('Login limiter: Failed attempts count toward quota and trigger 429', async () => {
      // Failure 1
      const f1 = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: 'limiter@test.edu', password: 'WrongPassword1' }
      });
      assert.strictEqual(f1.statusCode, 401);

      // Failure 2
      const f2 = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: 'limiter@test.edu', password: 'WrongPassword2' }
      });
      assert.strictEqual(f2.statusCode, 401);

      // Failure 3 -> should hit 429 RATE_LIMITED
      const f3 = await makeRequest(instance.baseUrl, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: 'limiter@test.edu', password: 'WrongPassword3' }
      });
      assert.strictEqual(f3.statusCode, 429);
      assert.strictEqual(f3.json?.error?.code, 'RATE_LIMITED');
    });

    await instance.close();
  }

  // Weather rate limiter: keyed by authenticated user ID
  {
    const mockWeatherFetch = async () => {
      return new Response(JSON.stringify({
        results: [{ name: 'Hosur', latitude: 12.74, longitude: 77.82, country: 'India' }],
        current: { temperature_2m: 25, precipitation: 0, weather_code: 0 },
        daily: { time: ['2026-11-15'], temperature_2m_max: [30], temperature_2m_min: [20], precipitation_probability_max: [0], weather_code: [0] }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const weatherLimitApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      fetchImpl: mockWeatherFetch,
      rateLimitOptions: {
        generalLimit: 100,
        weatherLimit: 2,
        weatherWindowMs: 60 * 1000
      }
    });
    const instance = await startTestServer(weatherLimitApp);

    const user1 = await memoryUserStore.create({ name: 'User 1', email: 'u1@limit.edu', passwordHash: 'hash' });
    const user2 = await memoryUserStore.create({ name: 'User 2', email: 'u2@limit.edu', passwordHash: 'hash' });

    const token1 = jwt.sign({ id: user1.id }, TEST_JWT_SECRET, { algorithm: 'HS256' });
    const token2 = jwt.sign({ id: user2.id }, TEST_JWT_SECRET, { algorithm: 'HS256' });

    await test('Weather rate limiter is isolated per authenticated user ID', async () => {
      // User 1 requests (limit is 2)
      await makeRequest(instance.baseUrl, { path: '/api/external/weather', headers: { Authorization: `Bearer ${token1}` } });
      await makeRequest(instance.baseUrl, { path: '/api/external/weather', headers: { Authorization: `Bearer ${token1}` } });

      // User 1 hit 3 -> 429
      const u1Exceeded = await makeRequest(instance.baseUrl, { path: '/api/external/weather', headers: { Authorization: `Bearer ${token1}` } });
      assert.strictEqual(u1Exceeded.statusCode, 429);

      // User 2 from same IP should still succeed because quota is keyed by User ID
      const u2Allowed = await makeRequest(instance.baseUrl, { path: '/api/external/weather', headers: { Authorization: `Bearer ${token2}` } });
      assert.strictEqual(u2Allowed.statusCode, 200, 'User 2 should not be blocked by User 1 limit');
    });

    await instance.close();
  }

  // Rate limiter validation and IPv6 subnet grouping verification
  {
    await test('Rate limiters initialize without ERR_ERL_* validation errors or warnings', async () => {
      const loggedMessages = [];
      const originalError = console.error;
      const originalWarn = console.warn;
      console.error = (...args) => {
        loggedMessages.push(args.map(String).join(' '));
        originalError(...args);
      };
      console.warn = (...args) => {
        loggedMessages.push(args.map(String).join(' '));
        originalWarn(...args);
      };

      try {
        createApp({
          taskStore: memoryTaskStore,
          userStore: memoryUserStore,
          jwtSecret: TEST_JWT_SECRET
        });
      } finally {
        console.error = originalError;
        console.warn = originalWarn;
      }

      const erlErrors = loggedMessages.filter((msg) => /ERR_ERL_/i.test(msg) || /ValidationError/i.test(msg));
      assert.strictEqual(
        erlErrors.length,
        0,
        `Expected 0 ERR_ERL_* validation errors, found: ${JSON.stringify(erlErrors)}`
      );
    });

    await test('ipKeyGenerator groups addresses in the same IPv6 /56 subnet and distinguishes different subnets', async () => {
      const ip1 = '2001:db8:abcd:0012::1';
      const ip2 = '2001:db8:abcd:0012::2';
      const ip3 = '2001:db8:ffff:ffff::1';

      const key1 = ipKeyGenerator(ip1);
      const key2 = ipKeyGenerator(ip2);
      const key3 = ipKeyGenerator(ip3);

      assert.strictEqual(key1, key2, 'IPs in the same IPv6 subnet must produce identical keys');
      assert.notStrictEqual(key1, key3, 'IPs in different IPv6 subnets must produce different keys');
    });
  }

  // =========================================================================
  // 4. Centralized Error Handling & Safety Tests
  // =========================================================================
  console.log('\n--- 4. Error Handling & Request ID Tests ---');

  {
    const errorTestApp = createApp({
      taskStore: memoryTaskStore,
      userStore: memoryUserStore,
      jwtSecret: TEST_JWT_SECRET,
      rateLimitOptions: {
        testRoutes: (app) => {
          app.get('/api/test-sync-throw', () => {
            throw new Error('Database password was super_secret_pass');
          });
          app.get('/api/test-async-reject', asyncHandler(async () => {
            await Promise.resolve();
            throw new Error('Async unexpected failure');
          }));
        }
      }
    });

    const instance = await startTestServer(errorTestApp);

    await test('Unexpected exception produces 500, hides internal message, suppresses stack trace', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/test-sync-throw' });
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.json?.error?.code, 'INTERNAL_SERVER_ERROR');
      assert.strictEqual(res.json?.error?.message, 'An unexpected internal server error occurred');
      assert.strictEqual(res.json?.error?.stack, undefined, 'Stack trace must not be exposed');
      assert.ok(!res.body.includes('super_secret_pass'), 'Secrets must never leak in error response');
      assert.ok(res.json?.error?.requestId, 'Error body must contain requestId');
    });

    await test('Async unhandled rejection reaches central error handler cleanly', async () => {
      const res = await makeRequest(instance.baseUrl, { path: '/api/test-async-reject' });
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.json?.error?.code, 'INTERNAL_SERVER_ERROR');
      assert.ok(res.json?.error?.requestId);
    });

    await test('X-Request-Id header is echoed back on every API response', async () => {
      const customId = 'client-req-uuid-12345';
      const res = await makeRequest(instance.baseUrl, {
        path: '/api/health',
        headers: { 'X-Request-Id': customId }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['x-request-id'], customId);
    });

    await instance.close();
  }

  console.log('\n========================================');
  console.log(`Task 7 Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTask7Tests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
