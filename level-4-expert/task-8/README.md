# Student Task Manager (Level 4 - Task 8)

A secure, enterprise-grade Student Task Manager web application built for the **Cognifyz Full Stack Development Internship (Level 4: Expert, Task 8: Advanced Server-Side Functionality)**.

Extending the application from Task 6 (Auth & MongoDB) and Task 7 (OAuth 2.0, Open-Meteo Weather, Rate Limiting), Task 8 introduces **advanced server-side functionality for robust, high-performance web applications**:
1. **Hardened Middleware Pipeline**: Strict 8-stage pipeline ordering, structured single-line JSON access logging (`middleware/accessLogger.js`), strict Content Security Policy (`helmet`), response timing headers (`X-Response-Time`), request correlation IDs (`X-Request-Id`), and zero-leakage error handling.
2. **Resilient Background Job Queue**: In-memory task queue (`jobs/JobQueue.js`) with configurable concurrency, explicit state transitions (`queued` -> `running` -> `succeeded` / `failed`), retries with exponential backoff, per-job timeouts, 503 queue capacity bounds, result TTL retention, and crash isolation. Includes asynchronous task export (`jobs/exportJob.js`) with spreadsheet formula-injection protection and periodic deadline reminder scheduling (`jobs/reminderScheduler.js`).
3. **Multi-Tier Server-Side Caching**: Unified cache abstraction (`cache/`) featuring an in-memory Least Recently Used (LRU) cache with TTL expiration (`cache/MemoryCache.js`) and a resilient Redis adapter (`cache/RedisCache.js`) that lazily loads `redis` and automatically falls back to in-memory caching upon connection failure. Provides 30-second task query caching with per-user version invalidation, 10-minute weather forecast caching with concurrent in-flight promise request coalescing, private cache headers, and extended health telemetry (`/api/health`).

---

## Table of Contents

