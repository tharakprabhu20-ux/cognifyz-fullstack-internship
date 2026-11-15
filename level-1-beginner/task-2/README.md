# Student Registration Desk (Cognifyz Level 1 - Task 2)

A clean, production-grade Node.js and Express 4 application implementing **Task 2: Inline Styles, Basic Interaction, and Server-Side Validation** for the Cognifyz Full Stack Development Internship (Level 1: Beginner).

---

## 📌 Project Overview

This project demonstrates core full-stack fundamentals without third-party CSS or client frameworks:
1. **Complex Form Construction (Step 1)**: Multi-field student admission form with custom inputs (select dropdown, radios, checkboxes, textareas, show/hide password, live character counter).
2. **Inline Styling & Client-Side Interaction (Step 2)**: Form components styled directly with inline `style="..."` attributes and verified with inline JavaScript (`onsubmit="return validateForm()"`).
3. **Server-Side Validation (Step 3)**: Re-validating all inputs on the backend with defensive checks, status 400 Bad Request error handling, and form repopulation (passwords excluded).
4. **Temporary Server-Side Storage (Step 4)**: In-memory store for validated records, safe SHA-256 password hashing (simulating production hashing), Post/Redirect/Get pattern, XSS defense via EJS `<%= %>` escaping, and friendly empty states.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18.x or later; tested on v24.x)
- npm (v9.x or later)

### Installation & Execution

```bash
# 1. Install dependencies (express and ejs only)
npm install

# 2. Run the automated end-to-end verification test suite
npm test

# 3. Start the application server
npm start
```

Once started, open your browser and visit:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🗺️ Application Routes

| Method | Endpoint | Description | Task Step |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Renders the Student Registration Desk form, feedback form, and course search. | Step 1, Step 2 |
| `POST` | `/register` | Validates submitted registration data on the server; on success stores record and redirects (302) to `/success`; on failure re-renders `/` with status `400`. | Step 3, Step 4 |
| `GET` | `/success` | Shows confirmation and details of the latest registered student (omits plain password & hash). | Step 4 |
| `GET` | `/submissions` | Displays all registered students in a formatted table with total count, or a friendly empty state when 0. | Step 4 |
| `POST` | `/feedback` | Accepts desk feedback (`name`, `rating`, `comment`) and renders `feedback-result.ejs`. | Task 1 Continuity |
| `GET` | `/search` | Filters courses by keyword (`q`) and renders `search-result.ejs` with a friendly "no match" state. | Task 1 Continuity |
| `*` | Any other URL | Catch-all 404 handler rendering custom `404.ejs` with status `404`. | Step 4 |

---

## 🛡️ Validation Rules (Client-Side vs. Server-Side)

Both client and server enforce identical business logic. Client-side validation improves immediate user experience, while server-side validation guarantees data integrity and security even if client scripts are bypassed or disabled.

| Field | Client-Side Rule (`index.ejs`) | Server-Side Rule (`server.js`) | Error Message |
| :--- | :--- | :--- | :--- |
| **Full Name** | Required; length &ge; 3 chars | `trim().length >= 3` | `"Full name must be at least 3 characters long."` |
| **Email Address** | Required; matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | Same regex validation | `"Please enter a valid email address (e.g. student@example.com)."` |
| **Phone Number** | Required; 10 digits starting with 6&ndash;9 (`/^[6-9]\d{9}$/`) | Same regex validation | `"Phone number must be exactly 10 digits starting with 6, 7, 8, or 9."` |
| **Date of Birth / Age** | Required; valid date; not future; age &ge; 15 | Same calculation from `req.body.dob` | `"Student must be at least 15 years old to register."` |
| **Course** | Selected from dropdown; not empty | Whitelist match in `COURSES` array | `"Please select a course."` |
| **Year of Study** | One radio selected (`1st`, `2nd`, `3rd`, `4th`) | Whitelist match in `YEARS` array | `"Please select your current year of study."` |
| **Technical Skills** | At least one checkbox checked | Normalized to array; all items must belong to `SKILLS` array | `"Please select at least one technical skill."` |
| **Password** | Required; length &ge; 8 chars | `password.length >= 8` | `"Password must be at least 8 characters long."` |
| **Confirm Password** | Must match password field | `password === confirmPassword` | `"Passwords do not match."` |
| **About You** | Max 200 characters (counter indicator) | `about.length <= 200` | `"About You section cannot exceed 200 characters."` |
| **Terms Agreement** | Checkbox must be ticked (enables submit button) | Must equal `'on'` or `'true'` | `"You must agree to the terms and conditions."` |

---

## 🔒 Security Best Practices Implemented

1. **Defense-in-Depth Validation**: Client scripts prevent unnecessary round trips; server validation protects against malicious tools (curl, Postman, automated bots) that bypass client checks.
2. **Password Security**: Passwords are never stored in plain text. A SHA-256 cryptographic digest is stored in memory. (*Note: Production apps should utilize bcrypt or argon2 with salt rounds, as covered in Task 6*). Passwords are never returned or refilled in form fields during validation error re-renders.
3. **Cross-Site Scripting (XSS) Prevention**: All user inputs are safely escaped using EJS `<%= %>` syntax rather than unescaped `<%- %>`.
4. **Post/Redirect/Get (PRG) Pattern**: Successful form submissions issue a 302 redirect to `/success` to prevent duplicate submissions upon page refresh.
5. **Least Privilege & No Sandbox Bypass**: Developed strictly within normal sandbox boundaries without modifying system or file permissions.

---

## 📂 Project Structure

```
├── server.js
├── package.json
├── .gitignore
├── README.md
├── tests/
│   └── verify.js
└── views/
    ├── index.ejs
    ├── success.ejs
    ├── submissions.ejs
    ├── feedback-result.ejs
    ├── search-result.ejs
    ├── 404.ejs
    └── partials/
        ├── header.ejs
        └── footer.ejs
```

---

## 🧪 Automated Testing

Run the full end-to-end test suite:
```bash
npm test
```

The test runner starts the application on an ephemeral port, verifies all 8 functional verification scenarios plus server restart data clearance, and cleanly shuts down.

