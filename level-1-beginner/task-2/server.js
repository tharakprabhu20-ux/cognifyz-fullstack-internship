/**
 * ============================================================================
 * Cognifyz Full Stack Development Internship - Level 1 (Beginner)
 * Task 2: Inline Styles, Basic Interaction, and Server-Side Validation
 * Theme: Student Registration Desk App
 * Stack: Node.js, Express 4, EJS
 * ============================================================================
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------------------
// Middleware & View Engine Configuration
// ----------------------------------------------------------------------------
// Step 3: Parse URL-encoded form submissions (extended: true allows arrays/nested objects)
app.use(express.urlencoded({ extended: true }));

// Configure EJS view engine and views directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ----------------------------------------------------------------------------
// Static Choices & Constants (Step 1: Complex Forms)
// ----------------------------------------------------------------------------
const COURSES = [
  "BSc Computer Science (AI & Data Science)",
  "BSc Computer Science",
  "BCA",
  "B.Tech Information Technology",
  "Other"
];

const SKILLS = [
  "HTML/CSS",
  "JavaScript",
  "Node.js",
  "Python",
  "Data Analysis",
  "UI/UX Design"
];

const YEARS = ["1st", "2nd", "3rd", "4th"];

// ----------------------------------------------------------------------------
// Step 4: Temporary In-Memory Server-Side Storage
// Resets automatically when the server process restarts (as expected for in-memory store)
// ----------------------------------------------------------------------------
const submissions = [];
let nextId = 1;

/**
 * Step 3: Server-Side Form Validation Helper
 * Re-validates every field against strict business rules.
 * Never trust client-side validation alone because client scripts can be disabled or bypassed.
 *
 * @param {Object} data - Raw request body submitted by user
 * @returns {Object} { isValid: boolean, errors: Object, normalizedSkills: string[] }
 */
function validateRegistration(data) {
  const errors = {};

  const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const dob = typeof data.dob === 'string' ? data.dob.trim() : '';
  const course = typeof data.course === 'string' ? data.course.trim() : '';
  const year = typeof data.year === 'string' ? data.year.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const confirmPassword = typeof data.confirmPassword === 'string' ? data.confirmPassword : '';
  const about = typeof data.about === 'string' ? data.about.trim() : '';
  const terms = data.terms;

  // 1. Full Name: Required, minimum 3 characters
  if (!fullName) {
    errors.fullName = "Full name is required.";
  } else if (fullName.length < 3) {
    errors.fullName = "Full name must be at least 3 characters long.";
  }

  // 2. Email: Required, valid email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errors.email = "Email address is required.";
  } else if (!emailRegex.test(email)) {
    errors.email = "Please enter a valid email address (e.g. student@example.com).";
  }

  // 3. Phone: Required, exactly 10 digits starting with 6, 7, 8, or 9 (Indian mobile)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phone) {
    errors.phone = "Phone number is required.";
  } else if (!phoneRegex.test(phone)) {
    errors.phone = "Phone number must be exactly 10 digits starting with 6, 7, 8, or 9.";
  }

  // 4. Date of Birth & Age: Must be valid date, not in the future, age >= 15
  if (!dob) {
    errors.dob = "Date of birth is required.";
  } else {
    const birthDate = new Date(dob);
    const today = new Date();
    if (isNaN(birthDate.getTime())) {
      errors.dob = "Please enter a valid date of birth.";
    } else if (birthDate > today) {
      errors.dob = "Date of birth cannot be in the future.";
    } else {
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 15) {
        errors.dob = "Student must be at least 15 years old to register.";
      }
    }
  }

  // 5. Course: Required, must belong to recognized COURSES list
  if (!course) {
    errors.course = "Please select a course.";
  } else if (!COURSES.includes(course)) {
    errors.course = "Selected course is not recognized.";
  }

  // 6. Year of Study: Required, must be in YEARS list
  if (!year) {
    errors.year = "Please select your current year of study.";
  } else if (!YEARS.includes(year)) {
    errors.year = "Selected year of study is invalid.";
  }

  // 7. Skills: Normalize into array (single checked box is string, multiple is array, none is undefined)
  let normalizedSkills = [];
  if (Array.isArray(data.skills)) {
    normalizedSkills = data.skills;
  } else if (typeof data.skills === 'string' && data.skills.length > 0) {
    normalizedSkills = [data.skills];
  }

  if (normalizedSkills.length === 0) {
    errors.skills = "Please select at least one technical skill.";
  } else {
    const invalidSkill = normalizedSkills.find(s => !SKILLS.includes(s));
    if (invalidSkill) {
      errors.skills = `Selected skill "${invalidSkill}" is not allowed.`;
    }
  }

  // 8. Password: Required, minimum 8 characters
  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters long.";
  }

  // 9. Confirm Password: Must match password exactly
  if (!confirmPassword) {
    errors.confirmPassword = "Confirming your password is required.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  // 10. About You: Optional, max 200 characters
  if (about && about.length > 200) {
    errors.about = "About You section cannot exceed 200 characters.";
  }

  // 11. Terms and Conditions: Must be accepted
  if (terms !== 'on' && terms !== 'true' && terms !== true) {
    errors.terms = "You must agree to the terms and conditions.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedSkills
  };
}

