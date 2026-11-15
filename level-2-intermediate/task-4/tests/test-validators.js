/**
 * test-validators.js - Automated Unit Tests for Student Portal
 * Cognifyz Full Stack Development Internship - Level 2, Task 4
 *
 * Verifies:
 * 1. Pure validation functions (name, email, username, phone, dob, terms, confirm password).
 * 2. Password strength scoring across 10 distinct test cases (including rejections).
 * 3. Exact calendar age boundary calculation (15th birthday checks).
 * 4. Pure router hash-matching function (known, unknown, trailing slash, queries).
 *
 * Uses ONLY Node's built-in `assert` and `require`.
 * Exits with code 0 on success, code 1 on any failure.
 */

const assert = require('assert');
const path = require('path');

// Load modules under test
const validatorsPath = path.resolve(__dirname, '../js/validators.js');
const routerPath = path.resolve(__dirname, '../js/router.js');

const Validators = require(validatorsPath);
const AppRouter = require(routerPath);

// Test Runner Counters
let passedCount = 0;
let failedCount = 0;
const failures = [];

/**
 * Custom test runner assertion helper
 * @param {string} desc - Test description
 * @param {Function} testFn - Test execution function
 */
function test(desc, testFn) {
  try {
    testFn();
    passedCount++;
    console.log(`  [PASS] ${desc}`);
  } catch (err) {
    failedCount++;
    failures.push({ desc, error: err });
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
  }
}

console.log('===============================================================');
console.log('Running Test Suite: Cognifyz Student Portal (Task 4)');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// 1. Full Name Validation Tests
// -----------------------------------------------------------------------------
console.log('--- 1. Full Name Validator (validateName) ---');

test('Valid: standard two-word name', () => {
  const res = Validators.validateName('Rahul Sharma');
  assert.strictEqual(res.valid, true);
});

test('Valid: multi-part name with spaces', () => {
  const res = Validators.validateName('Mary Jane Watson');
  assert.strictEqual(res.valid, true);
});

test('Invalid: empty or blank name', () => {
  assert.strictEqual(Validators.validateName('').valid, false);
  assert.strictEqual(Validators.validateName('   ').valid, false);
});

test('Invalid: name shorter than 3 characters', () => {
  const res = Validators.validateName('Al');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /at least 3 characters/i);
});

test('Invalid: name containing numbers or symbols', () => {
  assert.strictEqual(Validators.validateName('Rahul123').valid, false);
  assert.strictEqual(Validators.validateName('John_Doe').valid, false);
  assert.strictEqual(Validators.validateName('Alice@Wonderland').valid, false);
});

// -----------------------------------------------------------------------------
// 2. Email Address Validation Tests
// -----------------------------------------------------------------------------
console.log('\n--- 2. Email Address Validator (validateEmail) ---');

test('Valid: standard email address', () => {
  assert.strictEqual(Validators.validateEmail('student@example.com').valid, true);
});

test('Valid: complex subdomains and tags', () => {
  assert.strictEqual(Validators.validateEmail('user.name+tag@sub.domain.edu').valid, true);
  assert.strictEqual(Validators.validateEmail('internship@cognifyz.in').valid, true);
});

test('Invalid: empty email', () => {
  assert.strictEqual(Validators.validateEmail('').valid, false);
});

test('Invalid: missing @ symbol', () => {
  assert.strictEqual(Validators.validateEmail('plainaddress.com').valid, false);
});

test('Invalid: missing domain or username', () => {
  assert.strictEqual(Validators.validateEmail('username@').valid, false);
  assert.strictEqual(Validators.validateEmail('@domain.com').valid, false);
});

test('Invalid: space inside email', () => {
  assert.strictEqual(Validators.validateEmail('user @domain.com').valid, false);
});

// -----------------------------------------------------------------------------
// 3. Username Validation Tests
// -----------------------------------------------------------------------------
console.log('\n--- 3. Username Validator (validateUsername) ---');

