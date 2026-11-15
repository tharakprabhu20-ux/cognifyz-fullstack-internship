/**
 * validators.js - Pure validation functions for the Student Portal
 * Cognifyz Full Stack Development Internship - Level 2, Task 4
 * Step 1: Complex Form Validation
 *
 * NOTE: This module contains pure functions only (no DOM access).
 * It works in both browser (window.Validators) and Node.js environments (module.exports).
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment for unit testing
    module.exports = factory();
  } else {
    // Browser global environment
    root.Validators = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Validates student full name.
   * Rule: At least 3 characters long, letters and spaces only.
   * @param {string} name
   * @returns {{ valid: boolean, message: string }}
   */
  function validateName(name) {
    if (typeof name !== 'string' || name.trim() === '') {
      return { valid: false, message: 'Full name is required.' };
    }
    var trimmed = name.trim();
    if (trimmed.length < 3) {
      return { valid: false, message: 'Full name must be at least 3 characters long.' };
    }
    // Only alphabetic letters and spaces allowed
    var nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(trimmed)) {
      return { valid: false, message: 'Full name can only contain letters and spaces.' };
    }
    return { valid: true, message: 'Full name is valid.' };
  }

  /**
   * Validates student email address.
   * Rule: Standard valid email format.
   * @param {string} email
   * @returns {{ valid: boolean, message: string }}
   */
  function validateEmail(email) {
    if (typeof email !== 'string' || email.trim() === '') {
      return { valid: false, message: 'Email address is required.' };
    }
    var trimmed = email.trim();
    // RFC 5322 compliant simplified email regex
    var emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, message: 'Please enter a valid email address (e.g., student@domain.com).' };
    }
    return { valid: true, message: 'Email format is valid.' };
  }

  /**
   * Validates student username.
   * Rule: 4-15 characters, starts with a letter, only letters, numbers, and underscore.
   * @param {string} username
   * @returns {{ valid: boolean, message: string }}
   */
  function validateUsername(username) {
    if (typeof username !== 'string' || username.trim() === '') {
      return { valid: false, message: 'Username is required.' };
    }
    var trimmed = username.trim();
    if (trimmed.length < 4 || trimmed.length > 15) {
      return { valid: false, message: 'Username must be between 4 and 15 characters long.' };
    }
    if (!/^[a-zA-Z]/.test(trimmed)) {
      return { valid: false, message: 'Username must start with an alphabetic letter.' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores.' };
    }
    return { valid: true, message: 'Username is valid.' };
  }

  /**
   * Validates password strength and rejection rules.
   *
   * Scoring (0-4):
   * 1. Length >= 8
   * 2. Contains uppercase letter
   * 3. Contains lowercase letter
   * 4. Contains a number
   * 5. Contains a special character
   *
   * Rejection criteria (immediate invalidation & score 0):
   * - Contains the word "password" (case-insensitive)
   * - Contains the registered username (case-insensitive, if username >= 3 chars)
   * - Contains 3 or more of the same character in a row (e.g., "aaa", "111")
   *
   * @param {string} password
   * @param {string} [username]
   * @returns {{
   *   valid: boolean,
   *   score: number,
   *   label: string,
   *   checks: { length: boolean, uppercase: boolean, lowercase: boolean, number: boolean, special: boolean },
   *   message: string
   * }}
   */
  function validatePassword(password, username) {
    var defaultChecks = {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    };

    if (typeof password !== 'string' || password === '') {
      return {
        valid: false,
        score: 0,
        label: 'Very weak',
        checks: defaultChecks,
        message: 'Password is required.'
      };
    }

    var checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(password)
    };

    // Calculate passed criteria count (0 to 5)
    var passedCount = (checks.length ? 1 : 0) +
                      (checks.uppercase ? 1 : 0) +
                      (checks.lowercase ? 1 : 0) +
                      (checks.number ? 1 : 0) +
                      (checks.special ? 1 : 0);

    // Map passedCount (0 to 5) to score (0 to 4) and labels
    // 0-1 checks: 0 (Very weak), 2: 1 (Weak), 3: 2 (Fair), 4: 3 (Strong), 5: 4 (Very strong)
    var scoreMap = [0, 0, 1, 2, 3, 4];
    var labelMap = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
    var calculatedScore = scoreMap[passedCount];
    var calculatedLabel = labelMap[calculatedScore];

    // Rejection rule 1: Contains the word "password"
    if (/password/i.test(password)) {
      return {
        valid: false,
        score: 0,
        label: 'Very weak',
        checks: checks,
        message: 'Password cannot contain the word "password".'
      };
    }

    // Rejection rule 2: Contains the username (if username provided and at least 3 chars)
    if (typeof username === 'string' && username.trim().length >= 3) {
      var normUser = username.trim().toLowerCase();
      if (password.toLowerCase().indexOf(normUser) !== -1) {
        return {
          valid: false,
          score: 0,
          label: 'Very weak',
          checks: checks,
          message: 'Password cannot contain your username.'
        };
      }
    }

    // Rejection rule 3: 3 or more of the same character in a row (case-insensitive)
    if (/(.)\1{2,}/i.test(password)) {
      return {
        valid: false,
        score: 0,
        label: 'Very weak',
        checks: checks,
        message: 'Password cannot contain 3 or more repeating characters in a row.'
      };
    }

    // Validity requirement: all 5 checklist requirements must pass for registration
    var isValid = passedCount === 5;
    var message = isValid
      ? 'Password meets all security criteria.'
      : 'Password must satisfy all 5 requirements listed below.';

    return {
      valid: isValid,
      score: calculatedScore,
      label: calculatedLabel,
      checks: checks,
      message: message
    };
  }

  /**
   * Validates password confirmation.
   * Rule: Must match the original password exactly and be non-empty.
   * @param {string} confirmPassword
   * @param {string} originalPassword
   * @returns {{ valid: boolean, message: string }}
   */
  function validateConfirmPassword(confirmPassword, originalPassword) {
    if (typeof confirmPassword !== 'string' || confirmPassword === '') {
      return { valid: false, message: 'Please confirm your password.' };
    }
    if (confirmPassword !== originalPassword) {
      return { valid: false, message: 'Passwords do not match.' };
    }
    return { valid: true, message: 'Passwords match.' };
  }

  /**
   * Validates Indian mobile phone number.
   * Rule: 10 digits starting with 6, 7, 8, or 9.
   * @param {string} phone
   * @returns {{ valid: boolean, message: string }}
   */
  function validatePhone(phone) {
    if (typeof phone !== 'string' || phone.trim() === '') {
      return { valid: false, message: 'Phone number is required.' };
    }
    var trimmed = phone.trim();
    if (/[^\d]/.test(trimmed)) {
      return { valid: false, message: 'Phone number must contain digits only.' };
    }
    if (trimmed.length !== 10) {
      return { valid: false, message: 'Phone number must be exactly 10 digits.' };
    }
    if (!/^[6-9]/.test(trimmed)) {
      return { valid: false, message: 'Indian mobile number must start with 6, 7, 8, or 9.' };
    }
    return { valid: true, message: 'Phone number is valid.' };
  }

  /**
   * Validates student Date of Birth.
   * Rules: Valid date, not in future, minimum age 15.
   *
   * Note: An optional referenceDate parameter is accepted for deterministic unit testing.
   * Parses YYYY-MM-DD components directly to prevent timezone shift issues.
   *
   * @param {string} dobString - Format 'YYYY-MM-DD'
   * @param {Date} [referenceDate] - Default is current system date
   * @returns {{ valid: boolean, message: string, age?: number }}
   */
  function validateDob(dobString, referenceDate) {
    if (typeof dobString !== 'string' || dobString.trim() === '') {
      return { valid: false, message: 'Date of birth is required.' };
    }
    var parts = dobString.trim().split('-');
    if (parts.length !== 3) {
      return { valid: false, message: 'Please provide date in YYYY-MM-DD format.' };
    }

    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1; // 0-indexed in JS Date
    var day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return { valid: false, message: 'Invalid date values.' };
    }

    var birthDate = new Date(year, month, day);
    // Verify calendar consistency (e.g., handles Feb 31 -> invalid)
    if (
      birthDate.getFullYear() !== year ||
      birthDate.getMonth() !== month ||
      birthDate.getDate() !== day
    ) {
      return { valid: false, message: 'Please enter a valid calendar date.' };
    }

    var ref = referenceDate instanceof Date ? referenceDate : new Date();
    var refYear = ref.getFullYear();
    var refMonth = ref.getMonth();
    var refDay = ref.getDate();

    // Check if birthdate is in the future
    var todayMidnight = new Date(refYear, refMonth, refDay);
    if (birthDate > todayMidnight) {
      return { valid: false, message: 'Date of birth cannot be in the future.' };
    }

    // Exact calendar age calculation
    var age = refYear - year;
    if (refMonth < month || (refMonth === month && refDay < day)) {
      age--;
    }

    if (age < 15) {
      return {
        valid: false,
        age: age,
        message: 'You must be at least 15 years old to register (current age: ' + age + ').'
      };
    }

    return {
      valid: true,
      age: age,
      message: 'Date of birth is valid (' + age + ' years old).'
    };
  }

  /**
   * Validates terms of service checkbox acceptance.
   * Rule: Must be true / checked.
   * @param {boolean} accepted
   * @returns {{ valid: boolean, message: string }}
   */
  function validateTerms(accepted) {
    if (accepted !== true) {
      return { valid: false, message: 'You must accept the Terms and Conditions.' };
    }
    return { valid: true, message: 'Terms accepted.' };
  }

  /**
   * Complete form validation helper (pure function).
   * Validates all registration fields at once.
   * @param {Object} formData
   * @param {Date} [referenceDate]
   * @returns {{ valid: boolean, errors: Object, details: Object }}
   */
  function validateForm(formData, referenceDate) {
    formData = formData || {};
    var nameRes = validateName(formData.name);
    var emailRes = validateEmail(formData.email);
    var usernameRes = validateUsername(formData.username);
    var passwordRes = validatePassword(formData.password, formData.username);
    var confirmRes = validateConfirmPassword(formData.confirmPassword, formData.password);
    var phoneRes = validatePhone(formData.phone);
    var dobRes = validateDob(formData.dob, referenceDate);
    var termsRes = validateTerms(formData.terms);

    var errors = {};
    if (!nameRes.valid) errors.name = nameRes.message;
    if (!emailRes.valid) errors.email = emailRes.message;
    if (!usernameRes.valid) errors.username = usernameRes.message;
    if (!passwordRes.valid) errors.password = passwordRes.message;
    if (!confirmRes.valid) errors.confirmPassword = confirmRes.message;
    if (!phoneRes.valid) errors.phone = phoneRes.message;
    if (!dobRes.valid) errors.dob = dobRes.message;
    if (!termsRes.valid) errors.terms = termsRes.message;

    var allValid = Object.keys(errors).length === 0;

    return {
      valid: allValid,
      errors: errors,
      details: {
        name: nameRes,
        email: emailRes,
        username: usernameRes,
        password: passwordRes,
        confirmPassword: confirmRes,
        phone: phoneRes,
        dob: dobRes,
        terms: termsRes
      }
    };
  }

  return {
    validateName: validateName,
    validateEmail: validateEmail,
    validateUsername: validateUsername,
    validatePassword: validatePassword,
    validateConfirmPassword: validateConfirmPassword,
    validatePhone: validatePhone,
    validateDob: validateDob,
    validateTerms: validateTerms,
    validateForm: validateForm
  };
});
