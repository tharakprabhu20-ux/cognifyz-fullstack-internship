# Cognifyz Full Stack Development Internship (Level 2: Intermediate)
## Task 4: Complex Form Validation and Dynamic DOM Manipulation
### Theme: Student Portal

A single-page application (SPA) built with pure vanilla HTML5, CSS3, and modern JavaScript (ES5/ES6 compatible). It contains **zero external dependencies**, no build tools, no frameworks, and requires no local web server. It can be opened directly by double-clicking `index.html` in any browser (`file://` protocol).

---

## 📌 Project Overview

This application fulfills all objectives and technical requirements for **Level 2, Task 4** of the Cognifyz Full Stack Development Internship:

1. **Step 1: Complex Form Validation (`js/validators.js` & `# /register`)**
   - Multi-rule client-side validation implemented as pure, side-effect-free functions.
   - Real-time live feedback on `input` and `blur` events with accessible `aria-live` and `aria-invalid` announcements.
   - Dynamic password security suite:
     - 0–4 score algorithm with visual meter bar changing width and color across 5 tiers (*Very weak*, *Weak*, *Fair*, *Strong*, *Very strong*).
     - Live 5-rule interactive checklist ticking on (✓) and off (✕) as the user types.
     - Strict rejection safeguards: forbids passwords containing the username, the word `"password"`, or 3+ repeated consecutive characters.
     - Interactive Show/Hide plain-text toggle button.
   - Exact calendar age calculation enforcing the minimum 15-year age requirement without timezone shift bugs.
   - The submit button remains disabled until all form rules are satisfied.

2. **Step 2: Dynamic DOM Manipulation (`js/app.js` & `# /students`)**
   - Dynamic UI generation constructed entirely using `document.createElement`, `element.textContent`, and DOM node operations.
   - **Zero XSS vulnerability**: User input is never concatenated or injected into `innerHTML`.
   - **Zero sensitive credential persistence**: Passwords are validated for registration criteria and discarded immediately; they are never stored in memory or persistence.
   - Student roster stored in-memory and synchronized with `localStorage` wrapped in protective `try...catch` blocks to handle private browsing quotas or corrupted data.
   - Real-time client-side search filtering by student name, username, or email.
   - Multi-field sorting (Newest First, Oldest First, Name A–Z, Name Z–A).
   - Dynamic counter badge reporting displayed counts (`Showing X of Y students`).
   - Instant student removal with a **5-second live Undo buffer** and toast notification.
   - Friendly empty states for both an empty directory and empty search queries.

3. **Step 3: Client-Side Routing (`js/router.js`)**
   - Hash-based Single-Page Application (SPA) routing (`#/home`, `#/register`, `#/students`, `#/about`, and a 404 `# /not-found` view).
   - Zero-reload navigation updating `<main id="app">`.
   - Full browser Back and Forward history navigation support via `window.addEventListener('hashchange', ...)`.
   - Synchronized navigation link states (`aria-current="page"` and CSS `.active`).
   - Route-specific document titles (`document.title`).
   - Accessibility-focused focus management (automatically shifts keyboard focus to the main page heading after navigation and scrolls to the top).
   - **Unsaved Changes Confirmation Guard**: Intercepts navigation away from the registration form when unsubmitted data is present, warning the user and allowing them to cancel navigation.

---

## 🗂 Project Structure

```text
├── index.html                  # Semantic, accessible HTML entry point
├── css/
│   └── style.css               # Responsive design, light theme, accessible focus & color contrast
├── js/
│   ├── validators.js           # Pure validation functions (works in browser & Node.js)
│   ├── router.js               # Hash-based SPA router with navigation guards (works in browser & Node.js)
│   └── app.js                  # Views, reactive DOM rendering, event handling & state persistence
├── tests/
│   └── test-validators.js      # Automated unit tests using Node built-in assert
└── README.md                   # Documentation, specifications, and testing guide
```

---

## 🚀 How to Run and Test