test('Valid: 4-15 characters starting with letter', () => {
  assert.strictEqual(Validators.validateUsername('rahul_01').valid, true);
  assert.strictEqual(Validators.validateUsername('student2026').valid, true);
  assert.strictEqual(Validators.validateUsername('Alex').valid, true);
});

test('Invalid: shorter than 4 characters', () => {
  const res = Validators.validateUsername('abc');
  assert.strictEqual(res.valid, false);
});

test('Invalid: longer than 15 characters', () => {
  const res = Validators.validateUsername('this_username_is_too_long');
  assert.strictEqual(res.valid, false);
});

test('Invalid: starts with a number', () => {
  const res = Validators.validateUsername('123student');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /start with an alphabetic letter/i);
});

test('Invalid: starts with an underscore', () => {
  assert.strictEqual(Validators.validateUsername('_student').valid, false);
});

test('Invalid: contains disallowed special characters', () => {
  assert.strictEqual(Validators.validateUsername('user@name').valid, false);
  assert.strictEqual(Validators.validateUsername('user-name').valid, false);
});

// -----------------------------------------------------------------------------
// 4. Password Strength & Rejection Tests (Step 1 requirement: 8+ passwords)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Password Strength & Rejection Rules (validatePassword) ---');

test('Score 0: Very weak (too short, only lowercase)', () => {
  const res = Validators.validatePassword('short');
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.label, 'Very weak');
  assert.strictEqual(res.valid, false);
});

test('Score 1: Weak (length >= 8, only lowercase)', () => {
  const res = Validators.validatePassword('abcdefgh');
  assert.strictEqual(res.score, 1);
  assert.strictEqual(res.label, 'Weak');
  assert.strictEqual(res.valid, false);
});

test('Score 2: Fair (length >= 8, lowercase, uppercase)', () => {
  const res = Validators.validatePassword('Abcdefgh');
  assert.strictEqual(res.score, 2);
  assert.strictEqual(res.label, 'Fair');
  assert.strictEqual(res.valid, false);
});

test('Score 3: Strong (length >= 8, lowercase, uppercase, number)', () => {
  const res = Validators.validatePassword('Abcdefg1');
  assert.strictEqual(res.score, 3);
  assert.strictEqual(res.label, 'Strong');
  assert.strictEqual(res.valid, false); // needs special char for full validity
});

test('Score 4: Very strong (all 5 checklist rules satisfied)', () => {
  const res = Validators.validatePassword('Abcdef1!');
  assert.strictEqual(res.score, 4);
  assert.strictEqual(res.label, 'Very strong');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.checks.length, true);
  assert.strictEqual(res.checks.uppercase, true);
  assert.strictEqual(res.checks.lowercase, true);
  assert.strictEqual(res.checks.number, true);
  assert.strictEqual(res.checks.special, true);
});

test('Rejection Rule: contains the word "password" (case-insensitive)', () => {
  const res = Validators.validatePassword('MyPassword!1');
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.label, 'Very weak');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /cannot contain the word "password"/i);
});

test('Rejection Rule: contains the registered username', () => {
  const res = Validators.validatePassword('Rahul@2026!Sec', 'rahul');
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.label, 'Very weak');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /cannot contain your username/i);
});

test('Rejection Rule: contains 3 or more of same character in a row (letters)', () => {
  const res = Validators.validatePassword('Aaa1!bcdefgh');
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.label, 'Very weak');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /3 or more repeating characters/i);
});

test('Rejection Rule: contains 3 or more of same character in a row (numbers)', () => {
  const res = Validators.validatePassword('Abc111!defgh');
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.label, 'Very weak');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /3 or more repeating characters/i);
});

test('Valid: complex real-world password', () => {
  const res = Validators.validatePassword('Cognifyz#2026Portal', 'john_doe');
  assert.strictEqual(res.score, 4);
  assert.strictEqual(res.label, 'Very strong');
  assert.strictEqual(res.valid, true);
});

