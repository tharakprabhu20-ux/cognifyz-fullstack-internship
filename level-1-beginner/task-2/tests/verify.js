/**
 * ============================================================================
 * Cognifyz Full Stack Development Internship - Level 1 (Beginner)
 * Task 2 Automated Verification Suite (tests/verify.js)
 *
 * Uses ONLY Node.js built-in modules (http, crypto, url) without any
 * external test frameworks or third-party dependencies.
 *
 * Covers:
 *  - Step 1 & 2: Form structure, inline styles, client interactions script
 *  - Step 3: Server-side validation rules, bad request handling, form repopulation
 *  - Step 4: Temporary in-memory storage, password hashing, no plain/hash leaks, XSS escaping,
 *            PRG redirect, empty state, restart reset, feedback, search, 404.
 * ============================================================================
 */

const http = require('http');
const crypto = require('crypto');

// Helper to format URL-encoded form body
function toUrlEncoded(data) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  }
  return params.toString();
}

// Baseline valid form payload
function getValidPayload(overrides = {}) {
  return {
    fullName: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '9876543210',
    dob: '2002-05-15',
    course: 'BSc Computer Science (AI & Data Science)',
    year: '2nd',
    skills: ['JavaScript', 'Node.js'],
    password: 'SuperSecretPassword123',
    confirmPassword: 'SuperSecretPassword123',
    about: 'Passionate student learning full stack web development.',
    terms: 'on',
    ...overrides
  };
}

/**
 * Creates an HTTP server instance and returns a native http request helper.
 * Uses Node's built-in http.request, supporting dynamic TCP ports or Windows named pipes.
 */
