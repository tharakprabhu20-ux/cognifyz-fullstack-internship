# Task 1: HTML Structure and Basic Server Interaction
**Cognifyz Full Stack Development Internship — Level 1 (Beginner)**  
**Theme:** Student Registration Desk Application

---

## 📌 Project Overview
This project is an introductory full-stack application built to understand **Server-Side Rendering (SSR)** and **HTTP form handling**. It uses Node.js with the Express web framework and EJS as the templating engine.

### Key Objectives Covered
1. **HTML Structure & Forms:** Multi-field forms using standard HTML5 input controls (text, email, number, select, radio, checkbox, textarea) with fully accessible `<label for="...">` associations.
2. **Express Server Setup:** Setting up a minimal, robust HTTP server using Express 4.
3. **Endpoint Handlers:** Processing both `POST` requests (URL-encoded body via `express.urlencoded`) and `GET` requests (query parameters via `req.query`).
4. **Server-Side Rendering with EJS:** Dynamically generating HTML views with escaped data (`<%= %>`) for security against Cross-Site Scripting (XSS).

---

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Web Framework:** Express 4
- **Template Engine:** EJS (Embedded JavaScript)
- **Styling:** Custom CSS contained inside a single `<style>` block in `partials/header.ejs` (no external CSS frameworks or front-end JS used).

---

## 📂 Project Structure
```text
Task 1/
├── server.js              # Express server setup, routes, and business logic
├── package.json           # Dependencies and scripts ("start": "node server.js")
├── .gitignore             # Ignores node_modules/ and .env
├── README.md              # Project documentation and guide
└── views/                 # EJS templates rendered server-side
    ├── index.ejs          # Home page with 3 forms (Registration, Feedback, Search)
    ├── result.ejs         # Displays submitted registration details in a table
    ├── feedback-result.ejs# Displays submitted feedback and numeric rating
    ├── search-result.ejs  # Displays course search matches or empty state
    ├── 404.ejs            # Custom 404 Not Found error page
    └── partials/
        ├── header.ejs     # HTML <head>, styles, navigation, opens <main>
        └── footer.ejs     # Closes <main>, footer information, closing tags
```

---

## 🚀 How to Run the Project

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v16 or higher).

### 1. Install Dependencies
Open your terminal in the project directory and run:
```bash
npm install
```
*(Only `express` and `ejs` will be installed).*

### 2. Start the Server
```bash
npm start
```
The server will start on port 3000 by default:
```text
[Server] Student Registration Desk running at http://localhost:3000
```

### 3. Open in Browser
Navigate to:
```text
http://localhost:3000
```

---

## 🌐 Endpoints & Routes

| Method | Endpoint | Description | Request Data Source | Rendered View |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Home page displaying all three interactive forms | None | `index.ejs` |
| `POST` | `/register` | Handles student registration form submission | `req.body` (URL-encoded) | `result.ejs` |
| `POST` | `/feedback` | Handles desk feedback submission | `req.body` (URL-encoded) | `feedback-result.ejs` |
| `GET` | `/search` | Searches course catalog by keyword query | `req.query.q` | `search-result.ejs` |
| `*` | Any unmatched | Fallback route returning HTTP 404 Not Found | `req.originalUrl` | `404.ejs` |

---

## 🛡️ Security Note
All user data displayed in EJS views is rendered using the `<%= %>` syntax. This automatically escapes HTML characters (e.g. converting `<` to `&lt;` and `>` to `&gt;`), preventing Cross-Site Scripting (XSS) attacks.

