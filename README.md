# Cognifyz Full Stack Development Internship

Comprehensive repository containing all projects developed across Levels 1 through 4 of the Cognifyz Full Stack Development Internship.

## Tasks Overview

| Level | Task | Key Features | Tech Stack | Directory |
|---|---|---|---|---|
| 1 Beginner | 1. HTML Structure and Basic Server Interaction | HTML forms, SSR with EJS, GET/POST handlers | Node.js, Express, EJS | `level-1-beginner/task-1` |
| 1 Beginner | 2. Inline Styles, Basic Interaction, and Server-Side Validation | Server-side validation, EJS rendering, static assets | Node.js, Express, EJS | `level-1-beginner/task-2` |
| 2 Intermediate | 3. Advanced CSS Styling and Responsive Design | Responsive landing page, modern CSS layout, accessible UI | HTML5, CSS3, JavaScript | `level-2-intermediate/task-3` |
| 2 Intermediate | 4. Complex Form Validation and Dynamic DOM Manipulation | Client-side validation, dynamic DOM manipulation, SPA | HTML5, CSS3, JavaScript | `level-2-intermediate/task-4` |
| 3 Advanced | 5. API Integration and Front-End Interaction | RESTful API, client-server communication, CRUD operations | Node.js, Express | `level-3-advanced/task-5` |
| 3 Advanced | 6. Database Integration and User Authentication | MongoDB via Mongoose, JWT auth, bcrypt hashing | Node.js, Express, MongoDB | `level-3-advanced/task-6` |
| 4 Expert | 7. Advanced API usage and external API integration | GitHub OAuth, weather API, rate limiting, error handling | Node.js, Express, MongoDB | `level-4-expert/task-7` |
| 4 Expert | 8. Advanced server-side functionality | Middleware pipeline, background job queue, caching | Node.js, Express, MongoDB | `level-4-expert/task-8` |

## How to Run Each Project

### Front-End Static Projects (Tasks 3 and 4)
- Open `level-2-intermediate/task-3/index.html` or `level-2-intermediate/task-4/index.html` directly in any modern web browser (`file://`), or serve with a static server such as `npx serve`.

### Node.js & Express Applications (Tasks 1, 2, 5, 6, 7, 8)
1. Navigate into the specific task directory:
   ```bash
   cd level-4-expert/task-8
   ```
2. Install project dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables (for tasks with database/auth/external services):
   ```bash
   cp .env.example .env
   # Edit .env with your local credentials and configuration
   ```
4. Run tests (if applicable):
   ```bash
   npm test
   ```
5. Start the application:
   ```bash
   npm start
   ```

## Security Note

> **Important**: Real secrets, API keys, credentials, and database connection strings live exclusively in `.env` files which are strictly excluded via `.gitignore` and are never committed to version control. Reference templates with placeholder values are provided in `.env.example`.
