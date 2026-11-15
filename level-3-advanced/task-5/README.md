# Student Task Manager (Level 3 - Task 5)

A full-stack Student Task Manager web application built for the **Cognifyz Full Stack Development Internship (Level 3: Advanced, Task 5: API Integration and Front-End Interaction)**.

The application introduces full server-client communication via a RESTful API built with **Node.js** and **Express 4**, paired with a reactive, accessible front-end built in vanilla **HTML5, CSS3, and JavaScript** using `fetch()`.

---

## Table of Contents

- [Features](#features)
- [Project Architecture](#project-architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Server](#running-the-server)
  - [Running Automated Tests](#running-automated-tests)
- [RESTful API Reference](#restful-api-reference)
  - [Data Model](#data-model)
  - [Endpoints Summary](#endpoints-summary)
  - [Detailed Endpoint Documentation](#detailed-endpoint-documentation)
- [Client Usage Examples](#client-usage-examples)
  - [Using cURL](#using-curl)
  - [Using PowerShell `Invoke-RestMethod`](#using-powershell-invoke-restmethod)
- [Front-End Features & Security](#front-end-features--security)

---

## Features

- **Robust RESTful API**: Full CRUD endpoints (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) adhering to HTTP standards.
- **In-Memory Data Store**: Clean data access abstraction layer (`store/taskStore.js`) designed for modularity, allowing drop-in replacement with a database (e.g., MongoDB, PostgreSQL) in Task 6.
- **Strict Validation & Sanitization**: Comprehensive input validation (`validators/taskValidator.js`), enforcing title lengths, allowed statuses, priority ranks, and calendar date validation. Client-injected IDs and timestamps are ignored; unknown fields are stripped.
- **Search, Filtering, Sorting, & Pagination**: Full server-side query parameter processing.
- **Defensive Error Handling**: Centralized error middleware returning consistent error shapes `{ error: { code, message, details? } }` without exposing internal stack traces.
- **Security-First Front-End**: 100% vanilla JavaScript using `document.createElement()` and `textContent`. Dynamic data from the API never touches `innerHTML`, eliminating XSS vectors.
- **Full UX State Suite**: Live server health pill, debounced search, loading spinners, empty-state screens, dismissible error banners, disabled state on in-flight requests, and floating toast notifications.
- **Accessibility & Responsiveness**: Fully responsive across mobile (360px), tablet (768px), and desktop (1280px); includes visible `:focus-visible` indicators, screen reader live announcements (`aria-live`), and respects `prefers-reduced-motion`.

---

## Project Architecture

```text
cognifyz-task-5/
├── server.js                 # HTTP listener entrypoint (imports app.js and binds port)
├── app.js                    # Express application configuration, middlewares, and routes
├── package.json              # Scripts ("start", "test") and dependencies (express only)
├── .gitignore                # Ignores node_modules/ and .env
├── README.md                 # Complete documentation and API specification
├── routes/
│   └── tasks.js              # RESTful API route definitions and CRUD controller logic
├── store/
│   └── taskStore.js          # In-memory data layer (isolated for Task 6 DB integration)
├── validators/
│   └── taskValidator.js      # Business rules, validation schemas, and payload sanitization
├── public/                   # Static front-end web client
│   ├── index.html            # Semantic, accessible HTML5 single-page application
│   ├── css/style.css         # Modern, responsive CSS styling and design system
│   └── js/app.js             # Client-side API integration using native fetch()
└── tests/
    └── api.test.js           # Comprehensive automated test suite using Node built-ins
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher)

### Installation

Clone or open the project folder in your terminal, then install dependencies:

```bash
npm install
```

*(Only `express` is installed as an external dependency; the test suite uses Node.js built-in modules).*

### Running the Server

Start the application server:

```bash
npm start
```

The server will start on port `3000` (or the port defined in `process.env.PORT`):
```text
Student Task Manager server is running at http://localhost:3000
Health check: http://localhost:3000/api/health
API documentation & endpoints available at /api/tasks
```

Open your browser and navigate to:
```text
http://localhost:3000
```

### Running Automated Tests

Run the comprehensive integration test suite:

```bash
npm test
```

The test runner starts an in-process instance of the Express application on an ephemeral port, executes all test suites, outputs test results, and closes the server cleanly.

---

## RESTful API Reference

### Data Model

Each task resource contains the following fields:

| Field | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `number` | Server-generated | Unique positive integer identifier | `1` |
| `title` | `string` | **Yes** | 3 to 100 characters | `"Study for CS101 Midterm"` |
| `description`| `string` | No | Optional notes, max 500 characters | `"Review chapters 3 through 5"` |
| `status` | `string` | No (default: `"todo"`) | `"todo"` \| `"in-progress"` \| `"done"` | `"in-progress"` |
| `priority` | `string` | No (default: `"medium"`) | `"low"` \| `"medium"` \| `"high"` | `"high"` |
| `dueDate` | `string` | No (default: `null`) | ISO date string (`YYYY-MM-DD`) | `"2026-11-25"` |
| `createdAt` | `string` | Server-generated | ISO 8601 creation timestamp | `"2026-11-13T10:00:00.000Z"` |
| `updatedAt` | `string` | Server-generated | ISO 8601 update timestamp | `"2026-11-13T10:05:00.000Z"` |

---

### Endpoints Summary

All API endpoints are prefixed with `/api`.

| Method | Endpoint | CRUD Operation | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Read | Server and API health check | `200` |
| `GET` | `/api/tasks` | Read | List tasks with search, filter, sort, and pagination | `200`, `500` |
| `GET` | `/api/tasks/:id` | Read | Retrieve a single task by ID | `200`, `400`, `404`, `500` |
| `POST` | `/api/tasks` | Create | Create a new task (Location header set) | `201`, `400`, `415`, `500` |
| `PUT` | `/api/tasks/:id` | Update | Full replacement of editable fields | `200`, `400`, `404`, `415`, `500` |
| `PATCH` | `/api/tasks/:id` | Update | Partial update of provided fields | `200`, `400`, `404`, `415`, `500` |
| `DELETE`| `/api/tasks/:id` | Delete | Remove a task permanently (no content) | `204`, `400`, `404`, `500` |

---

### Detailed Endpoint Documentation

#### 1. System Health Check
- **`GET /api/health`**
- **Response `200 OK`**:
  ```json
  {
    "status": "ok"
  }
  ```

#### 2. List Tasks
- **`GET /api/tasks`**
- **Query Parameters**:
  - `status`: Filter by `"todo"`, `"in-progress"`, or `"done"`.
  - `priority`: Filter by `"low"`, `"medium"`, or `"high"`.
  - `search`: Case-insensitive substring match against `title` and `description`.
  - `sort`: Field to sort on: `"createdAt"` (default), `"dueDate"`, or `"priority"`.
  - `order`: `"asc"` or `"desc"` (default `"asc"`).
  - `page`: 1-based page number (default: `1`).
  - `limit`: Number of items per page (default: `10`, maximum: `50`).
- **Response `200 OK`**:
  ```json
  {
    "data": [
      {
        "id": 1,
        "title": "Complete CS101 Web Development Assignment",
        "description": "Build a responsive portfolio page and submit the GitHub repository link.",
        "status": "in-progress",
        "priority": "high",
        "dueDate": "2026-11-20",
        "createdAt": "2026-11-10T09:00:00.000Z",
        "updatedAt": "2026-11-10T09:00:00.000Z"
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

#### 3. Get Task By ID
- **`GET /api/tasks/:id`**
- **Responses**:
  - `200 OK`: Returns the matching task JSON object.
  - `400 Bad Request`: If `:id` is not a positive integer.
  - `404 Not Found`: If no task exists with the given ID.

#### 4. Create Task
- **`POST /api/tasks`**
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "title": "Submit Final Project Report",
    "description": "Include benchmarks and architecture diagram",
    "priority": "high",
    "status": "todo",
    "dueDate": "2026-11-30"
  }
  ```
- **Responses**:
  - `201 Created`: Returns newly created task. Header `Location: /api/tasks/:id` is set.
  - `400 Bad Request`: If title is missing or shorter than 3 characters, date format is invalid, etc.
  - `415 Unsupported Media Type`: If non-JSON payload is sent.

#### 5. Replace Task (PUT)
- **`PUT /api/tasks/:id`**
- **Headers**: `Content-Type: application/json`
- **Request Body**: (all editable fields validated)
  ```json
  {
    "title": "Submit Final Project Report - Revised",
    "description": "Added professor feedback revisions",
    "priority": "high",
    "status": "in-progress",
    "dueDate": "2026-12-02"
  }
  ```
- **Responses**:
  - `200 OK`: Returns the fully replaced task.
  - `400 Bad Request`: Validation failure.
  - `404 Not Found`: Task does not exist.

#### 6. Partial Update Task (PATCH)
- **`PATCH /api/tasks/:id`**
- **Headers**: `Content-Type: application/json`
- **Request Body**: (only fields to change; empty body rejected)
  ```json
  {
    "status": "done"
  }
  ```
- **Responses**:
  - `200 OK`: Returns the updated task.
  - `400 Bad Request`: Empty body or invalid field values.
  - `404 Not Found`: Task does not exist.

#### 7. Delete Task
- **`DELETE /api/tasks/:id`**
- **Responses**:
  - `204 No Content`: Resource deleted successfully (empty body).
  - `400 Bad Request`: Invalid ID format.
  - `404 Not Found`: Task does not exist.

---

### Standard Error Response Shape

All errors generated by validation or routing conform to this structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Task validation failed",
    "details": [
      {
        "field": "title",
        "message": "Title must be between 3 and 100 characters"
      }
    ]
  }
}
```

---

## Client Usage Examples

### Using cURL

#### 1. Check API Health
```bash
curl -i http://localhost:3000/api/health
```

#### 2. List Tasks with Filters and Sorting
```bash
curl -i "http://localhost:3000/api/tasks?status=todo&priority=high&sort=dueDate&order=asc"
```

#### 3. Create a New Task
```bash
curl -i -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Prepare Discrete Math Presentation\",\"priority\":\"high\",\"dueDate\":\"2026-11-28\"}"
```

#### 4. Retrieve Task by ID
```bash
curl -i http://localhost:3000/api/tasks/1
```

#### 5. Full Replacement (PUT)
```bash
curl -i -X PUT http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Complete CS101 Web Dev Assignment - Finalized\",\"description\":\"Submitted to LMS\",\"status\":\"done\",\"priority\":\"high\",\"dueDate\":\"2026-11-20\"}"
```

#### 6. Partial Status Update (PATCH)
```bash
curl -i -X PATCH http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"done\"}"
```

#### 7. Delete a Task
```bash
curl -i -X DELETE http://localhost:3000/api/tasks/1
```

---

### Using PowerShell `Invoke-RestMethod`

#### 1. Check API Health
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
```

#### 2. List Tasks
```powershell
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/tasks?page=1&limit=5" -Method Get
$response.data | Format-Table id, title, status, priority, dueDate
```

#### 3. Create a New Task
```powershell
$newTask = @{
    title       = "Prepare Physics Presentation"
    description = "Collaborate with lab partners on slides"
    priority    = "high"
    status      = "todo"
    dueDate     = "2026-11-25"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks" `
    -Method Post `
    -ContentType "application/json" `
    -Body $newTask
```

#### 4. Retrieve Single Task
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/1" -Method Get
```

#### 5. Full Replace (PUT)
```powershell
$updatedTask = @{
    title       = "Prepare Physics Presentation (Updated)"
    description = "Slides finalized and reviewed"
    status      = "in-progress"
    priority    = "high"
    dueDate     = "2026-11-25"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/1" `
    -Method Put `
    -ContentType "application/json" `
    -Body $updatedTask
```

#### 6. Partial Update (PATCH)
```powershell
$patchData = @{ status = "done" } | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/1" `
    -Method Patch `
    -ContentType "application/json" `
    -Body $patchData
```

#### 7. Delete Task
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/tasks/1" -Method Delete
```

---

## Front-End Features & Security

- **Safe DOM Rendering**: All user text is rendered with `document.createElement()` and `textContent`. Dynamic API data is never parsed as HTML.
- **Form Validation**: Provides immediate client-side feedback and dynamically renders server-side validation error messages under the corresponding inputs.
- **Quick Status Toggle**: Single-click cycling between `todo` &rarr; `in-progress` &rarr; `done`.
- **Accessible & Responsive**: Fully responsive across screens from 360px to 1280px, with keyboard support (`ESC` key to close modals), screen reader announcements (`aria-live`), and high-contrast focus rings.