// ----------------------------------------------------------------------------
// Application Routes
// ----------------------------------------------------------------------------

/**
 * Route: GET /
 * Purpose: Display the Student Registration Desk form (Step 1 & Step 2)
 */
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Student Registration Form',
    activePage: 'register',
    courses: COURSES,
    skills: SKILLS,
    years: YEARS,
    errors: {},
    errorList: [],
    formData: {}
  });
});

/**
 * Route: POST /register
 * Purpose: Server-side validation (Step 3) and storing valid submissions (Step 4)
 */
app.post('/register', (req, res) => {
  const validation = validateRegistration(req.body);

  if (!validation.isValid) {
    // Collect previous user values to refill inputs, EXCEPT for passwords (security rule)
    const formData = {
      fullName: req.body.fullName || '',
      email: req.body.email || '',
      phone: req.body.phone || '',
      dob: req.body.dob || '',
      course: req.body.course || '',
      year: req.body.year || '',
      skills: validation.normalizedSkills,
      about: req.body.about || '',
      terms: req.body.terms || ''
    };

    // Return status 400 Bad Request with field-level errors and sanitized form data
    return res.status(400).render('index', {
      title: 'Fix Registration Errors',
      activePage: 'register',
      courses: COURSES,
      skills: SKILLS,
      years: YEARS,
      errors: validation.errors,
      errorList: Object.values(validation.errors),
      formData
    });
  }

  // Step 4: Hash password with SHA-256 for temporary server storage.
  // Note: In production enterprise applications, always use bcrypt or argon2 with unique salt rounds (Task 6).
  const passwordHash = crypto
    .createHash('sha256')
    .update(req.body.password)
    .digest('hex');

  // Format creation timestamp in Asia/Kolkata timezone
  const createdAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  const newRecord = {
    id: nextId++,
    fullName: req.body.fullName.trim(),
    email: req.body.email.trim(),
    phone: req.body.phone.trim(),
    dob: req.body.dob.trim(),
    course: req.body.course.trim(),
    year: req.body.year.trim(),
    skills: validation.normalizedSkills,
    about: (req.body.about || '').trim(),
    passwordHash, // Stored safely; never rendered or exposed in any view
    createdAt
  };

  submissions.push(newRecord);

  // Step 3 & Step 4: Post/Redirect/Get pattern to prevent duplicate form submissions
  res.redirect(302, '/success');
});

/**
 * Route: GET /success
 * Purpose: Display confirmation of the latest successful registration (Step 4)
 */
app.get('/success', (req, res) => {
  if (submissions.length === 0) {
    return res.redirect('/');
  }

  // Retrieve the latest registered student record
  const latestSubmission = submissions[submissions.length - 1];

  res.render('success', {
    title: 'Registration Successful',
    activePage: 'register',
    student: {
      id: latestSubmission.id,
      fullName: latestSubmission.fullName,
      email: latestSubmission.email,
      phone: latestSubmission.phone,
      dob: latestSubmission.dob,
      course: latestSubmission.course,
      year: latestSubmission.year,
      skills: latestSubmission.skills,
      about: latestSubmission.about,
      createdAt: latestSubmission.createdAt
      // Notice: password and passwordHash are deliberately omitted here
    }
  });
});

/**
 * Route: GET /submissions
 * Purpose: Display all stored student registrations and total count (Step 4)
 */
app.get('/submissions', (req, res) => {
  res.render('submissions', {
    title: 'All Registrations',
    activePage: 'submissions',
    submissions,
    totalCount: submissions.length
  });
});

/**
 * Route: POST /feedback
 * Purpose: Receive feedback and render feedback result (Task 1 continuity)
 */
app.post('/feedback', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : 'Anonymous Student';
  const rating = Number(req.body.rating) || 5;
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

  res.render('feedback-result', {
    title: 'Feedback Received',
    activePage: 'register',
    name: name || 'Anonymous Student',
    rating,
    comment
  });
});

/**
 * Route: GET /search
 * Purpose: Course search filter with friendly no-match state (Task 1 continuity)
 */
app.get('/search', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let results = [];

  if (query.length > 0) {
    const qLower = query.toLowerCase();
    results = COURSES.filter(course => course.toLowerCase().includes(qLower));
  }

  res.render('search-result', {
    title: 'Course Search Results',
    activePage: 'register',
    query,
    results
  });
});

/**
 * Catch-All 404 Handler
 * Purpose: Handle requests for unknown URLs with status 404 (Step 4)
 */
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Page Not Found',
    activePage: ''
  });
});

// ----------------------------------------------------------------------------
// Start Server
// ----------------------------------------------------------------------------
// Only start listening when run directly (enables modular testing if imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Student Registration Desk] Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;