// -----------------------------------------------------------------------------
// 5. Confirm Password Tests
// -----------------------------------------------------------------------------
console.log('\n--- 5. Confirm Password Validator (validateConfirmPassword) ---');

test('Valid: matching passwords', () => {
  const res = Validators.validateConfirmPassword('Secure@123', 'Secure@123');
  assert.strictEqual(res.valid, true);
});

test('Invalid: mismatched passwords', () => {
  const res = Validators.validateConfirmPassword('Secure@123', 'Different@123');
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /passwords do not match/i);
});

test('Invalid: empty confirmation', () => {
  const res = Validators.validateConfirmPassword('', 'Secure@123');
  assert.strictEqual(res.valid, false);
});

// -----------------------------------------------------------------------------
// 6. Phone Number Validation Tests (Indian mobile starting 6-9)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Phone Number Validator (validatePhone) ---');

test('Valid: 10-digit Indian numbers starting with 6, 7, 8, 9', () => {
  assert.strictEqual(Validators.validatePhone('9876543210').valid, true);
  assert.strictEqual(Validators.validatePhone('8765432109').valid, true);
  assert.strictEqual(Validators.validatePhone('7654321098').valid, true);
  assert.strictEqual(Validators.validatePhone('6123456789').valid, true);
});

test('Invalid: starts with 5 or 1', () => {
  assert.strictEqual(Validators.validatePhone('5123456789').valid, false);
  assert.strictEqual(Validators.validatePhone('1234567890').valid, false);
});

test('Invalid: incorrect digit length (9 or 11 digits)', () => {
  assert.strictEqual(Validators.validatePhone('987654321').valid, false);
  assert.strictEqual(Validators.validatePhone('98765432109').valid, false);
});

test('Invalid: contains alphabets or special characters', () => {
  assert.strictEqual(Validators.validatePhone('98765abcd0').valid, false);
  assert.strictEqual(Validators.validatePhone('98765-43210').valid, false);
});

// -----------------------------------------------------------------------------
// 7. Date of Birth & 15th Birthday Boundary Tests
// -----------------------------------------------------------------------------
console.log('\n--- 7. Date of Birth & 15-Year Boundary (validateDob) ---');

// Use fixed reference date: November 13, 2026
const fixedRefDate = new Date(2026, 10, 13); // month 10 = November

test('Boundary: Exactly 15th birthday today (born 2011-11-13) -> valid', () => {
  const res = Validators.validateDob('2011-11-13', fixedRefDate);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.age, 15);
});

test('Boundary: 1 day before 15th birthday (born 2011-11-14) -> invalid (age 14)', () => {
  const res = Validators.validateDob('2011-11-14', fixedRefDate);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.age, 14);
  assert.match(res.message, /at least 15 years old/i);
});

test('Boundary: 1 day after 15th birthday (born 2011-11-12) -> valid (age 15)', () => {
  const res = Validators.validateDob('2011-11-12', fixedRefDate);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.age, 15);
});

test('Valid: older applicant (age 20)', () => {
  const res = Validators.validateDob('2006-05-20', fixedRefDate);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.age, 20);
});

test('Invalid: future date of birth', () => {
  const res = Validators.validateDob('2026-11-20', fixedRefDate);
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /cannot be in the future/i);
});

test('Invalid: non-existent calendar date (e.g. Feb 31)', () => {
  const res = Validators.validateDob('2020-02-31', fixedRefDate);
  assert.strictEqual(res.valid, false);
  assert.match(res.message, /valid calendar date/i);
});

// -----------------------------------------------------------------------------
// 8. Terms Checkbox Validation Tests
// -----------------------------------------------------------------------------
console.log('\n--- 8. Terms Checkbox Validator (validateTerms) ---');

test('Valid: terms accepted (true)', () => {
  assert.strictEqual(Validators.validateTerms(true).valid, true);
});

test('Invalid: terms not accepted (false, null, undefined)', () => {
  assert.strictEqual(Validators.validateTerms(false).valid, false);
  assert.strictEqual(Validators.validateTerms(null).valid, false);
  assert.strictEqual(Validators.validateTerms(undefined).valid, false);
});