- [Features & System Architecture](#features--system-architecture)
- [Middleware Pipeline (Order & Execution)](#middleware-pipeline-order--execution)
- [Background Job Queue Architecture](#background-job-queue-architecture)
  - [Queue State Machine & Resiliency](#queue-state-machine--resiliency)
  - [BullMQ / Redis Queue Design & Migration Path](#bullmq--redis-queue-design--migration-path)
  - [Task Export Job (CSV Formula Injection Defense)](#task-export-job-csv-formula-injection-defense)
  - [Periodic Reminder Scheduler & Notifications](#periodic-reminder-scheduler--notifications)
- [Server-Side Caching Architecture](#server-side-caching-architecture)
  - [MemoryCache (LRU & TTL)](#memorycache-lru--ttl)
  - [RedisCache & Resilient Fallback](#rediscache--resilient-fallback)
  - [Task List Invalidation via Per-User Version Counters](#task-list-invalidation-via-per-user-version-counters)
  - [Weather Caching & Concurrent In-Flight Promise Coalescing](#weather-caching--concurrent-in-flight-promise-coalescing)
- [Content Security Policy (CSP) & Frontend Refactoring](#content-security-policy-csp--frontend-refactoring)
- [Graceful Shutdown Lifecycle](#graceful-shutdown-lifecycle)
- [API Reference (Endpoints Table)](#api-reference-endpoints-table)
- [Automated Test Suites](#automated-test-suites)
- [Manual Verification Checklist](#manual-verification-checklist)

---

## Features & System Architecture

```text
+-------------------------------------------------------------------------------------------------+
|                                    Client Browser / User Agent                                  |
+-------------------------------------------------------------------------------------------------+
                                               |  (HTTPS / REST)
                                               v
+-------------------------------------------------------------------------------------------------+
|                                   Express 4 Middleware Pipeline                                 |
|  1. Request ID (X-Request-Id) ---> 2. Access Logger (JSON) ---> 3. Helmet CSP & Headers        |
|  4. Body Parser (10kb limit)  ---> 5. Rate Limiters (IETF-7) ---> 6. Authenticated Routes       |
+-------------------------------------------------------------------------------------------------+
       |                                       |                                    |
       v                                       v                                    v
+---------------------+             +---------------------+              +----------------------+
|    Task Storage     |             |  Background Engine  |              |    Caching Engine    |
| - Mongo / Mongoose  |             | - JobQueue (2 slots)|              | - MemoryCache (LRU)  |
| - MemoryTaskStore   |             | - Task Export (CSV) |              | - RedisCache (lazy)  |
| - Sanitized Filter  |             | - Reminder Scanner  |              | - Promise Coalescing |
+---------------------+             +---------------------+              +----------------------+
```

---

## Middleware Pipeline (Order & Execution)

The Express application pipeline in `app.js` strictly enforces an 8-stage sequence:

1. **Request ID Injection (`req.id` & `X-Request-Id`)**:
   Reuses the incoming `X-Request-Id` correlation header or generates a new cryptographically random UUID (`crypto.randomUUID()`). Attached before all logging and error handling so every response carries a traceable ID.
2. **Access Logger (`middleware/accessLogger.js`)**:
   Emits exactly one compact, single-line JSON log per request on completion:
   `{"time":"...","requestId":"...","method":"GET","path":"/api/tasks","status":200,"durationMs":3,"responseSize":320,"userId":"..."}`
   *Security Note*: Strictly strips URL query strings (`/api/tasks?token=secret` logs as `/api/tasks`), never captures headers, bodies, cookies, passwords, or tokens. Injects `X-Response-Time` (e.g. `4ms`). Silent during automated test runs via injected log levels.
3. **Security Headers (`helmet`)**:
   Enforces strict HTTP headers:
   - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.
   - `X-Content-Type-Options: nosniff`.
   - Disables `X-Powered-By` completely to avoid framework fingerprinting.
4. **Body Parsing with Strict Boundaries**:
   - Rejects non-JSON mutations (`POST`, `PUT`, `PATCH`) with `415 Unsupported Media Type`.
   - Binds body payload cap to `10kb` via `express.json({ limit: '10kb' })`.
   - Returns structured `400 Bad Request` on malformed JSON syntax and `413 Payload Too Large` on oversized requests.
5. **Rate Limiting (`middleware/rateLimiters.js`)**:
   Enforces multi-tier IP and user quotas with standard IETF Draft-7 headers. `/api/health` is exempt.
6. **Application Routes**:
   Static files (`public/`), `/api/health`, `/api/auth`, `/api/tasks`, `/api/jobs`, `/api/notifications`, `/api/external`.
7. **404 Catch-All Handler**:
   Catches all unmapped `/api/*` routes and returns standardized JSON error shape.
8. **Centralized Error Handler (`middleware/errorHandler.js`)**:
   Formats all exceptions into `{ error: { code, message, requestId, details? } }`. Status 500 errors suppress internal database or runtime stack traces.

---

## Background Job Queue Architecture

### Queue State Machine & Resiliency

Implemented in `jobs/JobQueue.js`, the queue manages asynchronous workloads with strict failure isolation:
- **Concurrency**: Configured to process up to 2 active jobs in parallel. Additional tasks wait in `waitingQueue`.
- **Explicit Lifecycle**: `queued` ➔ `running` ➔ `succeeded` or `failed`.
- **Exponential Backoff Retries**: Failed jobs retry with formula `delay = backoffBaseMs * 2^(attempt - 1)`.
- **Per-Job Timeout**: Configurable timeout (default 30s) cancels hung workers without blocking queue slots.
- **Overload Protection**: When queued items exceed `maxQueueLength` (100), incoming requests are immediately rejected with `503 Service Unavailable` (`QueueFullError`).
- **Crash Isolation**: If a worker throws an unhandled synchronous or asynchronous exception, it is caught safely, recorded on the job, and retried or marked `failed`. The Node process never crashes.
- **TTL Retention & Pruning**: Finished jobs retain results for 1 hour (`jobTtlMs`), after which expired records are pruned automatically.

### BullMQ / Redis Queue Design & Migration Path

The `JobQueue` class mirrors the industry-standard **BullMQ** / **Redis Streams** interface:
- `enqueue(type, data, options)` corresponds to `queue.add(name, data, opts)`.
- `define(type, handler)` corresponds to `worker = new Worker(queueName, processor)`.
- `getJob(id)` corresponds to `queue.getJob(jobId)`.
- `drain(timeoutMs)` corresponds to `worker.close()`.

*Production Scaling Path*:
To migrate from the in-memory queue to a distributed Redis BullMQ cluster across multiple server containers:
1. Replace `this.jobs` and `this.waitingQueue` with a BullMQ `Queue` instance backed by Redis.
2. Spin up independent worker processes subscribing to the BullMQ queue.
3. The Express routes (`POST /api/tasks/export`, `GET /api/jobs/:id`, `GET /api/jobs/:id/download`) require zero business logic changes because method signatures and return shapes match 1:1.

### Task Export Job (CSV Formula Injection Defense)

Implemented in `jobs/exportJob.js`:
- `POST /api/tasks/export { format: "csv" | "json" }` returns `202 Accepted` with `{ jobId, statusUrl }`.
- Processes tasks page by page (`limit = 50`) using `taskStore.getAll` until `page > totalPages`, updating progress (`job.progress: 0–100%`).
- **Spreadsheet Formula Injection Defense**: When generating CSV files, if a cell value begins with `=`, `+`, `-`, `@`, or a tab (`\t`), it is automatically prefixed with a single quote (`'`). All text values are quoted in RFC-4180 compliant double quotes with doubled internal quotes (`""`). This prevents malicious spreadsheet command execution when opened in Excel or Google Sheets.
- Artifacts are stored in memory and downloaded via `GET /api/jobs/:id/download` with `Content-Disposition: attachment`.
- Strict ownership verification: If User B requests User A's job status or download, the server returns `404 Not Found` to prevent data and existence leaks.

### Periodic Reminder Scheduler & Notifications

Implemented in `jobs/reminderScheduler.js`:
- Runs periodically based on `REMINDER_INTERVAL_MINUTES` (default 60).
- Uses `setInterval()` with `.unref()` so active timers never prevent clean process exit.
- **Overlap Guard**: An atomic `isRunning` flag ensures that if a previous reminder scan is still executing, overlapping scans are safely skipped.
- Detects non-done tasks (`status !== 'done'`) due within 24 hours.
- Stores simulated notifications in memory, strictly capped at 50 notifications per user.
- `GET /api/notifications` returns the caller's notifications with `Cache-Control: private, no-cache`.

---

## Server-Side Caching Architecture

### MemoryCache (LRU & TTL)

`cache/MemoryCache.js` implements a high-performance in-memory cache:
- **LRU Eviction**: Backed by a JavaScript `Map`, which guarantees insertion/access iteration order. On retrieval, accessed keys are re-inserted at the most-recent position. When size reaches `maxEntries` (default 500), the oldest key (`map.keys().next().value`) is evicted.
- **Lazy TTL Expiration**: When an item is requested past its `expiresAt`, it is deleted on-demand and counted as a cache miss.
- **Injectable Clock**: Takes an optional `clock = () => Date.now()` parameter enabling instant time advancement in unit tests.

### RedisCache & Resilient Fallback

`cache/RedisCache.js`:
- Used in production when `REDIS_URL` is configured in environment variables.
- Utilizes lazy module loading: `require('redis')` is invoked only when instantiated.
- **Resilient Fallback**: If Redis disconnects or throws an error, the adapter catches the exception, logs a warning once, marks itself degraded, and transparently handles reads and writes using the fallback `MemoryCache`. User requests never fail and the server never crashes due to Redis issues.

### Task List Invalidation via Per-User Version Counters

`routes/tasks.js` caches `GET /api/tasks` for 30 seconds:
- Cache key format: `tasks:<userId>:v<version>:<queryHash>`.
- `queryHash` is a SHA-256 hash of sorted query filters (`status`, `priority`, `search`, `sort`, `order`, `page`, `limit`).
- Every user has an in-memory version counter. Whenever a mutation occurs (`POST /api/tasks`, `PUT /api/tasks/:id`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`), `bumpUserTaskVersion(userId)` increments the user's version number.
- Old cached keys become immediately unreachable and will naturally expire.
- **User Isolation**: User B's cache keys are scoped to `userId`, preventing cross-user cache leakage.
- Responses emit `X-Cache: HIT` or `X-Cache: MISS`.

### Weather Caching & Concurrent In-Flight Promise Coalescing

`routes/external.js` caches weather forecasts for 10 minutes (600s):
- Keyed by normalized city: `weather:<city_lowercase>`.
- **In-Flight Promise Coalescing**: Uses a memory Map (`inFlightWeather`) tracking active upstream fetch promises. If 10 concurrent requests arrive for "Hosur", only the first request dispatches the upstream Open-Meteo HTTP fetch. The other 9 requests await the identical in-flight Promise.
- Failures are never cached: If Open-Meteo returns 500, the promise rejects, cleans up the in-flight map, and does not write to cache.

---

## Content Security Policy (CSP) & Frontend Refactoring

To comply with the strict Content Security Policy, all inline scripts, inline styles, and event attributes in `public/index.html` were refactored into semantic external CSS classes:

| Element Refactored | Previous Inline Style | Refactored CSS Class |
| :--- | :--- | :--- |
| Header Action Group | `style="display: flex; align-items: center; gap: 1rem;"` | `.header-actions` |
| Sign In Button | `style="width: 100%;"` | `.btn-block` |
| Register Button | `style="width: 100%;"` | `.btn-block` |
| GitHub OAuth Link | `style="width: 100%; text-decoration: none;"` | `.btn-block .no-decor` |
| Weather Title Row | `style="display: flex; align-items: center; gap: 0.6rem;"` | `.weather-title-row` |

All event handlers are attached via `addEventListener` in `public/js/app.js`. Dynamic data rendering uses `textContent` and `createElement` exclusively, guaranteeing complete XSS protection under CSP.

---

## Graceful Shutdown Lifecycle

Implemented in `lifecycle/shutdown.js`:
On receiving termination signals (`SIGINT` or `SIGTERM`):
1. **Stop Incoming HTTP Traffic**: Calls `server.close()` to stop accepting new client connections.
2. **Stop Scheduler Timers**: Calls `reminderScheduler.stop()` to clear periodic scan intervals.
3. **Drain Task Queue**: Calls `jobQueue.drain(timeoutMs)` to allow active workers to finish within a bounded timeout.
4. **Disconnect Redis**: Closes Redis client connections safely.
5. **Close Database**: Closes Mongoose MongoDB connection cleanly.
6. **Idempotent Execution**: If multiple signals are caught concurrently, subsequent shutdown calls return immediately without duplicate teardowns.

---

## API Reference (Endpoints Table)

| Method | Endpoint | Auth | Cache Policy | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | None | System uptime, queue length & cache telemetry | 200 |
| `POST` | `/api/auth/register` | Public | None | Create new student account | 201, 400, 409, 415 |
| `POST` | `/api/auth/login` | Public | None | Login with email and password | 200, 400, 401, 415 |
| `GET` | `/api/auth/me` | JWT | `private, no-cache` | Fetch profile of authenticated user | 200, 401 |
| `GET` | `/api/auth/providers` | Public | None | Check available OAuth providers | 200 |
| `GET` | `/api/auth/github` | Public | None | Initiate GitHub OAuth authorization | 302, 503 |
| `GET` | `/api/auth/github/callback` | Public | None | GitHub OAuth code callback | 302, 400, 409, 502 |
| `POST` | `/api/auth/oauth/exchange` | Public | None | Exchange one-time code for JWT | 200, 400, 401 |
| `GET` | `/api/tasks` | JWT | 30s (`X-Cache`) | Paginated tasks (filters, search, sort) | 200, 401 |
| `POST` | `/api/tasks` | JWT | Invalidation | Create new task | 201, 400, 401, 415 |
| `GET` | `/api/tasks/:id` | JWT | `private, no-cache` | Retrieve single task by ObjectId | 200, 400, 401, 404 |
| `PUT` | `/api/tasks/:id` | JWT | Invalidation | Full replacement of task fields | 200, 400, 401, 404 |
| `PATCH`| `/api/tasks/:id` | JWT | Invalidation | Partial update of task fields | 200, 400, 401, 404 |
| `DELETE`| `/api/tasks/:id` | JWT | Invalidation | Delete task by ID | 204, 400, 401, 404 |
| `POST` | `/api/tasks/export` | JWT | `private, no-cache` | Enqueue background export (CSV/JSON) | 202, 400, 401, 503 |
| `GET` | `/api/jobs/:id` | JWT | `private, no-cache` | Poll status and progress of job | 200, 401, 404 |
| `GET` | `/api/jobs/:id/download` | JWT | `private, no-cache` | Download finished export artifact | 200, 400, 401, 404 |
| `GET` | `/api/notifications` | JWT | `private, no-cache` | List 24h task due notifications | 200, 401 |
| `GET` | `/api/external/weather`| JWT | 10m (`X-Cache`) | Campus forecast with coalescing | 200, 400, 401, 404, 429, 502, 504 |

---

## Automated Test Suites

The test suite runs using Node.js built-in modules (`http`, `assert`, `crypto`) with complete in-memory stores and zero external dependencies:

```bash
npm test
```

### Test Summary
- **Task 6 Test Suite (`tests/api.test.js`)**: 71 / 71 Passed
- **Task 7 Test Suite (`tests/task7.test.js`)**: 36 / 36 Passed
- **Task 8 Test Suite (`tests/task8.test.js`)**: 26 / 26 Passed
- **Overall Total**: **133 / 133 Passed (0 Failed, 0 Warnings)**

---

## Manual Verification Checklist

1. **CSP Conformance**:
   - Open `http://localhost:3000` in Google Chrome or Mozilla Firefox.
   - Open Developer Tools (`F12`) ➔ Console tab.
   - Verify that NO Content Security Policy (CSP) violation errors or inline script/style blocks are flagged.
2. **Background Task Export**:
   - Log in and add several tasks.
   - Click **📥 Export CSV**; observe progress bar advance from `0%` to `100%`.
   - Downloaded CSV opens cleanly; test cells with `=1+1` to verify formula injection prefixing (`'=1+1`).
   - Click **📥 Export JSON**; verify valid formatted JSON file download.
3. **Server-Side Cache Verification**:
   - Open Network tab in Developer Tools.
   - Refresh task list: Observe response header `X-Cache: MISS`.
   - Click ↻ Refresh immediately: Observe response header `X-Cache: HIT`.
   - Add a new task: Observe subsequent list fetch returns `X-Cache: MISS` (invalidated).
4. **Due Task Reminders**:
   - Create a task with a Due Date set to today.
   - Observe notification badge and reminder item in the Due Task Reminders card.
5. **Graceful Shutdown**:
   - In terminal running `node server.js`, press `Ctrl+C`.
   - Observe graceful shutdown log: stopping HTTP listener, stopping scheduler, draining queue, closing MongoDB, and clean termination.
