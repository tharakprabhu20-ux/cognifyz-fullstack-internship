# Student Task Manager (Level 4 - Task 7)

A secure, production-grade Student Task Manager web application built for the **Cognifyz Full Stack Development Internship (Level 4: Expert, Task 7: Advanced API Usage and External API Integration)**.

Extending the database-backed REST application from Task 6, Task 7 introduces **OAuth 2.0 ("Continue with GitHub") server-side authentication**, **external third-party API integration with Open-Meteo for live campus weather forecasts**, **resilient HTTP client features (timeouts, retries with exponential backoff & jitter, response size caps)**, **multi-tier rate limiting with `express-rate-limit` (draft-7 standard headers)**, and **structured centralized error handling with correlation request IDs (`X-Request-Id`)**.

---

## Table of Contents

- [Features](#features)
- [How OAuth 2.0 Works (Architecture & Security)](#how-oauth-20-works-architecture--security)
- [Project Architecture & Directory Structure](#project-architecture--directory-structure)
- [API Reference & Rate Limiting Rules](#api-reference--rate-limiting-rules)
- [Security Guarantees & Network Policies](#security-guarantees--network-policies)
  - [OAuth CSRF Defense via `state` Cookie](#oauth-csrf-defense-via-state-cookie)
  - [Ephemeral One-Time Code Pattern for Safe JWT Delivery](#ephemeral-one-time-code-pattern-for-safe-jwt-delivery)
  - [Account Linking Guard](#account-linking-guard)
  - [Why `trust proxy` Is Disabled by Default](#why-trust-proxy-is-disabled-by-default)
  - [Zero-XSS Output Encoding](#zero-xss-output-encoding)
- [Getting Started & Setup](#getting-started--setup)
- [Automated Test Suites](#automated-test-suites)
- [Manual Verification Checklist](#manual-verification-checklist)

---

## Features

1. **OAuth 2.0 Integration ("Continue with GitHub")**:
   - Implements the complete OAuth 2.0 Authorization Code Grant flow.
   - Browser-safe: `client_secret` is kept exclusively on the server and never exposed to the client.
   - CSRF protection: Generates a 32-byte cryptographic hex `state` token stored in an `httpOnly`, `SameSite=Lax` cookie and verified with `crypto.timingSafeEqual`.
   - Ephemeral One-Time Exchange Code: Successfully authenticated GitHub sessions receive a single-use, 60-second in-memory code delivered via redirect query parameter, which the frontend immediately exchanges for our application's HS256 JWT without ever passing the JWT in a URL.
   - Account Linking Protection: Explicitly prevents silent account hijacking; if an OAuth account provides an email already registered locally with a password, the system refuses silent linking with a dedicated error.
   - Unconfigured Graceful Degradation: If `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` are missing or set to placeholders (`PASTE_...`), the server starts normally, reports `providers.github = false`, and returns `503 Service Unavailable` on OAuth endpoints.

2. **External Weather API Integration (Open-Meteo)**:
   - Integrates the free Open-Meteo API (no API key required) to provide students with campus weather and 3-day daily forecasts.
   - Two-step query: Geocodes city names via `https://geocoding-api.open-meteo.com/v1/search`, then queries forecasts via `https://api.open-meteo.com/v1/forecast`.
   - Maps raw numerical WMO weather interpretation codes into human-readable conditions (e.g. "Mainly clear", "Slight rain").
   - Defensive input sanitization: Enforces strict city name patterns (2–60 characters, letters, spaces, hyphens, and periods) to block command and query injection.

3. **Hardened HTTP Client Service (`services/httpClient.js`)**:
   - Strict 5-second request timeouts implemented via `AbortController`.
   - Up to 2 automatic retries with exponential backoff and jitter for transient network failures, 5xx server errors, and 429 rate limit responses (respecting `Retry-After` headers).
   - Non-retriable handling for 4xx client errors.
   - Enforces 1 MB maximum response payload size limit to prevent memory exhaustion attacks.
   - Strict JSON `Content-Type` verification preventing non-JSON upstream response injection.
   - Zero credential leakage: Upstream errors are normalized into clean `UpstreamError` (502) or `UpstreamTimeout` (504) without forwarding upstream request URLs or bodies containing secrets.

4. **Multi-Tier Rate Limiting (`middleware/rateLimiters.js`)**:
   - Built with `express-rate-limit` using standard IETF Draft-7 headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`) while disabling legacy headers.
   - Emits standard JSON 429 responses with machine-readable `RATE_LIMITED` code, request IDs, and `Retry-After` headers.
   - **General `/api`**: 100 requests per 15 min per IP (`/api/health` exempt).
   - **Login `/api/auth/login`**: 10 requests per 15 min per IP, counting ONLY failed attempts (`skipSuccessfulRequests: true`).
   - **Register `/api/auth/register`**: 5 requests per hour per IP to prevent spam accounts.
   - **OAuth Exchange `/api/auth/oauth/exchange`**: 10 requests per minute per IP.
   - **Weather `/api/external/weather`**: 20 requests per minute keyed by authenticated User ID.

5. **Centralized Error Handling Architecture (`errors/AppError.js`)**:
   - Structured error hierarchy: `AppError`, `ValidationError` (400), `AuthError` (401), `NotFoundError` (404), `RateLimitError` (429), `UpstreamError` (502/504).
   - `asyncHandler` route wrapper capturing rejected promises in Express 4 without unhandled promise rejections.
   - Global crash handlers (`uncaughtException`, `unhandledRejection`) in `server.js` ensuring safe process termination without credential exposure.
   - Correlation IDs: Generates or forwards `X-Request-Id` on all requests and includes `requestId` in every error body.
   - Production safety: Status 500 errors suppress internal messages and stack traces, returning `"An unexpected internal server error occurred"`.

---

## How OAuth 2.0 Works (Architecture & Security)

OAuth 2.0 is an industry-standard authorization framework that allows third-party applications to obtain limited access to an HTTP service on behalf of a resource owner without sharing the user's master credentials.

The **Authorization Code Grant Flow** involves four distinct roles:
1. **Resource Owner**: The student user who owns the account.
2. **Client**: Our Student Task Manager web application.
3. **Authorization Server**: GitHub's authentication system (`github.com/login/oauth`).
4. **Resource Server**: GitHub's API servers (`api.github.com`) hosting profile data and email addresses.

```text
+-------------------+        1. Click "Continue with GitHub"         +---------------------+
|                   | ---------------------------------------------> |                     |
|                   |                                                |  Student Task       |
|                   | <--------------------------------------------- |  Manager Server     |
|                   |    2. 302 Redirect to GitHub (/authorize)      |                     |
|                   |       Set-Cookie: oauth_state=<random_hex>     +---------------------+
|                   |                                                           |
|                   |        3. User logs in & grants consent                   |
|   Web Browser     | ---------------------------------------------\            |
|   (User Agent)    |                                              |            |
|                   | <--------------------------------------------/            |
|                   |    4. 302 Redirect to Callback URI                        |
|                   |       /?code=<auth_code>&state=<state>                    |
|                   |                                                           |
|                   |        5. GET /api/auth/github/callback                   |
|                   | --------------------------------------------------------> |
|                   |                                                           | 6. POST /access_token
|                   |                                                           |    (code + client_secret)
|                   |                                                           v
|                   |                                                +---------------------+
|                   |                                                |  GitHub OAuth       |
|                   |                                                |  Authorization &    |
|                   |                                                |  API Servers        |
|                   |                                                +---------------------+
|                   |                                                           | 7. Access Token
|                   |                                                           | 8. Fetch Profile/Email
|                   |                                                           v
|                   |    9. 302 Redirect to /?oauth_code=<one_time_code>        |
|                   | <-------------------------------------------------------- |
|                   |                                                           |
|                   | 10. POST /api/auth/oauth/exchange { code }               |
|                   | --------------------------------------------------------> |
|                   | 11. Returns App JWT & Safe User                           |
|                   | <-------------------------------------------------------- |
+-------------------+
```

### Key Security Design Choices:
- **Server-Side Token Exchange**: The browser receives only an authorization code. The code is exchanged for an access token directly between our backend server and GitHub via back-channel HTTPS. This ensures our `client_secret` is never exposed in client-side code, network logs, or browser inspection.
- **CSRF Prevention with `state`**: When initiating the flow, the server generates a cryptographically random 32-byte hex `state` token and stores it in a secure, `httpOnly`, `SameSite=Lax` cookie. When GitHub redirects back to the callback URL, the query parameter `state` is compared against the cookie in constant time (`crypto.timingSafeEqual`). An attacker cannot forge this matching pair, preventing cross-site request forgery attacks where an attacker links their own account to a victim's session.
- **Scopes**: We request only the minimal necessary permissions (`read:user user:email`) to read the student's profile and verified email.
- **OAuth 2.0 vs. OpenID Connect (OIDC)**: OAuth 2.0 is designed for *delegated authorization* (issuing tokens to access APIs). OIDC is an identity layer built on top of OAuth 2.0 that provides standardized authentication and signed ID tokens (JWTs) representing the user's identity. Here, we use OAuth 2.0 to access GitHub's API and verify identity server-side.
- **App JWT vs. GitHub Token**: The GitHub access token is used on the server solely to retrieve the student's verified profile and email. Once fetched, the GitHub token is immediately discarded and never stored or returned to the browser. The application then issues its own short-lived HS256 JWT, decoupling our task authorization from third-party token lifetimes.

---

## Project Architecture & Directory Structure

```text
task-7/
├── server.js                     # Entry point: env validation, process crash guards, Mongoose & HTTP listen
├── app.js                        # Express factory createApp({ taskStore, userStore, oauthConfig, ... })
├── package.json                  # Scripts ("start", "test") and dependencies (6 total, pure JS)
├── package-lock.json             # Dependency lockfile
├── .gitignore                    # Ignores node_modules/ and .env
├── .env                          # Local credentials (MONGODB_URI, JWT_SECRET, GITHUB keys, etc.)
├── .env.example                  # Template with non-sensitive placeholder configuration
├── README.md                     # Comprehensive architecture and security documentation
├── errors/
│   └── AppError.js               # AppError class hierarchy & async route wrapper (asyncHandler)
├── models/
│   ├── User.js                   # Mongoose schema: provider ('local'|'github'), providerId, passwordHash
│   └── Task.js                   # Mongoose schema for Task (owner-scoped, sanitized)
├── store/
│   ├── taskStore.memory.js       # In-memory task store for test isolation
│   ├── taskStore.mongo.js        # Production MongoDB/Mongoose task store
│   ├── userStore.memory.js       # In-memory user store with provider & providerId support
│   └── userStore.mongo.js        # MongoDB user store with OAuth search indices
├── middleware/
│   ├── rateLimiters.js           # express-rate-limit configurations (general, login, register, oauth, weather)
│   ├── requireAuth.js            # JWT verification, HS256 algorithm enforcement, user lookup
│   └── errorHandler.js           # Central JSON error handler (requestId, 500 safety, no stack traces)
├── services/
│   ├── githubOAuth.js            # GitHub OAuth state, token exchange, email verification, OAuthCodeStore
│   ├── weatherClient.js          # Open-Meteo geocoding and forecast fetcher with WMO code translation
│   └── httpClient.js             # Hardened fetchJsonWithRetry (timeout, backoff, 429 Retry-After, 1MB cap)
├── routes/
│   ├── auth.js                   # Authentication routes (/api/auth/register, /login, /me)
│   ├── oauth.js                  # OAuth routes (/api/auth/providers, /github, /github/callback, /oauth/exchange)
│   ├── external.js               # External API routes (/api/external/weather)
│   └── tasks.js                  # Protected CRUD task management routes (/api/tasks)
├── validators/
│   ├── authValidator.js          # Registration and login body validation & sanitization
│   └── taskValidator.js          # Task validation, ObjectId verification, owner stripping
├── public/                       # Front-end static client (Vanilla JS, CSS, zero innerHTML)
│   ├── index.html                # Single-page app with Auth view, Task Manager view, and Weather card
│   ├── css/style.css             # Responsive styling, weather layout, GitHub OAuth button
│   └── js/app.js                 # Frontend SPA logic, OAuth exchange, weather card rendering
└── tests/
    ├── api.test.js               # 71 automated Task 6 regression tests (zero regressions)
    └── task7.test.js             # 34 automated Task 7 integration tests (OAuth, Weather, Rate Limits, Errors)
```

---

## API Reference & Rate Limiting Rules

All rate limit responses emit standard draft-7 headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`) and a `Retry-After` header when throttled.

| Method | Endpoint | Auth Required | Rate Limit Rule | Description |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | Public | **Exempt** from rate limits | System health status check |
| **GET** | `/api/auth/providers` | Public | General (100 / 15m) | Reports configured authentication providers (`{ github: bool }`) |
| **GET** | `/api/auth/github` | Public | General (100 / 15m) | Initiates GitHub OAuth flow (302 redirect) or returns 503 if unconfigured |
| **GET** | `/api/auth/github/callback` | Public | General (100 / 15m) | Receives authorization code, validates state, and redirects to `/?oauth_code=...` |
| **POST**| `/api/auth/oauth/exchange` | Public | **10 req / min per IP** | Exchanges single-use one-time code for JWT and user profile |
| **POST**| `/api/auth/register` | Public | **5 req / hour per IP** | Registers new local student account with bcrypt password |
| **POST**| `/api/auth/login` | Public | **10 failed req / 15m per IP** | Authenticates local student and issues 1-hour HS256 JWT |
| **GET** | `/api/auth/me` | Bearer JWT | General (100 / 15m) | Returns current authenticated student profile |
| **GET** | `/api/external/weather` | Bearer JWT | **20 req / min per User ID** | Fetches live weather and 3-day forecast for requested city |
| **GET** | `/api/tasks` | Bearer JWT | General (100 / 15m) | Lists tasks owned by authenticated user (search, filter, paginate) |
| **POST**| `/api/tasks` | Bearer JWT | General (100 / 15m) | Creates a task owned automatically by the authenticated user |
| **GET** | `/api/tasks/:id` | Bearer JWT | General (100 / 15m) | Retrieves a specific task (404 if owned by another student) |
| **PUT** | `/api/tasks/:id` | Bearer JWT | General (100 / 15m) | Full update of an owned task |
| **PATCH**| `/api/tasks/:id`| Bearer JWT | General (100 / 15m) | Partial update of an owned task |
| **DELETE**| `/api/tasks/:id`| Bearer JWT| General (100 / 15m) | Deletes an owned task |

---

## Security Guarantees & Network Policies

### OAuth CSRF Defense via `state` Cookie
To prevent Cross-Site Request Forgery (CSRF) in the OAuth exchange, the server generates a cryptographically random 32-byte hex state token during `GET /api/auth/github`. The state token is set in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) and passed in the GitHub authorize redirect URL. When the user returns to `/api/auth/github/callback`, the query parameter is verified against the cookie using constant-time comparison (`crypto.timingSafeEqual`). If either the cookie or query parameter is missing or mismatched, the callback is aborted immediately.

### Ephemeral One-Time Code Pattern for Safe JWT Delivery
Delivering sensitive JWT tokens directly in URL fragments or query strings exposes them to browser history, server access logs, and referrer headers. Instead:
1. Upon successful GitHub verification, the server generates a 32-byte random one-time code stored in memory with a strict 60-second time-to-live (TTL).
2. The user is redirected to `/?oauth_code=<code>`.
3. The frontend immediately captures the code, sanitizes the URL via `window.history.replaceState()`, and executes `POST /api/auth/oauth/exchange { code }`.
4. The server validates the code, atomically deletes it from memory (guaranteeing single-use), and delivers the JWT in the JSON response payload.

### Account Linking Guard
If a student registers locally using an email address (e.g., `student@university.edu`) and later clicks "Continue with GitHub" using a GitHub account sharing that email, the server **never silently links the accounts**. Silent linking allows attackers who control an email address or third-party account to hijack existing accounts. The server rejects the attempt with `/?oauth_error=account_exists`, instructing the user to log in with their password.

### Why `trust proxy` Is Disabled by Default
By default, Express does not trust reverse proxy headers like `X-Forwarded-For`. If `app.set('trust proxy', true)` were enabled without a verified reverse proxy (such as Nginx, Cloudflare, or AWS ALB), any client could easily spoof their IP address by sending custom `X-Forwarded-For` headers, completely bypassing IP-based rate limiting on `/register` or `/login`. Therefore, `trust proxy` is enabled only when explicitly set via the `TRUST_PROXY` environment variable.

### Zero-XSS Output Encoding
All dynamic data from user input or external APIs (including Open-Meteo forecasts) is rendered strictly via `document.createElement()` and `element.textContent`. The application never assigns API responses to `innerHTML`, guaranteeing complete immunity against stored or reflected Cross-Site Scripting (XSS).

---

## Getting Started & Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher (v24 LTS recommended)
- **npm**: v9.0.0 or higher
- **MongoDB Atlas** database connection URI
- **GitHub OAuth App** (optional; app degrades gracefully if omitted)

### Installation
```bash
npm install
```

### Environment Configuration (.env)
Create a `.env` file based on `.env.example`:
```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/studenttasks?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_at_least_32_characters_long_placeholder
GITHUB_CLIENT_ID=PASTE_YOUR_GITHUB_CLIENT_ID_HERE
GITHUB_CLIENT_SECRET=PASTE_YOUR_GITHUB_CLIENT_SECRET_HERE
APP_BASE_URL=http://localhost:3000
DEFAULT_CITY=Hosur
TRUST_PROXY=false
```

### Starting the Server
```bash
npm start
```
The server will start at `http://localhost:3000`.

---

## Automated Test Suites

The project includes 105 automated unit and integration tests executing strictly with Node.js built-ins (`http`, `assert`, `crypto`). Tests run 100% offline using in-memory stores and injected fakes with zero real network or database calls.

Run all test suites:
```bash
npm test
```

### Test Breakdown:
- **`tests/api.test.js`**: 71 tests validating Task 6 authentication, task CRUD, access isolation, NoSQL injection guards, and pagination.
- **`tests/task7.test.js`**: 34 tests validating OAuth 2.0 flows, state CSRF checks, token exchanges, Open-Meteo weather integration, retries, timeouts, payload limits, rate limiters, and error handling.

---

## Manual Verification Checklist

1. **GitHub Login**:
   - Ensure real GitHub keys are in `.env`.
   - Open `http://localhost:3000`. The "Continue with GitHub" button appears.
   - Click it, authorize on GitHub, verify clean redirect back without tokens in the URL, and confirm task dashboard displays student name with `(GitHub)`.
2. **State Tampering**:
   - Initiate login, intercept redirect URL, modify the `state` query parameter, and proceed. Verify redirect to `/?oauth_error=state_mismatch`.
3. **One-Time Code Reuse**:
   - Copy the `?oauth_code=...` parameter and attempt a second manual `POST /api/auth/oauth/exchange { code }` via curl/Postman. Verify HTTP 401 `INVALID_OAUTH_CODE`.
4. **Campus Weather Card**:
   - Log in and inspect the Weather Card displaying current temperature and 3-day forecast for Hosur.
   - Enter another city (e.g. `Bengaluru`) and verify instant forecast update.
5. **Triggering 429 Rate Limit**:
   - Submit 11 consecutive wrong password attempts on `/api/auth/login`. Verify 11th request returns `429 Too Many Requests` with `RATE_LIMITED` and `Retry-After`.
6. **Data Isolation (Second User)**:
   - Log in with GitHub and create a task.
   - Log out, register a second local account, and verify the second user sees zero tasks from the GitHub user.
