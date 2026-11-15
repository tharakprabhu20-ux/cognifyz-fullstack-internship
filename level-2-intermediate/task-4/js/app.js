/**
 * app.js - Main Application Logic for Student Portal
 * Cognifyz Full Stack Development Internship - Level 2, Task 4
 *
 * Implements:
 * - Step 1: Complex form validation with live feedback, strength meter, checklist, show/hide toggle.
 * - Step 2: Dynamic DOM manipulation (createElement, textContent, filter, sort, counter, remove & 5s undo).
 * - Step 3: Client-side hash routing integration, views, unsaved changes guard, toast notifications.
 */

(function () {
  'use strict';

  // =========================================================================
  // State Management & Safe LocalStorage Handling (Step 2)
  // =========================================================================

  var STORAGE_KEY = 'cognifyz_student_portal_students_v1';

  // Default seed students shown on first visit if storage is empty
  var INITIAL_SEED_STUDENTS = [
    {
      id: 'stu_seed_1',
      name: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      username: 'aarav_s',
      phone: '9876543210',
      dob: '2004-05-15',
      createdAt: 1700000000000
    },
    {
      id: 'stu_seed_2',
      name: 'Priya Patel',
      email: 'priya.patel@example.com',
      username: 'priya_p',
      phone: '8765432109',
      dob: '2003-09-22',
      createdAt: 1700050000000
    },
    {
      id: 'stu_seed_3',
      name: 'Rohan Verma',
      email: 'rohan.verma@example.com',
      username: 'rohan_v',
      phone: '7654321098',
      dob: '2005-01-10',
      createdAt: 1700100000000
    }
  ];

  // In-memory student array (PASSWORDS ARE NEVER STORED)
  var students = [];

  // Temporary storage for Undo removal feature (5 seconds)
  var lastRemovedItem = null;
  var undoTimeoutId = null;

  // Track if registration form has dirty inputs (for unsaved changes warning)
  var isRegisterFormDirty = false;

  /**
   * Safely loads students list from localStorage.
   * Handles empty storage, missing storage, or corrupted JSON data gracefully.
   */
  function loadStudents() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // First run: load initial seeds and persist
        students = INITIAL_SEED_STUDENTS.slice();
        saveStudents();
        return;
      }
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Validate each record to ensure safe structure
        students = parsed.filter(function (item) {
          return (
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.email === 'string' &&
            typeof item.username === 'string'
          );
        });
      } else {
        students = INITIAL_SEED_STUDENTS.slice();
        saveStudents();
      }
    } catch (err) {
      console.warn('Could not read students from localStorage (using memory):', err);
      students = INITIAL_SEED_STUDENTS.slice();
    }
  }

  /**
   * Safely persists student array to localStorage.
   */
  function saveStudents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
    } catch (err) {
      console.error('Failed to save students to localStorage:', err);
    }
  }

  // =========================================================================
  // Toast Notification System (Step 2 & UX)
  // =========================================================================

  var toastContainer = null;

  /**
   * Creates or returns the global toast notifications container.
   */
  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        toastContainer.setAttribute('role', 'region');
        toastContainer.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  /**
   * Shows a standard toast notification that auto-dismisses after durationMs.
   * @param {string} message - User-facing text
   * @param {string} [type='info'] - 'info', 'success', 'warning', 'error'
   * @param {number} [durationMs=3000]
   */
  function showToast(message, type, durationMs) {
    type = type || 'info';
    durationMs = durationMs || 3000;

    var container = getToastContainer();
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    var textSpan = document.createElement('span');
    textSpan.className = 'toast-message';
    textSpan.textContent = message; // textContent prevents XSS
    toast.appendChild(textSpan);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.textContent = '×';
    closeBtn.onclick = function () {
      dismissToast(toast);
    };
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    var timer = setTimeout(function () {
      dismissToast(toast);
    }, durationMs);

    toast._timer = timer;
    return toast;
  }

  /**
   * Shows an Undo toast notification for removed items (active for 5 seconds).
   * @param {string} studentName
   * @param {Function} onUndo
   */
  function showUndoToast(studentName, onUndo) {
    // Clear any previous undo toast
    if (undoTimeoutId) {
      clearTimeout(undoTimeoutId);
      undoTimeoutId = null;
    }

    var container = getToastContainer();
    var toast = document.createElement('div');
    toast.className = 'toast toast-warning toast-undo';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    var msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = 'Student "' + studentName + '" removed. ';
    toast.appendChild(msgSpan);

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'btn-undo';
    undoBtn.textContent = 'Undo (5s)';

    var secondsLeft = 5;
    var intervalId = setInterval(function () {
      secondsLeft--;
      if (secondsLeft > 0) {
        undoBtn.textContent = 'Undo (' + secondsLeft + 's)';
      } else {
        clearInterval(intervalId);
      }
    }, 1000);

    undoBtn.onclick = function () {
      clearInterval(intervalId);
      if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
        undoTimeoutId = null;
      }
      dismissToast(toast);
      onUndo();
    };
    toast.appendChild(undoBtn);

    container.appendChild(toast);

    undoTimeoutId = setTimeout(function () {
      clearInterval(intervalId);
      dismissToast(toast);
      lastRemovedItem = null;
      undoTimeoutId = null;
    }, 5000);
  }

  /**
   * Dismisses and removes a toast element with fade-out.
   */
  function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-hiding');
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }

  // =========================================================================
  // VIEW: HOME PAGE (Step 3)
  // =========================================================================

  function renderHomeView(container) {
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'page-content page-home';

    // Hero section
    var hero = document.createElement('section');
    hero.className = 'hero-section';

    var heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.textContent = 'Cognifyz Student Portal';
    hero.appendChild(heading);

    var subtitle = document.createElement('p');
    subtitle.className = 'hero-subtitle';
    subtitle.textContent =
      'Intermediate Level 2 (Task 4): Complex Form Validation & Dynamic DOM Manipulation';
    hero.appendChild(subtitle);

    var actionRow = document.createElement('div');
    actionRow.className = 'hero-actions';

    var regBtn = document.createElement('a');
    regBtn.href = '#/register';
    regBtn.className = 'btn btn-primary';
    regBtn.textContent = 'Register New Student →';
    actionRow.appendChild(regBtn);

    var viewBtn = document.createElement('a');
    viewBtn.href = '#/students';
    viewBtn.className = 'btn btn-secondary';
    viewBtn.textContent = 'Browse Student Directory';
    actionRow.appendChild(viewBtn);

    hero.appendChild(actionRow);
    wrapper.appendChild(hero);

    // Stats Grid
    var statsGrid = document.createElement('section');
    statsGrid.className = 'stats-grid';
    statsGrid.setAttribute('aria-label', 'Portal Overview Statistics');

    var stat1 = createStatCard('Enrolled Students', students.length.toString(), 'Active records in local database');
    var stat2 = createStatCard('Client Router', 'Hash SPA', '#/home, #/register, #/students, #/about');
    var stat3 = createStatCard('Security & Rules', 'Pure Functions', 'Score 0-4 meter, checklist & anti-XSS');

    statsGrid.appendChild(stat1);
    statsGrid.appendChild(stat2);
    statsGrid.appendChild(stat3);
    wrapper.appendChild(statsGrid);

    // Feature highlights
    var featuresSection = document.createElement('section');
    featuresSection.className = 'features-section card';

    var featTitle = document.createElement('h2');
    featTitle.className = 'section-title';
    featTitle.textContent = 'Core Architectural Highlights';
    featuresSection.appendChild(featTitle);

    var featList = document.createElement('ul');
    featList.className = 'feature-bullet-list';

    var bullets = [
      'Step 1: Multi-rule validation with pure functions (name, email, username, password strength meter, confirm password, Indian mobile, date of birth / age 15 check, terms agreement).',
      'Step 2: Reactive DOM manipulation built exclusively with createElement and textContent — never injecting raw user strings into innerHTML.',
      'Step 2: Instant removal with a 5-second live Undo buffer, realtime search filtering, and multi-field sorting.',
      'Step 3: Hash-based Single-Page Application (SPA) routing with Back/Forward history, active nav links, and unsaved changes confirmation guards.'
    ];

    for (var i = 0; i < bullets.length; i++) {
      var li = document.createElement('li');
      li.textContent = bullets[i];
      featList.appendChild(li);
    }
    featuresSection.appendChild(featList);
    wrapper.appendChild(featuresSection);

    container.appendChild(wrapper);
  }

  function createStatCard(title, value, description) {
    var card = document.createElement('div');
    card.className = 'stat-card card';

    var valEl = document.createElement('div');
    valEl.className = 'stat-value';
    valEl.textContent = value;
    card.appendChild(valEl);

    var titleEl = document.createElement('div');
    titleEl.className = 'stat-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);

    var descEl = document.createElement('div');
    descEl.className = 'stat-desc';
    descEl.textContent = description;
    card.appendChild(descEl);

    return card;
  }

  // =========================================================================
  // VIEW: REGISTER PAGE (Step 1 & Step 2)
  // =========================================================================

  function renderRegisterView(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'page-content page-register';

    var heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.textContent = 'Student Registration';
    wrapper.appendChild(heading);

    var intro = document.createElement('p');
    intro.className = 'page-intro';
    intro.textContent =
      'Please fill in the enrollment details. All fields are validated in real-time with strict security constraints.';
    wrapper.appendChild(intro);

    // Form Container
    var formCard = document.createElement('div');
    formCard.className = 'form-card card';

    var form = document.createElement('form');
    form.id = 'registration-form';
    form.noValidate = true;

    // Field 1: Full Name
    var nameGroup = createFormField({
      id: 'reg-name',
      name: 'name',
      label: 'Full Name',
      type: 'text',
      placeholder: 'e.g., Rahul Sharma',
      hint: 'At least 3 characters, letters and spaces only.'
    });
    form.appendChild(nameGroup);

    // Field 2: Email Address
    var emailGroup = createFormField({
      id: 'reg-email',
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'e.g., student@example.com',
      hint: 'A valid email address for academic correspondence.'
    });
    form.appendChild(emailGroup);

    // Field 3: Username
    var userGroup = createFormField({
      id: 'reg-username',
      name: 'username',
      label: 'Username',
      type: 'text',
      placeholder: 'e.g., rahul_2026',
      hint: '4-15 characters, must start with a letter, letters, numbers & underscore.'
    });
    form.appendChild(userGroup);

    // Field 4: Password + Strength Meter + Checklist + Show/Hide
    var pwdGroup = createPasswordGroup();
    form.appendChild(pwdGroup);

    // Field 5: Confirm Password + Show/Hide
    var confirmGroup = createConfirmPasswordGroup();
    form.appendChild(confirmGroup);

    // Field 6: Phone Number
    var phoneGroup = createFormField({
      id: 'reg-phone',
      name: 'phone',
      label: 'Phone Number (India)',
      type: 'tel',
      placeholder: 'e.g., 9876543210',
      hint: '10-digit Indian mobile number starting with 6, 7, 8, or 9.'
    });
    form.appendChild(phoneGroup);

    // Field 7: Date of Birth
    var dobGroup = createFormField({
      id: 'reg-dob',
      name: 'dob',
      label: 'Date of Birth',
      type: 'date',
      placeholder: 'YYYY-MM-DD',
      hint: 'Must be a valid past date; applicant must be at least 15 years old.'
    });
    form.appendChild(dobGroup);

    // Field 8: Terms Checkbox
    var termsGroup = createTermsGroup();
    form.appendChild(termsGroup);

    // Submit & Reset Actions
    var formActions = document.createElement('div');
    formActions.className = 'form-actions';

    var submitBtn = document.createElement('button');
    submitBtn.id = 'reg-submit-btn';
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary btn-submit';
    submitBtn.disabled = true; // Disabled initially until valid
    submitBtn.textContent = 'Register Student';
    formActions.appendChild(submitBtn);

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-secondary';
    resetBtn.textContent = 'Clear Form';
    resetBtn.onclick = function () {
      if (confirm('Are you sure you want to clear all form fields?')) {
        form.reset();
        isRegisterFormDirty = false;
        resetValidationUI(form);
      }
    };
    formActions.appendChild(resetBtn);

    form.appendChild(formActions);
    formCard.appendChild(form);
    wrapper.appendChild(formCard);
    container.appendChild(wrapper);

    // Bind Live Form Validation Events (Step 1)
    setupLiveFormValidation(form);
  }

  /**
   * Helper to create standard text/email/tel/date form input groups.
   */
  function createFormField(config) {
    var group = document.createElement('div');
    group.className = 'form-group';
    group.dataset.field = config.name;

    var label = document.createElement('label');
    label.htmlFor = config.id;
    label.textContent = config.label + ' ';

    var reqSpan = document.createElement('span');
    reqSpan.className = 'required-star';
    reqSpan.setAttribute('aria-hidden', 'true');
    reqSpan.textContent = '*';
    label.appendChild(reqSpan);

    group.appendChild(label);

    var input = document.createElement('input');
    input.id = config.id;
    input.name = config.name;
    input.type = config.type;
    input.className = 'form-control';
    input.placeholder = config.placeholder || '';
    input.setAttribute('aria-describedby', config.id + '-hint ' + config.id + '-error');
    input.setAttribute('aria-invalid', 'false');
    input.required = true;
    group.appendChild(input);

    var hint = document.createElement('div');
    hint.id = config.id + '-hint';
    hint.className = 'form-hint';
    hint.textContent = config.hint;
    group.appendChild(hint);

    var error = document.createElement('div');
    error.id = config.id + '-error';
    error.className = 'form-error-msg';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    group.appendChild(error);

    return group;
  }

  /**
   * Creates the Password form group with strength meter, checklist, and show/hide toggle.
   */
  function createPasswordGroup() {
    var group = document.createElement('div');
    group.className = 'form-group password-group';
    group.dataset.field = 'password';

    var label = document.createElement('label');
    label.htmlFor = 'reg-password';
    label.textContent = 'Password ';

    var reqSpan = document.createElement('span');
    reqSpan.className = 'required-star';
    reqSpan.setAttribute('aria-hidden', 'true');
    reqSpan.textContent = '*';
    label.appendChild(reqSpan);

    group.appendChild(label);

    // Input with Show/Hide toggle wrapper
    var inputWrap = document.createElement('div');
    inputWrap.className = 'input-action-wrapper';

    var input = document.createElement('input');
    input.id = 'reg-password';
    input.name = 'password';
    input.type = 'password';
    input.className = 'form-control';
    input.placeholder = 'Enter strong password';
    input.autocomplete = 'new-password';
    input.setAttribute('aria-describedby', 'reg-password-hint reg-password-error pwd-meter-status');
    input.setAttribute('aria-invalid', 'false');
    input.required = true;
    inputWrap.appendChild(input);

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-toggle-pwd';
    toggleBtn.setAttribute('aria-label', 'Show password as plain text');
    toggleBtn.textContent = 'Show';
    toggleBtn.onclick = function () {
      if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.textContent = 'Hide';
        toggleBtn.setAttribute('aria-label', 'Hide password');
      } else {
        input.type = 'password';
        toggleBtn.textContent = 'Show';
        toggleBtn.setAttribute('aria-label', 'Show password as plain text');
      }
    };
    inputWrap.appendChild(toggleBtn);
    group.appendChild(inputWrap);

    // Password Strength Meter
    var meterWrap = document.createElement('div');
    meterWrap.className = 'pwd-strength-container';

    var meterHeader = document.createElement('div');
    meterHeader.className = 'pwd-meter-header';

    var meterLabel = document.createElement('span');
    meterLabel.className = 'pwd-meter-title';
    meterLabel.textContent = 'Password Strength: ';
    meterHeader.appendChild(meterLabel);

    var strengthValue = document.createElement('span');
    strengthValue.id = 'pwd-strength-label';
    strengthValue.className = 'pwd-strength-label strength-none';
    strengthValue.textContent = 'Not entered';
    meterHeader.appendChild(strengthValue);
    meterWrap.appendChild(meterHeader);

    var barTrack = document.createElement('div');
    barTrack.className = 'pwd-bar-track';
    barTrack.id = 'pwd-meter-status';
    barTrack.setAttribute('role', 'progressbar');
    barTrack.setAttribute('aria-valuemin', '0');
    barTrack.setAttribute('aria-valuemax', '4');
    barTrack.setAttribute('aria-valuenow', '0');
    barTrack.setAttribute('aria-valuetext', 'Not entered');

    var barFill = document.createElement('div');
    barFill.id = 'pwd-bar-fill';
    barFill.className = 'pwd-bar-fill fill-none';
    barTrack.appendChild(barFill);
    meterWrap.appendChild(barTrack);
    group.appendChild(meterWrap);

    // Live Checklist (Step 1 requirement)
    var checklistCard = document.createElement('div');
    checklistCard.className = 'pwd-checklist';
    checklistCard.setAttribute('aria-label', 'Password rules checklist');

    var clTitle = document.createElement('div');
    clTitle.className = 'checklist-title';
    clTitle.textContent = 'Password Requirements Checklist:';
    checklistCard.appendChild(clTitle);

    var ul = document.createElement('ul');
    ul.className = 'checklist-items';

    var rules = [
      { key: 'length', label: 'At least 8 characters long' },
      { key: 'uppercase', label: 'At least one uppercase letter (A-Z)' },
      { key: 'lowercase', label: 'At least one lowercase letter (a-z)' },
      { key: 'number', label: 'At least one number (0-9)' },
      { key: 'special', label: 'At least one special character (!@#$%...)' }
    ];

    for (var i = 0; i < rules.length; i++) {
      var li = document.createElement('li');
      li.id = 'rule-' + rules[i].key;
      li.className = 'rule-item rule-unmet';

      var iconSpan = document.createElement('span');
      iconSpan.className = 'rule-icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = '✕';
      li.appendChild(iconSpan);

      var textSpan = document.createElement('span');
      textSpan.className = 'rule-text';
      textSpan.textContent = ' ' + rules[i].label;
      li.appendChild(textSpan);

      ul.appendChild(li);
    }
    checklistCard.appendChild(ul);
    group.appendChild(checklistCard);

    var error = document.createElement('div');
    error.id = 'reg-password-error';
    error.className = 'form-error-msg';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    group.appendChild(error);

    return group;
  }

  /**
   * Creates Confirm Password group with show/hide toggle.
   */
  function createConfirmPasswordGroup() {
    var group = document.createElement('div');
    group.className = 'form-group confirm-password-group';
    group.dataset.field = 'confirmPassword';

    var label = document.createElement('label');
    label.htmlFor = 'reg-confirm-password';
    label.textContent = 'Confirm Password ';

    var reqSpan = document.createElement('span');
    reqSpan.className = 'required-star';
    reqSpan.setAttribute('aria-hidden', 'true');
    reqSpan.textContent = '*';
    label.appendChild(reqSpan);

    group.appendChild(label);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'input-action-wrapper';

    var input = document.createElement('input');
    input.id = 'reg-confirm-password';
    input.name = 'confirmPassword';
    input.type = 'password';
    input.className = 'form-control';
    input.placeholder = 'Re-enter your password';
    input.autocomplete = 'new-password';
    input.setAttribute('aria-describedby', 'reg-confirm-password-error');
    input.setAttribute('aria-invalid', 'false');
    input.required = true;
    inputWrap.appendChild(input);

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-toggle-pwd';
    toggleBtn.setAttribute('aria-label', 'Show confirm password as plain text');
    toggleBtn.textContent = 'Show';
    toggleBtn.onclick = function () {
      if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.textContent = 'Hide';
        toggleBtn.setAttribute('aria-label', 'Hide confirm password');
      } else {
        input.type = 'password';
        toggleBtn.textContent = 'Show';
        toggleBtn.setAttribute('aria-label', 'Show confirm password as plain text');
      }
    };
    inputWrap.appendChild(toggleBtn);
    group.appendChild(inputWrap);

    var error = document.createElement('div');
    error.id = 'reg-confirm-password-error';
    error.className = 'form-error-msg';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    group.appendChild(error);

    return group;
  }

  /**
   * Creates Terms and conditions checkbox group.
   */
  function createTermsGroup() {
    var group = document.createElement('div');
    group.className = 'form-group form-check-group';
    group.dataset.field = 'terms';

    var label = document.createElement('label');
    label.className = 'checkbox-label';
    label.htmlFor = 'reg-terms';

    var checkbox = document.createElement('input');
    checkbox.id = 'reg-terms';
    checkbox.name = 'terms';
    checkbox.type = 'checkbox';
    checkbox.className = 'form-checkbox';
    checkbox.setAttribute('aria-describedby', 'reg-terms-error');
    checkbox.setAttribute('aria-invalid', 'false');
    checkbox.required = true;
    label.appendChild(checkbox);

    var textSpan = document.createElement('span');
    textSpan.className = 'checkbox-text';
    textSpan.textContent = ' I agree to the Student Code of Conduct and Terms of Service.';
    label.appendChild(textSpan);

    group.appendChild(label);

    var error = document.createElement('div');
    error.id = 'reg-terms-error';
    error.className = 'form-error-msg';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    group.appendChild(error);

    return group;
  }

  /**
   * Sets up live validation on input, blur, and submit events (Step 1).
   */
  function setupLiveFormValidation(form) {
    var validators = window.Validators;
    if (!validators) {
      console.error('Validators module not loaded.');
      return;
    }

    var nameInput = form.querySelector('#reg-name');
    var emailInput = form.querySelector('#reg-email');
    var userInput = form.querySelector('#reg-username');
    var pwdInput = form.querySelector('#reg-password');
    var confirmInput = form.querySelector('#reg-confirm-password');
    var phoneInput = form.querySelector('#reg-phone');
    var dobInput = form.querySelector('#reg-dob');
    var termsInput = form.querySelector('#reg-terms');
    var submitBtn = form.querySelector('#reg-submit-btn');

    // Password strength elements
    var strengthLabel = document.getElementById('pwd-strength-label');
    var barFill = document.getElementById('pwd-bar-fill');
    var barTrack = document.getElementById('pwd-meter-status');

    /**
     * Checks if form is dirty (any non-empty input).
     */
    function updateDirtyStatus() {
      var hasText =
        nameInput.value.trim() !== '' ||
        emailInput.value.trim() !== '' ||
        userInput.value.trim() !== '' ||
        pwdInput.value !== '' ||
        confirmInput.value !== '' ||
        phoneInput.value.trim() !== '' ||
        dobInput.value.trim() !== '' ||
        termsInput.checked;
      isRegisterFormDirty = hasText;
    }

    /**
     * Updates visual field validation state (red or green + message).
     */
    function setFieldState(fieldInput, result, groupSelector) {
      var group = form.querySelector(groupSelector);
      if (!group) return;
      var errorEl = group.querySelector('.form-error-msg');

      if (!result.valid) {
        group.classList.remove('is-valid');
        group.classList.add('is-invalid');
        fieldInput.setAttribute('aria-invalid', 'true');
        if (errorEl) {
          errorEl.textContent = result.message;
          errorEl.className = 'form-error-msg state-error';
        }
      } else {
        group.classList.remove('is-invalid');
        group.classList.add('is-valid');
        fieldInput.setAttribute('aria-invalid', 'false');
        if (errorEl) {
          errorEl.textContent = result.message;
          errorEl.className = 'form-error-msg state-valid';
        }
      }
    }

    /**
     * Updates password UI: meter bar, label, and checklist.
     */
    function updatePasswordUI(pwdRes) {
      var checks = pwdRes.checks;
      var score = pwdRes.score;
      var label = pwdRes.label;

      // Update Checklist items
      updateChecklistItem('rule-length', checks.length);
      updateChecklistItem('rule-uppercase', checks.uppercase);
      updateChecklistItem('rule-lowercase', checks.lowercase);
      updateChecklistItem('rule-number', checks.number);
      updateChecklistItem('rule-special', checks.special);

      // Update Strength Meter Bar and Label
      if (strengthLabel) {
        strengthLabel.textContent = label;
        strengthLabel.className = 'pwd-strength-label strength-' + score;
      }

      if (barTrack) {
        barTrack.setAttribute('aria-valuenow', score.toString());
        barTrack.setAttribute('aria-valuetext', label);
      }

      if (barFill) {
        var widths = ['10%', '25%', '50%', '75%', '100%'];
        barFill.style.width = pwdInput.value === '' ? '0%' : widths[score];
        barFill.className = 'pwd-bar-fill fill-' + score;
      }
    }

    function updateChecklistItem(elemId, passed) {
      var item = document.getElementById(elemId);
      if (!item) return;
      var icon = item.querySelector('.rule-icon');
      if (passed) {
        item.classList.remove('rule-unmet');
        item.classList.add('rule-met');
        if (icon) icon.textContent = '✓';
      } else {
        item.classList.remove('rule-met');
        item.classList.add('rule-unmet');
        if (icon) icon.textContent = '✕';
      }
    }

    /**
     * Evaluates the entire form and enables/disables submit button.
     */
    function evaluateFormValidity() {
      var formData = {
        name: nameInput.value,
        email: emailInput.value,
        username: userInput.value,
        password: pwdInput.value,
        confirmPassword: confirmInput.value,
        phone: phoneInput.value,
        dob: dobInput.value,
        terms: termsInput.checked
      };

      var formRes = validators.validateForm(formData);
      submitBtn.disabled = !formRes.valid;
      return formRes;
    }

    // Individual live field handlers
    function handleName() {
      updateDirtyStatus();
      var res = validators.validateName(nameInput.value);
      setFieldState(nameInput, res, '[data-field="name"]');
      evaluateFormValidity();
    }

    function handleEmail() {
      updateDirtyStatus();
      var res = validators.validateEmail(emailInput.value);
      setFieldState(emailInput, res, '[data-field="email"]');
      evaluateFormValidity();
    }

    function handleUsername() {
      updateDirtyStatus();
      var res = validators.validateUsername(userInput.value);
      setFieldState(userInput, res, '[data-field="username"]');
      // If password is typed, re-validate password in case it contains username
      if (pwdInput.value) {
        handlePassword();
      }
      evaluateFormValidity();
    }

    function handlePassword() {
      updateDirtyStatus();
      var res = validators.validatePassword(pwdInput.value, userInput.value);
      updatePasswordUI(res);
      setFieldState(pwdInput, res, '[data-field="password"]');
      // Also re-validate confirm password if already typed
      if (confirmInput.value) {
        handleConfirmPassword();
      }
      evaluateFormValidity();
    }

    function handleConfirmPassword() {
      updateDirtyStatus();
      var res = validators.validateConfirmPassword(confirmInput.value, pwdInput.value);
      setFieldState(confirmInput, res, '[data-field="confirmPassword"]');
      evaluateFormValidity();
    }

    function handlePhone() {
      updateDirtyStatus();
      var res = validators.validatePhone(phoneInput.value);
      setFieldState(phoneInput, res, '[data-field="phone"]');
      evaluateFormValidity();
    }

    function handleDob() {
      updateDirtyStatus();
      var res = validators.validateDob(dobInput.value);
      setFieldState(dobInput, res, '[data-field="dob"]');
      evaluateFormValidity();
    }

    function handleTerms() {
      updateDirtyStatus();
      var res = validators.validateTerms(termsInput.checked);
      setFieldState(termsInput, res, '[data-field="terms"]');
      evaluateFormValidity();
    }

    // Attach input and blur listeners to all fields
    nameInput.addEventListener('input', handleName);
    nameInput.addEventListener('blur', handleName);

    emailInput.addEventListener('input', handleEmail);
    emailInput.addEventListener('blur', handleEmail);

    userInput.addEventListener('input', handleUsername);
    userInput.addEventListener('blur', handleUsername);

    pwdInput.addEventListener('input', handlePassword);
    pwdInput.addEventListener('blur', handlePassword);

    confirmInput.addEventListener('input', handleConfirmPassword);
    confirmInput.addEventListener('blur', handleConfirmPassword);

    phoneInput.addEventListener('input', handlePhone);
    phoneInput.addEventListener('blur', handlePhone);

    dobInput.addEventListener('input', handleDob);
    dobInput.addEventListener('blur', handleDob);

    termsInput.addEventListener('change', handleTerms);

    // Form Submission (Step 1 & Step 2)
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Validate all fields again on submit
      var formRes = evaluateFormValidity();
      if (!formRes.valid) {
        // Run all individual handlers to show errors
        handleName();
        handleEmail();
        handleUsername();
        handlePassword();
        handleConfirmPassword();
        handlePhone();
        handleDob();
        handleTerms();
        showToast('Please correct highlighted errors before submitting.', 'error', 3000);
        return;
      }

      // Create new student object (CRITICAL: NEVER STORE PASSWORD)
      var newStudent = {
        id: 'stu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        username: userInput.value.trim(),
        phone: phoneInput.value.trim(),
        dob: dobInput.value.trim(),
        createdAt: Date.now()
      };

      // Add student to in-memory list and persist
      students.unshift(newStudent);
      saveStudents();

      // Clear dirty flag and reset form
      isRegisterFormDirty = false;
      form.reset();
      resetValidationUI(form);

      // Show success toast (disappears after 3 seconds)
      showToast('Student "' + newStudent.name + '" registered successfully!', 'success', 3000);

      // Navigate to Students directory
      window.location.hash = '#/students';
    });
  }

  /**
   * Resets all validation styles and indicators on form clear.
   */
  function resetValidationUI(form) {
    var groups = form.querySelectorAll('.form-group');
    for (var i = 0; i < groups.length; i++) {
      groups[i].classList.remove('is-valid', 'is-invalid');
      var error = groups[i].querySelector('.form-error-msg');
      if (error) {
        error.textContent = '';
        error.className = 'form-error-msg';
      }
      var input = groups[i].querySelector('input');
      if (input) {
        input.setAttribute('aria-invalid', 'false');
      }
    }

    var strengthLabel = document.getElementById('pwd-strength-label');
    if (strengthLabel) {
      strengthLabel.textContent = 'Not entered';
      strengthLabel.className = 'pwd-strength-label strength-none';
    }

    var barFill = document.getElementById('pwd-bar-fill');
    if (barFill) {
      barFill.style.width = '0%';
      barFill.className = 'pwd-bar-fill fill-none';
    }

    var rules = ['length', 'uppercase', 'lowercase', 'number', 'special'];
    for (var r = 0; r < rules.length; r++) {
      var item = document.getElementById('rule-' + rules[r]);
      if (item) {
        item.className = 'rule-item rule-unmet';
        var icon = item.querySelector('.rule-icon');
        if (icon) icon.textContent = '✕';
      }
    }

    var submitBtn = form.querySelector('#reg-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }

  // =========================================================================
  // VIEW: STUDENTS DIRECTORY (Step 2: Dynamic DOM updates)
  // =========================================================================

  function renderStudentsView(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'page-content page-students';

    // Header
    var header = document.createElement('div');
    header.className = 'students-header';

    var heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.textContent = 'Student Directory';
    header.appendChild(heading);

    var sub = document.createElement('p');
    sub.className = 'page-intro';
    sub.textContent =
      'Real-time dynamic DOM rendering. Filter by keyword, sort records, or remove items with instant undo.';
    header.appendChild(sub);
    wrapper.appendChild(header);

    // Toolbar (Search, Sort, and Counter)
    var toolbar = document.createElement('div');
    toolbar.className = 'students-toolbar card';

    // Search Box
    var searchGroup = document.createElement('div');
    searchGroup.className = 'toolbar-item search-item';

    var searchLabel = document.createElement('label');
    searchLabel.htmlFor = 'students-search';
    searchLabel.className = 'sr-only';
    searchLabel.textContent = 'Search students by name, email or username';
    searchGroup.appendChild(searchLabel);

    var searchInput = document.createElement('input');
    searchInput.id = 'students-search';
    searchInput.type = 'search';
    searchInput.className = 'form-control search-input';
    searchInput.placeholder = 'Search by name, username, or email...';
    searchGroup.appendChild(searchInput);
    toolbar.appendChild(searchGroup);

    // Sort Dropdown
    var sortGroup = document.createElement('div');
    sortGroup.className = 'toolbar-item sort-item';

    var sortLabel = document.createElement('label');
    sortLabel.htmlFor = 'students-sort';
    sortLabel.className = 'sort-label';
    sortLabel.textContent = 'Sort by: ';
    sortGroup.appendChild(sortLabel);

    var sortSelect = document.createElement('select');
    sortSelect.id = 'students-sort';
    sortSelect.className = 'form-control sort-select';

    var sortOpts = [
      { value: 'date-desc', label: 'Newest First' },
      { value: 'date-asc', label: 'Oldest First' },
      { value: 'name-asc', label: 'Name (A to Z)' },
      { value: 'name-desc', label: 'Name (Z to A)' }
    ];

    for (var o = 0; o < sortOpts.length; o++) {
      var opt = document.createElement('option');
      opt.value = sortOpts[o].value;
      opt.textContent = sortOpts[o].label;
      sortSelect.appendChild(opt);
    }
    sortGroup.appendChild(sortSelect);
    toolbar.appendChild(sortGroup);

    // Counter badge ("Showing X of Y students")
    var counterBox = document.createElement('div');
    counterBox.className = 'toolbar-item counter-item';

    var counterBadge = document.createElement('div');
    counterBadge.id = 'students-counter';
    counterBadge.className = 'counter-badge';
    counterBadge.setAttribute('role', 'status');
    counterBadge.setAttribute('aria-live', 'polite');
    counterBox.appendChild(counterBadge);
    toolbar.appendChild(counterBox);

    wrapper.appendChild(toolbar);

    // Students Grid Container (populated dynamically via createElement)
    var gridContainer = document.createElement('div');
    gridContainer.id = 'students-grid';
    gridContainer.className = 'students-grid';
    wrapper.appendChild(gridContainer);

    container.appendChild(wrapper);

    /**
     * Refreshes the students grid based on active search and sort.
     */
    function updateList() {
      var query = searchInput.value.trim().toLowerCase();
      var sortMode = sortSelect.value;

      // 1. Filter students (name, username, email)
      var filtered = students.filter(function (s) {
        if (!query) return true;
        var nameMatch = s.name.toLowerCase().indexOf(query) !== -1;
        var userMatch = s.username.toLowerCase().indexOf(query) !== -1;
        var emailMatch = s.email.toLowerCase().indexOf(query) !== -1;
        return nameMatch || userMatch || emailMatch;
      });

      // 2. Sort students
      filtered.sort(function (a, b) {
        if (sortMode === 'name-asc') {
          return a.name.localeCompare(b.name);
        }
        if (sortMode === 'name-desc') {
          return b.name.localeCompare(a.name);
        }
        if (sortMode === 'date-asc') {
          return (a.createdAt || 0) - (b.createdAt || 0);
        }
        // Default: date-desc
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      // 3. Update counter text
      counterBadge.textContent =
        'Showing ' + filtered.length + ' of ' + students.length + ' students';

      // 4. Render cards using createElement (NEVER innerHTML for user data)
      renderStudentCards(gridContainer, filtered, query);
    }

    // Attach live search & sort listeners
    searchInput.addEventListener('input', updateList);
    sortSelect.addEventListener('change', updateList);

    // Initial render
    updateList();
  }

  /**
   * Renders student cards using document.createElement and textContent exclusively.
   * Completely immune to XSS attacks (Step 2 safety rule).
   */
  function renderStudentCards(container, list, activeQuery) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Empty state 1: Total directory is empty
    if (students.length === 0) {
      var emptyAll = document.createElement('div');
      emptyAll.className = 'empty-state card';

      var emptyTitle = document.createElement('h2');
      emptyTitle.textContent = 'No Students Registered Yet';
      emptyAll.appendChild(emptyTitle);

      var emptyText = document.createElement('p');
      emptyText.textContent =
        'The student roster is currently empty. Click below to add your first student record.';
      emptyAll.appendChild(emptyText);

      var addLink = document.createElement('a');
      addLink.href = '#/register';
      addLink.className = 'btn btn-primary';
      addLink.textContent = 'Register a Student →';
      emptyAll.appendChild(addLink);

      container.appendChild(emptyAll);
      return;
    }

    // Empty state 2: Search filter returned no matches
    if (list.length === 0) {
      var emptySearch = document.createElement('div');
      emptySearch.className = 'empty-state card';

      var searchTitle = document.createElement('h2');
      searchTitle.textContent = 'No Matching Students Found';
      emptySearch.appendChild(searchTitle);

      var searchText = document.createElement('p');
      searchText.textContent = 'No student records match "' + activeQuery + '". Try another keyword.';
      emptySearch.appendChild(searchText);

      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn btn-secondary';
      clearBtn.textContent = 'Clear Search';
      clearBtn.onclick = function () {
        var sInput = document.getElementById('students-search');
        if (sInput) {
          sInput.value = '';
          sInput.dispatchEvent(new Event('input'));
          sInput.focus();
        }
      };
      emptySearch.appendChild(clearBtn);

      container.appendChild(emptySearch);
      return;
    }

    // Render cards for each student
    for (var i = 0; i < list.length; i++) {
      var student = list[i];
      var card = createStudentCard(student);
      container.appendChild(card);
    }
  }

  /**
   * Creates a single student card element using createElement.
   * Uses textContent for all user-derived fields (Step 2).
   */
  function createStudentCard(student) {
    var card = document.createElement('article');
    card.className = 'student-card card';
    card.dataset.id = student.id;

    // Card Header (Avatar + Name & Username)
    var cardHeader = document.createElement('div');
    cardHeader.className = 'card-header-row';

    var avatar = document.createElement('div');
    avatar.className = 'student-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    // Initials from student name
    var initials = student.name
      .split(' ')
      .map(function (part) { return part.charAt(0); })
      .join('')
      .substring(0, 2)
      .toUpperCase();
    avatar.textContent = initials || 'ST';
    cardHeader.appendChild(avatar);

    var titlesWrap = document.createElement('div');
    titlesWrap.className = 'student-titles';

    var nameEl = document.createElement('h2');
    nameEl.className = 'student-name';
    nameEl.textContent = student.name; // textContent prevents XSS
    titlesWrap.appendChild(nameEl);

    var userEl = document.createElement('div');
    userEl.className = 'student-username';
    userEl.textContent = '@' + student.username; // textContent
    titlesWrap.appendChild(userEl);

    cardHeader.appendChild(titlesWrap);
    card.appendChild(cardHeader);

    // Card Body Details
    var details = document.createElement('div');
    details.className = 'student-details';

    var emailRow = document.createElement('div');
    emailRow.className = 'detail-row';
    var emailKey = document.createElement('span');
    emailKey.className = 'detail-label';
    emailKey.textContent = 'Email: ';
    emailRow.appendChild(emailKey);
    var emailVal = document.createElement('span');
    emailVal.className = 'detail-val';
    emailVal.textContent = student.email;
    emailRow.appendChild(emailVal);
    details.appendChild(emailRow);

    if (student.phone) {
      var phoneRow = document.createElement('div');
      phoneRow.className = 'detail-row';
      var phoneKey = document.createElement('span');
      phoneKey.className = 'detail-label';
      phoneKey.textContent = 'Phone: ';
      phoneRow.appendChild(phoneKey);
      var phoneVal = document.createElement('span');
      phoneVal.className = 'detail-val';
      phoneVal.textContent = student.phone;
      phoneRow.appendChild(phoneVal);
      details.appendChild(phoneRow);
    }

    if (student.dob) {
      var dobRow = document.createElement('div');
      dobRow.className = 'detail-row';
      var dobKey = document.createElement('span');
      dobKey.className = 'detail-label';
      dobKey.textContent = 'DOB: ';
      dobRow.appendChild(dobKey);
      var dobVal = document.createElement('span');
      dobVal.className = 'detail-val';
      dobVal.textContent = student.dob;
      dobRow.appendChild(dobVal);
      details.appendChild(dobRow);
    }

    card.appendChild(details);

    // Card Footer Actions
    var footer = document.createElement('div');
    footer.className = 'card-footer-row';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-danger btn-remove';
    removeBtn.setAttribute('aria-label', 'Remove student ' + student.name);
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = function () {
      handleRemoveStudent(student.id);
    };
    footer.appendChild(removeBtn);

    card.appendChild(footer);
    return card;
  }

  /**
   * Handles removal of a student with immediate 5-second Undo capability.
   */
  function handleRemoveStudent(studentId) {
    var index = -1;
    for (var i = 0; i < students.length; i++) {
      if (students[i].id === studentId) {
        index = i;
        break;
      }
    }

    if (index === -1) return;

    var removedStudent = students[index];

    // Remove from in-memory list
    students.splice(index, 1);
    saveStudents();

    // Cache removed item for Undo
    lastRemovedItem = {
      student: removedStudent,
      index: index
    };

    // Re-render Students view immediately if currently active
    if (window.AppRouter && window.AppRouter.matchRoute(window.location.hash) === 'students') {
      var container = document.getElementById('app');
      renderStudentsView(container);
    }

    // Show Undo Toast (5 seconds)
    showUndoToast(removedStudent.name, function () {
      // Undo callback: Restore student to previous position
      if (lastRemovedItem && lastRemovedItem.student) {
        var restoreIdx = Math.min(lastRemovedItem.index, students.length);
        students.splice(restoreIdx, 0, lastRemovedItem.student);
        saveStudents();

        showToast('Restored "' + lastRemovedItem.student.name + '" to directory.', 'info', 2500);
        lastRemovedItem = null;

        if (window.AppRouter && window.AppRouter.matchRoute(window.location.hash) === 'students') {
          var appCont = document.getElementById('app');
          renderStudentsView(appCont);
        }
      }
    });
  }

  // =========================================================================
  // VIEW: ABOUT PAGE (Step 3)
  // =========================================================================

  function renderAboutView(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'page-content page-about';

    var heading = document.createElement('h1');
    heading.className = 'page-title';
    heading.textContent = 'About Student Portal';
    wrapper.appendChild(heading);

    var card = document.createElement('div');
    card.className = 'about-card card';

    var desc = document.createElement('p');
    desc.textContent =
      'This single-page application is built for the Cognifyz Full Stack Development Internship (Level 2: Intermediate, Task 4: Complex Form Validation and Dynamic DOM Manipulation).';
    card.appendChild(desc);

    var h2Steps = document.createElement('h2');
    h2Steps.textContent = 'Implementation Overview';
    card.appendChild(h2Steps);

    var dl = document.createElement('dl');
    dl.className = 'about-spec-list';

    var specs = [
      {
        term: 'Step 1: Complex Form Validation',
        detail:
          'Pure validation functions in validators.js enforcing multi-rule checks: name, RFC email, alphanumeric username, score 0-4 password strength meter, 5 live checklist rules, rejection criteria (username, "password", repeating characters), confirm match, 10-digit Indian mobile, and calendar age >= 15 calculation.'
      },
      {
        term: 'Step 2: Dynamic DOM Manipulation',
        detail:
          'Constructs all elements dynamically via document.createElement and textContent. Passwords are never stored in memory or persistence. Features live search filtering, multi-order sorting, total counters ("Showing X of Y"), and student card removal with an immediate 5-second Undo buffer.'
      },
      {
        term: 'Step 3: Client-Side Hash Routing',
        detail:
          'Zero-reload navigation using hashchange (#/home, #/register, #/students, #/about). Supports browser Back/Forward history, active nav links (aria-current="page"), document title synchronization, focus management, and unsaved changes confirmation guards.'
      },
      {
        term: 'Security & Best Practices',
        detail:
          'Zero third-party dependencies, safe localStorage serialization with try/catch, anti-XSS textContent guarantees, light-theme accessible color contrast, and prefers-reduced-motion compliance.'
      }
    ];

    for (var s = 0; s < specs.length; s++) {
      var dt = document.createElement('dt');
      dt.textContent = specs[s].term;
      dl.appendChild(dt);

      var dd = document.createElement('dd');
      dd.textContent = specs[s].detail;
      dl.appendChild(dd);
    }

    card.appendChild(dl);
    wrapper.appendChild(card);
    container.appendChild(wrapper);
  }

  // =========================================================================
  // VIEW: 404 NOT FOUND VIEW (Step 3)
  // =========================================================================

  function renderNotFoundView(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'page-content page-not-found';

    var card = document.createElement('div');
    card.className = 'not-found-card card text-center';

    var code = document.createElement('div');
    code.className = 'not-found-code';
    code.textContent = '404';
    card.appendChild(code);

    var title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = 'Page Not Found';
    card.appendChild(title);

    var msg = document.createElement('p');
    msg.textContent = 'The route you followed does not exist in the Student Portal.';
    card.appendChild(msg);

    var homeBtn = document.createElement('a');
    homeBtn.href = '#/home';
    homeBtn.className = 'btn btn-primary';
    homeBtn.textContent = 'Return to Home';
    card.appendChild(homeBtn);

    wrapper.appendChild(card);
    container.appendChild(wrapper);
  }

  // =========================================================================
  // Application Bootstrap (Step 3: Router Setup)
  // =========================================================================

  function initApp() {
    // 1. Safely load persisted student data
    loadStudents();

    // 2. Identify main app container
    var appContainer = document.getElementById('app');
    if (!appContainer) {
      console.error('Fatal: #app container element not found.');
      return;
    }

    // 3. Define route views and titles mapping
    var views = {
      home: renderHomeView,
      register: renderRegisterView,
      students: renderStudentsView,
      about: renderAboutView,
      'not-found': renderNotFoundView
    };

    var titles = {
      home: 'Home | Cognifyz Student Portal',
      register: 'Register Student | Cognifyz Student Portal',
      students: 'Student Directory | Cognifyz Student Portal',
      about: 'About | Cognifyz Student Portal',
      'not-found': '404 Not Found | Cognifyz Student Portal',
      default: 'Cognifyz Student Portal - Level 2 Task 4'
    };

    // 4. Initialize client router
    if (window.AppRouter && window.AppRouter.createRouter) {
      var router = window.AppRouter.createRouter({
        container: appContainer,
        views: views,
        titles: titles,
        hasUnsavedChanges: function () {
          return isRegisterFormDirty;
        }
      });
      router.init();
    } else {
      console.error('Fatal: AppRouter module not found.');
    }
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
