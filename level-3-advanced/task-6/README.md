# Student Task Manager (Level 3 - Task 6)

A secure, full-stack Student Task Manager web application built for the **Cognifyz Full Stack Development Internship (Level 3: Advanced, Task 6: Database Integration and User Authentication)**.

Extending the RESTful architecture established in Task 5, Task 6 introduces production-grade **MongoDB database integration with Mongoose**, **password hashing via bcryptjs (cost 12)**, **stateless JSON Web Token (JWT) authentication**, and **strict per-user authorization checks** ensuring complete data isolation between authenticated students.

---

## Table of Contents

- [Features](#features)
- [Project Architecture](#project-architecture)
- [Getting Started & Setup](#getting-started--setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuring Environment Variables (.env)](#configuring-environment-variables-env)
  - [Running the Server](#running-the-server)
  - [Running Automated Tests](#running-automated-tests)
- [Security Notes](#security-notes)
  - [LocalStorage vs. httpOnly Cookies Trade-off](#localstorage-vs-httponly-cookies-trade-off)
  - [Why Output Encoding and textContent Matter](#why-output-encoding-and-textcontent-matter)
  - [Password Hashing and Timing Attack Defense](#password-hashing-and-timing-attack-defense)
  - [Strict Per-User Authorization & Existence Leak Prevention](#strict-per-user-authorization--existence-leak-prevention)
- [RESTful API Reference](#restful-api-reference)
  - [API Endpoints Summary](#api-endpoints-summary)
  - [Detailed Endpoint Documentation](#detailed-endpoint-documentation)
- [Front-End Features & UX States](#front-end-features--ux-states)
- [Manual Verification Checklist](#manual-verification-checklist)

---

## Features

- **MongoDB & Mongoose Database Layer**: Persistent schema-validated data storage with Mongoose (`models/User.js`, `models/Task.js`), indexing, and query sanitization (`mongoose.set('sanitizeFilter', true)`).
- **Decoupled Dual Store Architecture**: Shared asynchronous store interfaces for both MongoDB (`store/*.mongo.js`) and fast in-memory execution (`store/*.memory.js`), enabling tests to run with zero database or external network requirements.
- **Secure Authentication**: User registration with strong password rules (min 8 chars, uppercase, lowercase, numbers), duplicate email conflict prevention (409), password hashing via pure-JS `bcryptjs` (salt cost 12), and secure login issuing signed HS256 JWTs.
- **Timing-Attack Resistant Login**: Invariant bcrypt comparison against a dummy hash when non-existent email addresses are queried, ensuring uniform response times and identical error payloads.
- **Role & Identity Scoped Authorization**: `requireAuth` middleware verifies signatures with explicit algorithm whitelisting (`HS256`), checks expiration, and validates that the account still exists. All `/api/tasks` routes are strictly scoped to the token's authenticated user ID.
- **Information Leakage Prevention**: Attempts to access, modify, or delete another student's task return `404 Not Found` (rather than `403 Forbidden`), completely preventing enumeration and ID probing.
- **Defensive Input Validation & Sanitization**: Strict type checking (preventing NoSQL object injection like `{"$ne": null}`), client-supplied `owner` attributes stripped, and IDs validated as 24-character hex ObjectIds.
- **Zero-XSS Front-End**: Responsive UI using semantic HTML5, pure CSS, and vanilla JavaScript using `document.createElement()` and `textContent`. Dynamic API data never touches `innerHTML`.

---

## Project Architecture

```text
task-6/
├── server.js                     # Production entrypoint: env validation, Mongoose connection, HTTP listener
├── app.js                        # Express factory createApp({ taskStore, userStore, jwtSecret })
├── package.json                  # Scripts ("start", "test") and dependencies (5 total, pure JS)
├── .gitignore                    # Strictly ignores node_modules/ and .env
├── .env                          # Local secrets (never committed, created safely)
├── .env.example                  # Template with placeholder configuration
├── README.md                     # Comprehensive project documentation & security guide
├── models/
│   ├── User.js                   # Mongoose schema for User (email, name, passwordHash, createdAt)
│   └── Task.js                   # Mongoose schema for Task (title, description, status, priority, dueDate, owner)
├── store/
│   ├── taskStore.memory.js       # Asynchronous in-memory task store for test isolation
│   ├── taskStore.mongo.js        # Production MongoDB/Mongoose task store
│   ├── userStore.memory.js       # Asynchronous in-memory user store for test isolation
│   └── userStore.mongo.js        # Production MongoDB/Mongoose user store
├── middleware/
│   ├── requireAuth.js            # JWT verification, algorithm whitelist, and user existence check
│   └── errorHandler.js           # Central error handler formatting standard JSON error shapes
├── routes/
│   ├── auth.js                   # Auth endpoints (/api/auth/register, /login, /me)
│   └── tasks.js                  # Protected CRUD endpoints (/api/tasks)
├── validators/
│   ├── authValidator.js          # Registration and login type validation & schema checks
│   └── taskValidator.js          # Task schema validation, ObjectId verification, payload sanitization
├── public/                       # Front-end static client
│   ├── index.html                # Accessible HTML5 SPA with Auth & Task Manager views
│   ├── css/style.css             # Responsive styling, auth card, badges, modals, and toasts
│   └── js/app.js                 # Vanilla fetch client with Bearer token injection and 401 handling
└── tests/
    └── api.test.js               # 52 automated tests using Node.js built-ins (`http`, `assert`)
```

---

## Getting Started & Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MongoDB Atlas** account (or local MongoDB community instance)

### Installation

Install the 5 production dependencies (`express`, `mongoose`, `bcryptjs`, `jsonwebtoken`, `dotenv`):

```bash
npm install
```

### Configuring Environment Variables (.env)

The `.env` file was created with an exclusive-create operation containing a generated cryptographically secure 96-hex-character JWT secret and a placeholder MongoDB URI.

1. Open `.env` in your text editor.
2. Replace the placeholder database URI with your real MongoDB Atlas connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<your-cluster>.mongodb.net/studenttasks?retryWrites=true&w=majority
   JWT_SECRET=<pre-generated-random-secret>
   ```
3. Save the file.
4. **Important**: Never commit or share your `.env` file or connection string. `.gitignore` is pre-configured to ensure `.env` is never tracked in source control.

> **Note**: `server.js` validates these settings at startup and will deliberately refuse to launch if `MONGODB_URI` still contains the default `USERNAME:PASSWORD` placeholder, or if `JWT_SECRET` is shorter than 32 characters.

### Running the Server

Start the application connected to your MongoDB database:

```bash
npm start
```

Once started, open [http://localhost:3000](http://localhost:3000) in your web browser.

### Running Automated Tests

The automated test suite runs completely in-memory using Node.js built-ins (`http`, `assert`). It does **not** require a running MongoDB database or a `.env` file:

```bash
npm test
```

---

## Security Notes

### LocalStorage vs. httpOnly Cookies Trade-off

In web applications, storing authentication tokens presents an inherent architectural trade-off:

| Dimension | `localStorage` (Client-Side Storage) | `httpOnly`, `SameSite` Cookies |
| :--- | :--- | :--- |
| **XSS Vulnerability** | Tokens can be extracted by malicious JavaScript if an XSS vulnerability exists on the origin. | Protected from client-side script access (`document.cookie` cannot read `httpOnly` cookies). |
| **CSRF Vulnerability** | Completely immune to Cross-Site Request Forgery (CSRF) because the browser never automatically attaches tokens to cross-origin requests. | Requires explicit Anti-CSRF protection (e.g. Double Submit Cookie or `SameSite=Strict/Lax`) because browsers send cookies automatically. |
| **API Architecture** | Native compatibility with RESTful mobile apps, third-party clients, microservices, and SPA frameworks via standard `Authorization: Bearer <token>` headers. | Requires cookie jar management and dedicated CORS credentials configurations (`Access-Control-Allow-Credentials: true`). |

**Conclusion & Mitigation**: For single-page applications using `localStorage`, the primary threat is Cross-Site Scripting (XSS). To completely neutralize this vector, this application enforces strict output sanitization: **dynamic data from users and APIs is never rendered through `innerHTML`**.

### Why Output Encoding and textContent Matter

Cross-Site Scripting (XSS) occurs when untrusted data is parsed by the browser as executable HTML or JavaScript.

- **Vulnerable Code Pattern**:
  ```javascript
  // DANGEROUS: If task.title contains "<img src=x onerror=alert(1)>", it executes!
  element.innerHTML = `<span class="title">${task.title}</span>`;
  ```
- **Defensive Implementation in this Project**:
  ```javascript
  // SAFE: Browser treats content exclusively as raw text data; zero execution
  const titleSpan = document.createElement('span');
  titleSpan.className = 'title';
  titleSpan.textContent = task.title;
  parentElement.appendChild(titleSpan);
  ```

Every dynamic string (user name, task title, description, IDs, dates) is injected solely through `element.textContent`, ensuring that payloads containing `<script>`, `onerror`, or `<svg>` tags remain harmless literal strings.

### Password Hashing and Timing Attack Defense

1. **Bcryptjs (Cost 12)**: Passwords are never stored in plaintext. They are salted with cryptographically random salts and hashed using an adaptive work factor (cost 12), ensuring brute-force resistance against offline dictionary and GPU attacks.
2. **Timing Attack Invariance**: If an attacker attempts to log in with an email that does not exist in the database, traditional systems return immediately with an error (taking ~1ms), while valid accounts undergo bcrypt hashing (taking ~250ms). This allows attackers to enumerate registered users based on response time. In this application, when an email is not found, the server still compares the submitted password against a precomputed dummy hash (`DUMMY_BCRYPT_HASH`), equalizing response times and returning an identical error message (`"Invalid email or password"`).

### Strict Per-User Authorization & Existence Leak Prevention

1. **Token as Source of Truth**: The `owner` of a task is derived exclusively from the verified JWT in `req.user.id`. Any `owner` field supplied in request bodies is discarded.
2. **404 Instead of 403 on Multi-Tenant Access**: When User B attempts to access, modify, or delete a task belonging to User A:
   - Returning `403 Forbidden` would confirm to User B that the task ID exists.
   - Returning `404 Not Found` reveals nothing about whether the ID belongs to another user or never existed at all, preventing database probing.

---

## RESTful API Reference

### API Endpoints Summary

| Method | Endpoint | Auth Required | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | **Public** | System health status check | `200` |
| `POST` | `/api/auth/register` | **Public** | Register new user account | `201`, `400`, `409`, `415` |
| `POST` | `/api/auth/login` | **Public** | Authenticate credentials and receive JWT | `200`, `400`, `401`, `415` |
| `GET` | `/api/auth/me` | **Bearer Token** | Retrieve profile of authenticated user | `200`, `401` |
| `GET` | `/api/tasks` | **Bearer Token** | List user's tasks (search, filter, sort, paginate) | `200`, `401` |
| `GET` | `/api/tasks/:id` | **Bearer Token** | Retrieve a single task by 24-char ObjectId | `200`, `400`, `401`, `404` |
| `POST` | `/api/tasks` | **Bearer Token** | Create a new task owned by the user | `201`, `400`, `401`, `415` |
| `PUT` | `/api/tasks/:id` | **Bearer Token** | Full replacement of editable task fields | `200`, `400`, `401`, `404`, `415` |
| `PATCH` | `/api/tasks/:id` | **Bearer Token** | Partial update of editable task fields | `200`, `400`, `401`, `404`, `415` |
| `DELETE` | `/api/tasks/:id` | **Bearer Token** | Delete task owned by user | `204`, `400`, `401`, `404` |

---

## Detailed Endpoint Documentation

### Authentication Endpoints

#### 1. POST /api/auth/register
- **Request Body**:
  ```json
  {
    "name": "Alex Johnson",
    "email": "alex@university.edu",
    "password": "Password123"
  }
  ```
- **Validation Rules**: `name` (3–50 chars, string), `email` (valid email format, string), `password` (min 8 chars, 1 uppercase, 1 lowercase, 1 number, string). Non-string objects/arrays are rejected.
- **Success Response (201 Created)**:
  ```json
  {
    "id": "673708a2f4c12a001e9a1101",
    "name": "Alex Johnson",
    "email": "alex@university.edu",
    "createdAt": "2026-11-15T05:00:00.000Z"
  }
  ```

#### 2. POST /api/auth/login
- **Request Body**:
  ```json
  {
    "email": "alex@university.edu",
    "password": "Password123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "673708a2f4c12a001e9a1101",
      "name": "Alex Johnson",
      "email": "alex@university.edu",
      "createdAt": "2026-11-15T05:00:00.000Z"
    }
  }
  ```

#### 3. GET /api/auth/me
- **Header**: `Authorization: Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "673708a2f4c12a001e9a1101",
      "name": "Alex Johnson",
      "email": "alex@university.edu",
      "createdAt": "2026-11-15T05:00:00.000Z"
    }
  }
  ```

---

## Front-End Features & UX States

1. **Authentication Mode**:
   - Tab switcher between "Sign In" and "Create Account".
   - Client-side validation prior to network requests with error highlighting.
   - Server-returned field errors mapped to the exact matching inputs.
   - Task manager is completely unmounted/hidden until authentication succeeds.
2. **Authenticated Mode**:
   - Header displays the logged-in user's name (`👤 Alex Johnson`) and a quick "Logout" button.
   - Tasks list, filters, search, and pagination are loaded for the authenticated account.
   - Token stored in `localStorage` inside `try/catch`.
   - On 401 response, token is cleared and user is redirected to Sign In with an explanatory message.
3. **Task Management States**:
   - Loading indicator with animated spinner while fetching.
   - Accessible empty states when no tasks match current filters.
   - Edit dialog (PUT full replacement) and status quick-cycle button (PATCH partial update).
   - Confirmation dialog before calling DELETE.

---

## Manual Verification Checklist

Once your Atlas connection string is configured in `.env`, verify live database operations:

1. **Start Server**: Run `npm start` and observe successful Mongoose connection.
2. **Register**: Register a new student account (e.g. `student1@example.com`, `Password123`).
3. **Login**: Sign in with the newly created account. Notice the JWT stored in `localStorage`.
4. **Create Tasks**: Add tasks with different priorities and due dates. Check MongoDB Atlas collection `tasks` to confirm `owner` is populated with the user's ObjectId.
5. **Verify Data Isolation**:
   - Open an incognito browser window.
   - Register a second user (`student2@example.com`).
   - Confirm that Student 2 sees 0 tasks in their list.
   - Copy a Task ID from Student 1 and attempt to fetch `/api/tasks/<id>` using Student 2's token via curl or Postman; verify it returns `404 Not Found`.
6. **Token Expiry / Invalidation**: Manually edit the token in `localStorage` (tamper by 1 character) and refresh the page; verify the app automatically clears the invalid token and returns to Sign In.
7. **Logout**: Click the Logout button and confirm the user session is cleared.