// -----------------------------------------------------------------------------
// 9. Full Form Validation (validateForm)
// -----------------------------------------------------------------------------
console.log('\n--- 9. Full Form Composite Validator (validateForm) ---');

test('Valid: complete correct student registration data', () => {
  const data = {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    username: 'aarav_2026',
    password: 'Password@2026Secure', // Wait: contains "password"! Let's avoid rejection!
    confirmPassword: 'Password@2026Secure',
    phone: '9876543210',
    dob: '2005-06-15',
    terms: true
  };
  // Note: 'Password@2026Secure' contains "password", so it correctly fails. Let's change to strong non-forbidden password:
  data.password = 'Student#2026Pass';
  data.confirmPassword = 'Student#2026Pass';

  const res = Validators.validateForm(data, fixedRefDate);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(Object.keys(res.errors).length, 0);
});

test('Invalid: form with missing fields returns appropriate error map', () => {
  const res = Validators.validateForm({}, fixedRefDate);
  assert.strictEqual(res.valid, false);
  assert.ok(res.errors.name);
  assert.ok(res.errors.email);
  assert.ok(res.errors.username);
  assert.ok(res.errors.password);
  assert.ok(res.errors.phone);
  assert.ok(res.errors.dob);
  assert.ok(res.errors.terms);
});

// -----------------------------------------------------------------------------
// 10. Router Pure Hash-Matching Tests (Step 3 requirement)
// -----------------------------------------------------------------------------
console.log('\n--- 10. Router Hash-Matching Pure Function (matchRoute) ---');

test('Matches known routes correctly', () => {
  assert.strictEqual(AppRouter.matchRoute('#/home'), 'home');
  assert.strictEqual(AppRouter.matchRoute('#/register'), 'register');
  assert.strictEqual(AppRouter.matchRoute('#/students'), 'students');
  assert.strictEqual(AppRouter.matchRoute('#/about'), 'about');
});

test('Handles trailing slashes gracefully', () => {
  assert.strictEqual(AppRouter.matchRoute('#/home/'), 'home');
  assert.strictEqual(AppRouter.matchRoute('#/register/'), 'register');
  assert.strictEqual(AppRouter.matchRoute('#/students/'), 'students');
  assert.strictEqual(AppRouter.matchRoute('#/about/'), 'about');
});

test('Empty hash or root slashes resolve to default route (home)', () => {
  assert.strictEqual(AppRouter.matchRoute(''), 'home');
  assert.strictEqual(AppRouter.matchRoute('#'), 'home');
  assert.strictEqual(AppRouter.matchRoute('#/'), 'home');
  assert.strictEqual(AppRouter.matchRoute('home'), 'home');
});

test('Strips query parameters from hash', () => {
  assert.strictEqual(AppRouter.matchRoute('#/students?search=rahul'), 'students');
  assert.strictEqual(AppRouter.matchRoute('#/register?ref=portal'), 'register');
});

test('Returns "not-found" for unknown routes', () => {
  assert.strictEqual(AppRouter.matchRoute('#/unknown'), 'not-found');
  assert.strictEqual(AppRouter.matchRoute('#/dashboard'), 'not-found');
  assert.strictEqual(AppRouter.matchRoute('#/some/random/nested/route'), 'not-found');
});

// -----------------------------------------------------------------------------
// Summary & Exit Status
// -----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`Test Execution Summary:`);
console.log(`  Total Tests Run: ${passedCount + failedCount}`);
console.log(`  Passed:          ${passedCount}`);
console.log(`  Failed:          ${failedCount}`);
console.log('===============================================================');

if (failedCount > 0) {
  console.error('\nFailures detail:');
  failures.forEach((f, idx) => {
    console.error(`  ${idx + 1}) ${f.desc}: ${f.error.message}`);
  });
  process.exit(1);
} else {
  console.log('\nAll unit tests passed successfully!');
  process.exit(0);
}