### 1. Running the Application in a Browser
- Navigate to the project directory in your file explorer.
- **Double-click `index.html`** to open it in Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari.
- Alternatively, right-click `index.html` and select **Open with...** > your preferred browser.
- No local web server (e.g. Live Server or http-server) is required because the project avoids ES module imports and local `fetch()` calls.

### 2. Running Automated Unit Tests
The project includes an automated test suite verifying all validators, password scoring, age calculations, and router matching logic using only Node's built-in `assert` module.

Open your terminal in the project directory and run:
```bash
node tests/test-validators.js
```

---

## 📋 Table of Form Validation Rules & Messages

| Field | Validation Criteria | Valid Example | Invalid Example | Error Message Shown |
| :--- | :--- | :--- | :--- | :--- |
| **Full Name** | Min 3 characters, alphabetic letters and spaces only. | `Rahul Sharma` | `Al`, `Rahul123` | *"Full name must be at least 3 characters long."* / *"Full name can only contain letters and spaces."* |
| **Email** | Standard RFC 5322 compliant format with valid user and domain. | `student@example.com` | `student@`, `no-domain` | *"Please enter a valid email address (e.g., student@domain.com)."* |
| **Username** | 4–15 characters, starts with a letter, letters/numbers/underscores only. | `rahul_01` | `123user`, `usr@name` | *"Username must start with an alphabetic letter."* / *"Username must be between 4 and 15 characters long."* |
| **Password** | Score 0–4 based on 5 checks (length >= 8, uppercase, lowercase, number, special char). Disallows username, `"password"`, and 3+ repeating chars. | `Student#2026Pass` | `short`, `MyPassword!1`, `Aaa1!bcdefgh` | *"Password cannot contain the word 'password'."* / *"Password cannot contain your username."* / *"Password cannot contain 3 or more repeating characters in a row."* |
| **Confirm Password** | Must match the entered password exactly and cannot be empty. | Matching password string | Mismatched string | *"Passwords do not match."* / *"Please confirm your password."* |
| **Phone** | Exactly 10 digits, Indian mobile number starting with 6, 7, 8, or 9. | `9876543210` | `5123456789`, `98765` | *"Indian mobile number must start with 6, 7, 8, or 9."* / *"Phone number must be exactly 10 digits."* |
| **Date of Birth** | Valid calendar date, not in the future, age >= 15 years old. | `2005-05-15` | `2026-12-01`, `2015-01-01` | *"Date of birth cannot be in the future."* / *"You must be at least 15 years old to register (current age: X)."* |
| **Terms of Service** | Must be checked (`true`). | Checked (`true`) | Unchecked (`false`) | *"You must accept the Terms and Conditions."* |

---

## 🌐 Application Routes

| Route | View Name | Description |
| :--- | :--- | :--- |
| `#/home` | **Home** | Portal welcome dashboard, quick enrollment statistics, and architectural highlights. |
| `#/register` | **Register** | Interactive student enrollment form with live validation, password checklist, and strength bar. |
| `#/students` | **Students** | Reactive student directory with live search filtering, multi-order sorting, and 5s Undo removal. |
| `#/about` | **About** | Detailed technical breakdown of internship task steps, architecture, and security design. |
| `#/not-found` | **404 View** | User-friendly fallback screen for unrecognized URLs with a button to return home. |

---

## 🛡 Security & Defensive Architecture

1. **Anti-XSS DOM Insertion**:
   - `textContent` is strictly enforced for all user-provided data.
   - Dynamic components are constructed using `document.createElement`.
   - No dynamic string interpolation is performed in `innerHTML`.

2. **Credential Sanitization**:
   - Passwords exist solely in temporary memory during validation on the registration form.
   - When a student profile is created, only non-sensitive demographic attributes (`id`, `name`, `username`, `email`, `phone`, `dob`, `createdAt`) are saved.

3. **Storage Fault Tolerance**:
   - All `localStorage` interactions are guarded by `try...catch` blocks to prevent uncaught exceptions in restrictive environments or when quotas are exceeded.
   - Corrupted or invalid JSON data in storage is gracefully detected and cleaned without crashing the application.
