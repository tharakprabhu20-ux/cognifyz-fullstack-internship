/**
 * ==============================================================================
 * Task 1: HTML Structure and Basic Server Interaction
 * Cognifyz Full Stack Development Internship (Level 1: Beginner)
 * 
 * Theme: Student Registration Desk App
 * Stack: Node.js, Express 4, EJS (Server-Side Rendering)
 * ==============================================================================
 */

// Step 2: Set up a simple Node.js server using Express
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure EJS as the server-side template rendering engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse URL-encoded request bodies from HTML form submissions
app.use(express.urlencoded({ extended: true }));

/**
 * Static Data Collections
 * Courses offered and extracurricular interest options available for registration.
 */
const courses = [
  "BSc Computer Science (AI & Data Science)",
  "BSc Computer Science",
  "BCA",
  "B.Tech Information Technology",
  "Other"
];

const interestOptions = [
  "Web Development",
  "AI / Machine Learning",
  "Data Analysis",
  "UI/UX Design",
  "Cyber Security"
];

// ------------------------------------------------------------------------------
// Route 1: Home Page - Display Registration Desk Forms
// Satisfies Step 1 (HTML structure with forms) & Step 4 (Server-side rendering with EJS)
// ------------------------------------------------------------------------------
app.get('/', (req, res) => {
  // Render index.ejs and dynamically inject courses and interestOptions
  res.render('index', {
    title: 'Student Registration Desk',
    courses: courses,
    interestOptions: interestOptions
  });
});

// ------------------------------------------------------------------------------
// Route 2: Registration Submission Handler
// Satisfies Step 3 (Server-side endpoint to handle form submission) & Step 4 (Dynamic EJS rendering)
// ------------------------------------------------------------------------------
app.post('/register', (req, res) => {
  // Extract submitted fields from req.body
  const { fullName, email, age, course, gender, interests, about } = req.body;

  // Normalise interests:
  // - If multiple checkboxes checked: Express provides an Array of strings
  // - If single checkbox checked: Express provides a single String
  // - If no checkbox checked: Express leaves it undefined
  let interestsArray = [];
  if (Array.isArray(interests)) {
    interestsArray = interests;
  } else if (typeof interests === 'string' && interests.trim() !== '') {
    interestsArray = [interests];
  }

  // Construct student data object
  const student = {
    fullName: fullName || '',
    email: email || '',
    age: age || '',
    course: course || '',
    gender: gender || '',
    interests: interestsArray,
    about: about || ''
  };

  // Generate current timestamp formatted in Asia/Kolkata (Indian Standard Time)
  const submittedAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' (IST)';

  // Render result.ejs with student details and timestamp
  res.render('result', {
    title: 'Registration Confirmation',
    student: student,
    submittedAt: submittedAt
  });
});

// ------------------------------------------------------------------------------
// Route 3: Feedback Form Handler
// Satisfies Step 3 (Server-side endpoint for feedback) & Step 4 (Dynamic EJS rendering)
// ------------------------------------------------------------------------------
app.post('/feedback', (req, res) => {
  const { name, rating, comment } = req.body;

  // Convert the rating string to a numeric value
  const numericRating = parseInt(rating, 10) || 0;

  // Render feedback-result.ejs with the submitted feedback
  res.render('feedback-result', {
    title: 'Feedback Acknowledged',
    feedback: {
      name: (name && name.trim()) ? name.trim() : 'Anonymous',
      rating: numericRating,
      comment: (comment && comment.trim()) ? comment.trim() : ''
    }
  });
});

// ------------------------------------------------------------------------------
// Route 4: Course Catalog Search
// Satisfies Step 3 (Server-side query processing) & Step 4 (Dynamic EJS rendering)
// ------------------------------------------------------------------------------
app.get('/search', (req, res) => {
  // Read search keyword 'q' from query parameters (e.g. /search?q=computer)
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  // Filter courses array by case-insensitive substring match
  const filteredCourses = query.length > 0
    ? courses.filter(course => course.toLowerCase().includes(query.toLowerCase()))
    : [];

  // Render search-result.ejs with matched courses
  res.render('search-result', {
    title: 'Course Search Results',
    query: query,
    results: filteredCourses
  });
});

// ------------------------------------------------------------------------------
// Route 5: 404 Catch-All Handler
// Satisfies Step 4 (Dynamic rendering for unmatched endpoints)
// ------------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Page Not Found',
    path: req.originalUrl
  });
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`[Server] Student Registration Desk running at http://localhost:${PORT}`);
});