async function createTestServer() {
  delete require.cache[require.resolve('../server')];
  const app = require('../server');

  const pipePath = process.platform === 'win32'
    ? `\\\\.\\pipe\\cognifyz_verify_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    : null;

  const server = http.createServer(app);
  await new Promise((resolve) => {
    if (pipePath) {
      server.listen(pipePath, resolve);
    } else {
      server.listen(0, resolve);
    }
  });

  const address = server.address();
  const isPipe = typeof address === 'string';

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      const body = options.body;

      const reqOptions = {
        path,
        method,
        headers: { ...headers }
      };

      if (isPipe) {
        reqOptions.socketPath = address;
      } else {
        reqOptions.host = '127.0.0.1';
        reqOptions.port = address.port;
      }

      if (body) {
        if (!reqOptions.headers['Content-Length']) {
          reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
        }
      }

      const req = http.request(reqOptions, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: {
              get: (headerName) => res.headers[headerName.toLowerCase()]
            },
            text: async () => responseBody
          });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  return { server, request, isPipe, address };
}

async function runTestSuite() {
  console.log('='.repeat(75));
  console.log(' Cognifyz Level 1 Task 2: Automated Verification Test Suite');
  console.log(' Theme: Student Registration Desk App (Express 4 + EJS)');
  console.log('='.repeat(75));

  const { server, request, isPipe, address } = await createTestServer();
  const targetDesc = isPipe ? address : `port ${address.port}`;
  console.log(`[TEST RUNNER] Server active on ${targetDesc}\n`);

  const results = [];

  function record(id, description, passed, details = '') {
    results.push({ id, description, passed, details });
    const tag = passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    console.log(` ${tag} Check ${id}: ${description}`);
    if (!passed && details) {
      console.log(`        Reason: ${details}`);
    }
  }

  try {
    // ------------------------------------------------------------------------
    // Check 3a: GET / returns 200, form present with inline style= and inline script
    // ------------------------------------------------------------------------
    {
      const res = await request('/');
      const text = await res.text();
      const hasForm = text.includes('<form id="registrationForm"') || text.includes('action="/register"');
      const hasInlineStyle = text.includes('style=');
      const hasInlineScript = text.includes('<script>') && text.includes('function validateForm()');
      const hasShowHide = text.includes('togglePasswordVisibility');
      const hasCounter = text.includes('updateAboutCounter');
      const hasDisabledSubmit = text.includes('id="submitBtn"');

      const pass = res.status === 200 && hasForm && hasInlineStyle && hasInlineScript && hasShowHide && hasCounter && hasDisabledSubmit;
      record('3a', 'GET / returns 200 with inline styled form and inline script', pass,
        `Status: ${res.status}, hasForm: ${hasForm}, hasInlineStyle: ${hasInlineStyle}, hasInlineScript: ${hasInlineScript}`);
    }

    // ------------------------------------------------------------------------
    // Check 3b: GET /submissions returns 200 with friendly empty state & count 0
    // ------------------------------------------------------------------------
    {
      const res = await request('/submissions');
      const text = await res.text();
      const hasEmptyState = text.includes('No Student Registrations Yet');
      const hasZeroCount = text.includes('Total Registrations:') && text.includes('0');

      const pass = res.status === 200 && hasEmptyState && hasZeroCount;
      record('3b', 'GET /submissions returns 200 with friendly empty state and count 0 before registrations', pass,
        `Status: ${res.status}, hasEmptyState: ${hasEmptyState}, hasZeroCount: ${hasZeroCount}`);
    }

    // ------------------------------------------------------------------------
    // Check 3c: POST /register with valid data -> 302 redirect to /success,
    //           GET /success returns 200 with record, GET /submissions count 1
    // ------------------------------------------------------------------------
    {
      const payload = getValidPayload();
      const postRes = await request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toUrlEncoded(payload)
      });

      const isRedirect = postRes.status === 302 && postRes.headers.get('location') === '/success';

      const successRes = await request('/success');
      const successText = await successRes.text();
      const hasStudentName = successText.includes('Rahul Sharma');
      const hasEmail = successText.includes('rahul.sharma@example.com');
      const hasCourse = successText.includes('BSc Computer Science') && successText.includes('Data Science');

      const submissionsRes = await request('/submissions');
      const submissionsText = await submissionsRes.text();
      const countIsOne = submissionsText.includes('Total Registrations:') && submissionsText.includes('1');
      const listedStudent = submissionsText.includes('Rahul Sharma');

      const pass = isRedirect && successRes.status === 200 && hasStudentName && hasEmail && hasCourse && countIsOne && listedStudent;
      record('3c', 'POST /register valid data -> 302 redirect to /success, GET /success shows record, /submissions shows count 1', pass,
        `Redirect: ${isRedirect} (Status ${postRes.status}), Success status: ${successRes.status}, listedStudent: ${listedStudent}, countIsOne: ${countIsOne}`);
    }

    // ------------------------------------------------------------------------
    // Check 3d: POST /register with each rule broken ONE at a time returns 400,
    //           shows error message, and retains entered values (passwords not refilled)
    // ------------------------------------------------------------------------
    const brokenRules = [
      {
        name: 'short name (< 3 chars)',
        field: 'fullName',
        override: { fullName: 'Ra' },
        expectedError: 'Full name must be at least 3 characters long',
        expectedPreservedValue: 'Ra'
      },
      {
        name: 'invalid email',
        field: 'email',
        override: { email: 'bad-email-format' },
        expectedError: 'valid email address',
        expectedPreservedValue: 'bad-email-format'
      },
      {
        name: 'invalid phone (not 10 digits / invalid prefix)',
        field: 'phone',
        override: { phone: '1234567890' },
        expectedError: 'Phone number must be exactly 10 digits starting with 6, 7, 8, or 9',
        expectedPreservedValue: '1234567890'
      },
      {
        name: 'date of birth under 15 years old',
        field: 'dob',
        override: { dob: '2022-01-01' },
        expectedError: 'Student must be at least 15 years old to register',
        expectedPreservedValue: '2022-01-01'
      },
      {
        name: 'password under 8 characters',
        field: 'password',
        override: { password: 'short', confirmPassword: 'short' },
        expectedError: 'Password must be at least 8 characters long',
        expectedPreservedValue: null
      },
      {
        name: 'mismatched passwords',
        field: 'confirmPassword',
        override: { password: 'ValidPassword123', confirmPassword: 'DifferentPassword456' },
        expectedError: 'Passwords do not match',
        expectedPreservedValue: null
      },
      {
        name: 'no skill selected',
        field: 'skills',
        override: { skills: [] },
        expectedError: 'Please select at least one technical skill',
        expectedPreservedValue: null
      },
      {
        name: 'terms not accepted',
        field: 'terms',
        override: { terms: undefined },
        expectedError: 'You must agree to the terms and conditions',
        expectedPreservedValue: null
      }
    ];

    let allRulesPassed = true;
    const ruleFailures = [];

    for (const rule of brokenRules) {
      const payload = getValidPayload(rule.override);
      const res = await request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toUrlEncoded(payload)
      });

      const text = await res.text();
      const statusIs400 = res.status === 400;
      const hasErrorMsg = text.toLowerCase().includes(rule.expectedError.toLowerCase());

      // Ensure password fields are NEVER refilled
      const hasPasswordRefilled = text.includes('value="SuperSecretPassword123"') ||
                                 text.includes('value="short"') ||
                                 text.includes('value="ValidPassword123"');

      // Verify that entered field value was preserved if expected
      let valuePreserved = true;
      if (rule.expectedPreservedValue) {
        valuePreserved = text.includes(`value="${rule.expectedPreservedValue}"`);
      }

      if (!statusIs400 || !hasErrorMsg || hasPasswordRefilled || !valuePreserved) {
        allRulesPassed = false;
        ruleFailures.push(`${rule.name} (status400=${statusIs400}, hasError=${hasErrorMsg}, noPassRefill=${!hasPasswordRefilled}, valuePreserved=${valuePreserved})`);
      }
    }

    record('3d', 'POST /register returns 400 for each individual invalid field, preserves inputs, never refills passwords',
      allRulesPassed, ruleFailures.join('; '));

    // ------------------------------------------------------------------------
    // Check 3e: Plain password and password hash never appear in /success or /submissions
    // ------------------------------------------------------------------------
    {
      const successRes = await request('/success');
      const successText = await successRes.text();

      const submissionsRes = await request('/submissions');
      const submissionsText = await submissionsRes.text();

      const testPassword = 'SuperSecretPassword123';
      const testHash = crypto.createHash('sha256').update(testPassword).digest('hex');

      const plainInSuccess = successText.includes(testPassword);
      const hashInSuccess = successText.includes(testHash);
      const plainInSubmissions = submissionsText.includes(testPassword);
      const hashInSubmissions = submissionsText.includes(testHash);

      const pass = !plainInSuccess && !hashInSuccess && !plainInSubmissions && !hashInSubmissions;
      record('3e', 'Neither plain password nor password hash appears in HTML of /success or /submissions', pass,
        `plainInSuccess=${plainInSuccess}, hashInSuccess=${hashInSuccess}, plainInSubmissions=${plainInSubmissions}, hashInSubmissions=${hashInSubmissions}`);
    }

    // ------------------------------------------------------------------------
    // Check 3f: <script>alert(1)</script> submitted in name field is escaped in HTML
    // ------------------------------------------------------------------------
    {
      const xssPayload = getValidPayload({
        fullName: '<script>alert(1)</script>',
        email: 'xss.test@example.com'
      });

      const postRes = await request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toUrlEncoded(xssPayload)
      });

      const successRes = await request('/success');
      const successText = await successRes.text();

      const hasRawXSS = successText.includes('<script>alert(1)</script>');
      const hasEscapedXSS = successText.includes('&lt;script&gt;alert(1)&lt;/script&gt;');

      const pass = postRes.status === 302 && !hasRawXSS && hasEscapedXSS;
      record('3f', 'XSS attempt <script>alert(1)</script> is properly escaped as &lt;script&gt;alert(1)&lt;/script&gt;', pass,
        `hasRawXSS=${hasRawXSS}, hasEscapedXSS=${hasEscapedXSS}`);
    }

    // ------------------------------------------------------------------------
    // Check 3g: Feedback and course search work (including no match)
    // ------------------------------------------------------------------------
    {
      // 1. Feedback POST
      const fbRes = await request('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toUrlEncoded({ name: 'Ananya', rating: '4', comment: 'Registration was fast and straightforward!' })
      });
      const fbText = await fbRes.text();
      const fbPass = fbRes.status === 200 && fbText.includes('Ananya') && fbText.includes('4 / 5 Stars') && fbText.includes('Registration was fast');

      // 2. Course search with match
      const searchMatchRes = await request('/search?q=Data');
      const searchMatchText = await searchMatchRes.text();
      const searchMatchPass = searchMatchRes.status === 200 && searchMatchText.includes('BSc Computer Science') && searchMatchText.includes('Data Science');

      // 3. Course search with no match
      const searchNoMatchRes = await request('/search?q=QuantumAstronomy999');
      const searchNoMatchText = await searchNoMatchRes.text();
      const searchNoMatchPass = searchNoMatchRes.status === 200 && (searchNoMatchText.includes('No courses found') || searchNoMatchText.includes('No courses matched'));

      const pass = fbPass && searchMatchPass && searchNoMatchPass;
      record('3g', 'Feedback submission and course search (with matches and friendly no-match) operate as expected', pass,
        `fbPass=${fbPass}, searchMatchPass=${searchMatchPass}, searchNoMatchPass=${searchNoMatchPass}`);
    }

    // ------------------------------------------------------------------------
    // Check 3h: GET /nothing returns 404 with friendly 404 page
    // ------------------------------------------------------------------------
    {
      const res = await request('/nothing-exists-here');
      const text = await res.text();
      const has404 = res.status === 404 && text.includes('404') && text.includes('Page Not Found');

      record('3h', 'GET /nothing returns 404 Not Found with custom 404 view', has404,
        `Status: ${res.status}`);
    }

    // ------------------------------------------------------------------------
    // Check 4: Server restart reset test (proves temporary in-memory storage)
    // ------------------------------------------------------------------------
    {
      // Close active server
      await new Promise((resolve) => server.close(resolve));

      // Reload fresh server instance
      const fresh = await createTestServer();
      const res = await fresh.request('/submissions');
      const text = await res.text();
      const isReset = res.status === 200 &&
                      text.includes('Total Registrations:') &&
                      text.includes('0') &&
                      text.includes('No Student Registrations Yet');

      await new Promise((resolve) => fresh.server.close(resolve));

      record('Restart Check', 'Server restart clears in-memory storage and restores empty state (0 submissions)', isReset,
        `Status=${res.status}, isReset=${isReset}`);
    }

  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  // --------------------------------------------------------------------------
  // Pass/Fail Summary Table
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(75));
  console.log(' VERIFICATION SUMMARY');
  console.log('='.repeat(75));
  console.log(
    'ID'.padEnd(16) +
    'Status'.padEnd(10) +
    'Description'
  );
  console.log('-'.repeat(75));

  let allPassed = true;
  for (const r of results) {
    if (!r.passed) allPassed = false;
    const statusCol = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(
      r.id.padEnd(16) +
      statusCol.padEnd(19) +
      r.description
    );
  }

  console.log('='.repeat(75));
  if (allPassed) {
    console.log('\x1b[32m ALL VERIFICATION CHECKS PASSED SUCCESSFULLY (100%)\x1b[0m');
    console.log('='.repeat(75));
    process.exit(0);
  } else {
    console.error('\x1b[31m SOME VERIFICATION CHECKS FAILED. PLEASE REVIEW LOGS ABOVE.\x1b[0m');
    console.log('='.repeat(75));
    process.exit(1);
  }
}

// Execute test suite
runTestSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
