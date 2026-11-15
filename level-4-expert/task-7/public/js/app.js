/**
 * public/js/app.js
 * Front-end logic for Student Task Manager (Task 6: Authentication & Database Integration).
 * Communicates exclusively with REST API endpoints using fetch().
 *
 * Security Guarantee:
 * All user inputs and API responses are safely rendered using document.createElement()
 * and element.textContent. innerHTML is NEVER used to render dynamic data, preventing XSS.
 * JWT is stored in localStorage with try/catch and sent in the Authorization header.
 * On 401 responses, the token is automatically wiped and the user is redirected to Login.
 */

// =========================================================================
// Global Application State
// =========================================================================
const state = {
  token: null,
  currentUser: null,
  tasks: [],
  meta: {
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1
  },
  filters: {
    search: '',
    status: '',
    priority: '',
    sort: 'createdAt',
    order: 'desc'
  },
  inFlightRequests: 0,
  deleteTargetTask: null
};

// =========================================================================
// Storage Helpers (Defensive try/catch around localStorage)
// =========================================================================
function getStoredToken() {
  try {
    return localStorage.getItem('task_manager_jwt');
  } catch (_) {
    return null;
  }
}

function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem('task_manager_jwt', token);
    } else {
      localStorage.removeItem('task_manager_jwt');
    }
  } catch (_) {
    // Gracefully handle privacy mode / disabled storage
  }
}

// =========================================================================
// DOM Element References
// =========================================================================
const elements = {
  // Global & Announcements
  liveRegion: document.getElementById('liveRegion'),
  toastContainer: document.getElementById('toastContainer'),
  errorBanner: document.getElementById('errorBanner'),
  errorMessage: document.getElementById('errorMessage'),
  dismissErrorBtn: document.getElementById('dismissErrorBtn'),
  serverStatusPill: document.getElementById('serverStatusPill'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),

  // Header & User Account
  userAccountBar: document.getElementById('userAccountBar'),
  userNameText: document.getElementById('userNameText'),
  logoutBtn: document.getElementById('logoutBtn'),

  // Auth Section
  authSection: document.getElementById('authSection'),
  loginTabBtn: document.getElementById('loginTabBtn'),
  registerTabBtn: document.getElementById('registerTabBtn'),
  loginPanel: document.getElementById('loginPanel'),
  registerPanel: document.getElementById('registerPanel'),

  // Login Form
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  loginEmailError: document.getElementById('loginEmailError'),
  loginPasswordError: document.getElementById('loginPasswordError'),
  loginGeneralError: document.getElementById('loginGeneralError'),

  // Register Form
  registerForm: document.getElementById('registerForm'),
  registerName: document.getElementById('registerName'),
  registerEmail: document.getElementById('registerEmail'),
  registerPassword: document.getElementById('registerPassword'),
  registerSubmitBtn: document.getElementById('registerSubmitBtn'),
  registerNameError: document.getElementById('registerNameError'),
  registerEmailError: document.getElementById('registerEmailError'),
  registerPasswordError: document.getElementById('registerPasswordError'),
  registerGeneralError: document.getElementById('registerGeneralError'),

  // Task Manager Container
  taskManagerSection: document.getElementById('taskManagerSection'),

  // Create Form
  createTaskForm: document.getElementById('createTaskForm'),
  createTitle: document.getElementById('createTitle'),
  createDescription: document.getElementById('createDescription'),
  createPriority: document.getElementById('createPriority'),
  createStatus: document.getElementById('createStatus'),
  createDueDate: document.getElementById('createDueDate'),
  submitCreateBtn: document.getElementById('submitCreateBtn'),
  createTitleError: document.getElementById('createTitleError'),
  createDescriptionError: document.getElementById('createDescriptionError'),
  createPriorityError: document.getElementById('createPriorityError'),
  createStatusError: document.getElementById('createStatusError'),
  createDueDateError: document.getElementById('createDueDateError'),

  // Controls & Toolbar
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  priorityFilter: document.getElementById('priorityFilter'),
  sortField: document.getElementById('sortField'),
  sortOrderBtn: document.getElementById('sortOrderBtn'),
  sortOrderLabel: document.getElementById('sortOrderLabel'),
  refreshBtn: document.getElementById('refreshBtn'),
  taskCountSummary: document.getElementById('taskCountSummary'),

  // List & UX States
  loadingIndicator: document.getElementById('loadingIndicator'),
  emptyState: document.getElementById('emptyState'),
  emptyDescription: document.getElementById('emptyDescription'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  taskList: document.getElementById('taskList'),

  // Pagination
  pageInfoText: document.getElementById('pageInfoText'),
  limitSelect: document.getElementById('limitSelect'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),

  // Edit Modal
  editModalOverlay: document.getElementById('editModalOverlay'),
  editTaskForm: document.getElementById('editTaskForm'),
  closeEditModalBtn: document.getElementById('closeEditModalBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  editTaskId: document.getElementById('editTaskId'),
  editTitle: document.getElementById('editTitle'),
  editDescription: document.getElementById('editDescription'),
  editPriority: document.getElementById('editPriority'),
  editStatus: document.getElementById('editStatus'),
  editDueDate: document.getElementById('editDueDate'),
  editTitleError: document.getElementById('editTitleError'),
  editDescriptionError: document.getElementById('editDescriptionError'),
  editPriorityError: document.getElementById('editPriorityError'),
  editStatusError: document.getElementById('editStatusError'),
  editDueDateError: document.getElementById('editDueDateError'),

  // Delete Modal
  deleteModalOverlay: document.getElementById('deleteModalOverlay'),
  deleteTargetTitle: document.getElementById('deleteTargetTitle'),
  closeDeleteModalBtn: document.getElementById('closeDeleteModalBtn'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  // OAuth Elements
  oauthContainer: document.getElementById('oauthContainer'),
  githubLoginBtn: document.getElementById('githubLoginBtn'),

  // Weather Elements
  weatherCard: document.getElementById('weatherCard'),
  weatherSearchForm: document.getElementById('weatherSearchForm'),
  weatherCityInput: document.getElementById('weatherCityInput'),
  weatherSearchBtn: document.getElementById('weatherSearchBtn'),
  weatherLoading: document.getElementById('weatherLoading'),
  weatherError: document.getElementById('weatherError'),
  weatherErrorMessage: document.getElementById('weatherErrorMessage'),
  weatherContent: document.getElementById('weatherContent'),
  weatherCityText: document.getElementById('weatherCityText'),
  weatherCountryText: document.getElementById('weatherCountryText'),
  weatherCurrentTemp: document.getElementById('weatherCurrentTemp'),
  weatherCurrentCondition: document.getElementById('weatherCurrentCondition'),
  weatherPrecipitation: document.getElementById('weatherPrecipitation'),
  weatherDailyList: document.getElementById('weatherDailyList')
};

// =========================================================================
// API Communication Layer (fetch wrapper with Authorization header & 401 handling)
// =========================================================================

function setNetworkBusy(isInFlight) {
  if (isInFlight) {
    state.inFlightRequests++;
  } else {
    state.inFlightRequests = Math.max(0, state.inFlightRequests - 1);
  }

  const isBusy = state.inFlightRequests > 0;
  if (elements.submitCreateBtn) elements.submitCreateBtn.disabled = isBusy;
  if (elements.saveEditBtn) elements.saveEditBtn.disabled = isBusy;
  if (elements.confirmDeleteBtn) elements.confirmDeleteBtn.disabled = isBusy;
  if (elements.refreshBtn) elements.refreshBtn.disabled = isBusy;
}

/**
 * Robust fetch wrapper handling JSON headers, Bearer tokens, and 401 unauth handling.
 * @param {string} url - API endpoint URL
 * @param {Object} options - Standard fetch options
 * @returns {Promise<any>}
 */
async function apiCall(url, options = {}) {
  setNetworkBusy(true);
  try {
    const headers = {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    // Attach JWT Bearer token if present
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    const config = {
      ...options,
      headers
    };

    const response = await fetch(url, config);

    // 204 No Content
    if (response.status === 204) {
      updateServerStatus(true);
      return null;
    }

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { raw: text } : null;
    }

    // Handle 401 Unauthorized: clear token and return to login view
    if (response.status === 401) {
      const isAuthEndpoint = url.startsWith('/api/auth/login') || url.startsWith('/api/auth/register') || url.startsWith('/api/auth/oauth');
      if (!isAuthEndpoint) {
        handleSessionExpired();
      }
    }

    if (!response.ok) {
      const err = new Error((data && data.error && data.error.message) || `HTTP error ${response.status}`);
      err.status = response.status;
      err.errorData = data && data.error ? data.error : null;
      throw err;
    }

    updateServerStatus(true);
    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      updateServerStatus(false);
      showErrorBanner('Cannot connect to API server. Please ensure the server is running on port 3000.');
    }
    throw error;
  } finally {
    setNetworkBusy(false);
  }
}

function updateServerStatus(isOnline) {
  if (isOnline) {
    elements.statusDot.classList.remove('offline');
    elements.statusDot.classList.add('online');
    elements.statusText.textContent = 'API Connected';
    elements.serverStatusPill.setAttribute('title', 'API is connected and healthy');
  } else {
    elements.statusDot.classList.remove('online');
    elements.statusDot.classList.add('offline');
    elements.statusText.textContent = 'API Disconnected';
    elements.serverStatusPill.setAttribute('title', 'API server unreachable');
  }
}

async function checkServerHealth() {
  try {
    const res = await apiCall('/api/health');
    if (res && res.status === 'ok') {
      updateServerStatus(true);
    }
  } catch (_) {
    updateServerStatus(false);
  }
}

// =========================================================================
// UI Feedback: Toasts, Screen Reader Announcements, & Error Banner
// =========================================================================

function showToast(message, type = 'info') {
  announce(message);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'banner-close-btn';
  closeBtn.setAttribute('aria-label', 'Close toast');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}

function announce(message) {
  elements.liveRegion.textContent = '';
  setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 50);
}

function showErrorBanner(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.classList.remove('hidden');
  announce(`Error alert: ${message}`);
}

function hideErrorBanner() {
  elements.errorBanner.classList.add('hidden');
  elements.errorMessage.textContent = '';
}

// =========================================================================
// Authentication View State & Handlers
// =========================================================================

function showAuthView() {
  elements.authSection.classList.remove('hidden');
  elements.taskManagerSection.classList.add('hidden');
  elements.userAccountBar.classList.add('hidden');
  checkOAuthProviders();
}

function showTaskManagerView(user) {
  elements.authSection.classList.add('hidden');
  elements.taskManagerSection.classList.remove('hidden');
  elements.userAccountBar.classList.remove('hidden');
  elements.userNameText.textContent = user.name;
  loadWeather('Hosur');
}

/**
 * Checks available authentication providers from the API and reveals OAuth options.
 */
async function checkOAuthProviders() {
  try {
    const res = await apiCall('/api/auth/providers');
    if (res && res.github && elements.oauthContainer) {
      elements.oauthContainer.classList.remove('hidden');
    } else if (elements.oauthContainer) {
      elements.oauthContainer.classList.add('hidden');
    }
  } catch (_) {
    if (elements.oauthContainer) {
      elements.oauthContainer.classList.add('hidden');
    }
  }
}

/**
 * Fetches and displays weather forecasts for a city using Open-Meteo integration.
 * Safe rendering: Strictly uses document.createElement and element.textContent (no innerHTML).
 * @param {string} city
 */
async function loadWeather(city = 'Hosur') {
  if (!state.token) return;

  if (elements.weatherLoading) elements.weatherLoading.classList.remove('hidden');
  if (elements.weatherError) elements.weatherError.classList.add('hidden');
  if (elements.weatherContent) elements.weatherContent.classList.add('hidden');

  try {
    const data = await apiCall(`/api/external/weather?city=${encodeURIComponent(city)}`);
    if (!data) throw new Error('No weather data returned from server');

    if (elements.weatherCityText) elements.weatherCityText.textContent = data.city || city;
    if (elements.weatherCountryText) elements.weatherCountryText.textContent = data.country || 'India';
    if (elements.weatherCurrentTemp) {
      elements.weatherCurrentTemp.textContent = data.current && data.current.temperature !== null
        ? `${data.current.temperature}°C`
        : '--°C';
    }
    if (elements.weatherCurrentCondition) {
      elements.weatherCurrentCondition.textContent = data.current?.condition || 'Unknown';
    }
    if (elements.weatherPrecipitation) {
      elements.weatherPrecipitation.textContent = `${data.current?.precipitation ?? 0} mm`;
    }

    if (elements.weatherDailyList) {
      // Clear container safely
      while (elements.weatherDailyList.firstChild) {
        elements.weatherDailyList.removeChild(elements.weatherDailyList.firstChild);
      }

      const dailyForecasts = Array.isArray(data.daily) ? data.daily : [];
      dailyForecasts.forEach((day) => {
        const itemCard = document.createElement('div');
        itemCard.className = 'daily-item-card';

        const dateEl = document.createElement('span');
        dateEl.className = 'daily-item-date';
        dateEl.textContent = day.date || 'Forecast';

        const tempEl = document.createElement('span');
        tempEl.className = 'daily-item-temp';
        const minTemp = day.temperatureMin !== null && day.temperatureMin !== undefined ? `${day.temperatureMin}°` : '--';
        const maxTemp = day.temperatureMax !== null && day.temperatureMax !== undefined ? `${day.temperatureMax}°` : '--';
        tempEl.textContent = `${minTemp} / ${maxTemp}`;

        const conditionEl = document.createElement('span');
        conditionEl.className = 'daily-item-condition';
        conditionEl.textContent = day.condition || 'Variable';

        const rainEl = document.createElement('span');
        rainEl.className = 'daily-item-rain';
        rainEl.textContent = `🌧 ${day.precipitationProbability ?? 0}% rain`;

        itemCard.appendChild(dateEl);
        itemCard.appendChild(tempEl);
        itemCard.appendChild(conditionEl);
        itemCard.appendChild(rainEl);

        elements.weatherDailyList.appendChild(itemCard);
      });
    }

    if (elements.weatherContent) elements.weatherContent.classList.remove('hidden');
  } catch (err) {
    if (elements.weatherError) elements.weatherError.classList.remove('hidden');
    if (elements.weatherErrorMessage) {
      elements.weatherErrorMessage.textContent = err.message || 'Weather service currently unavailable';
    }
  } finally {
    if (elements.weatherLoading) elements.weatherLoading.classList.add('hidden');
  }
}

function switchAuthTab(targetTab) {
  hideErrorBanner();
  clearAuthErrors();

  if (targetTab === 'login') {
    elements.loginTabBtn.classList.add('active');
    elements.loginTabBtn.setAttribute('aria-selected', 'true');
    elements.registerTabBtn.classList.remove('active');
    elements.registerTabBtn.setAttribute('aria-selected', 'false');

    elements.loginPanel.classList.remove('hidden');
    elements.registerPanel.classList.add('hidden');
    elements.loginEmail.focus();
  } else {
    elements.registerTabBtn.classList.add('active');
    elements.registerTabBtn.setAttribute('aria-selected', 'true');
    elements.loginTabBtn.classList.remove('active');
    elements.loginTabBtn.setAttribute('aria-selected', 'false');

    elements.registerPanel.classList.remove('hidden');
    elements.loginPanel.classList.add('hidden');
    elements.registerName.focus();
  }
}

function clearAuthErrors() {
  elements.loginEmailError.textContent = '';
  elements.loginPasswordError.textContent = '';
  elements.loginGeneralError.textContent = '';

  elements.registerNameError.textContent = '';
  elements.registerEmailError.textContent = '';
  elements.registerPasswordError.textContent = '';
  elements.registerGeneralError.textContent = '';
}

function handleSessionExpired() {
  state.token = null;
  state.currentUser = null;
  setStoredToken(null);
  showAuthView();
  showToast('Session expired or unauthorized. Please sign in again.', 'error');
}

/**
 * Handles user login form submission (POST /api/auth/login).
 * @param {Event} e
 */
async function handleLogin(e) {
  e.preventDefault();
  hideErrorBanner();
  clearAuthErrors();

  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;

  let hasClientError = false;
  if (!email) {
    elements.loginEmailError.textContent = 'Email address is required';
    hasClientError = true;
  }
  if (!password) {
    elements.loginPasswordError.textContent = 'Password is required';
    hasClientError = true;
  }
  if (hasClientError) return;

  const spinner = elements.loginSubmitBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');
  elements.loginSubmitBtn.disabled = true;

  try {
    const data = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    state.token = data.token;
    state.currentUser = data.user;
    setStoredToken(data.token);

    showTaskManagerView(data.user);
    showToast(`Welcome back, ${data.user.name}!`, 'success');
    elements.loginForm.reset();

    await loadTasks();
  } catch (error) {
    if (error.status === 401) {
      elements.loginGeneralError.textContent = 'Invalid email or password';
    } else if (error.errorData && error.errorData.details) {
      error.errorData.details.forEach(({ field, message }) => {
        if (field === 'email') elements.loginEmailError.textContent = message;
        if (field === 'password') elements.loginPasswordError.textContent = message;
      });
    } else {
      elements.loginGeneralError.textContent = error.message || 'Login failed';
    }
  } finally {
    spinner.classList.add('hidden');
    elements.loginSubmitBtn.disabled = false;
  }
}

/**
 * Handles user registration form submission (POST /api/auth/register).
 * @param {Event} e
 */
async function handleRegister(e) {
  e.preventDefault();
  hideErrorBanner();
  clearAuthErrors();

  const name = elements.registerName.value.trim();
  const email = elements.registerEmail.value.trim();
  const password = elements.registerPassword.value;

  let hasClientError = false;
  if (!name || name.length < 3) {
    elements.registerNameError.textContent = 'Name must be at least 3 characters';
    hasClientError = true;
  }
  if (!email) {
    elements.registerEmailError.textContent = 'Email address is required';
    hasClientError = true;
  }
  if (!password || password.length < 8) {
    elements.registerPasswordError.textContent = 'Password must be at least 8 characters';
    hasClientError = true;
  } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    elements.registerPasswordError.textContent = 'Password must contain uppercase, lowercase, and numbers';
    hasClientError = true;
  }
  if (hasClientError) return;

  const spinner = elements.registerSubmitBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');
  elements.registerSubmitBtn.disabled = true;

  try {
    await apiCall('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });

    showToast('Registration successful! Please sign in with your credentials.', 'success');
    elements.registerForm.reset();

    // Switch to login tab and prefill registered email
    switchAuthTab('login');
    elements.loginEmail.value = email;
    elements.loginPassword.focus();
  } catch (error) {
    if (error.status === 409) {
      elements.registerEmailError.textContent = 'This email is already registered';
    } else if (error.errorData && error.errorData.details) {
      error.errorData.details.forEach(({ field, message }) => {
        if (field === 'name') elements.registerNameError.textContent = message;
        if (field === 'email') elements.registerEmailError.textContent = message;
        if (field === 'password') elements.registerPasswordError.textContent = message;
      });
    } else {
      elements.registerGeneralError.textContent = error.message || 'Registration failed';
    }
  } finally {
    spinner.classList.add('hidden');
    elements.registerSubmitBtn.disabled = false;
  }
}

function handleLogout() {
  state.token = null;
  state.currentUser = null;
  setStoredToken(null);
  showAuthView();
  showToast('You have been logged out.', 'info');

  // Safely clear task list in DOM
  while (elements.taskList.firstChild) {
    elements.taskList.removeChild(elements.taskList.firstChild);
  }
}

// =========================================================================
// Task Form Validation Helpers
// =========================================================================

function clearFieldErrors(prefix) {
  const errorFields = ['Title', 'Description', 'Priority', 'Status', 'DueDate'];
  errorFields.forEach(field => {
    const el = elements[`${prefix}${field}Error`];
    if (el) {
      el.textContent = '';
    }
  });
}

function displayFieldErrors(prefix, details) {
  clearFieldErrors(prefix);
  if (!Array.isArray(details)) return;

  details.forEach(({ field, message }) => {
    const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
    const targetEl = elements[`${prefix}${capitalized}Error`];
    if (targetEl) {
      targetEl.textContent = message;
    }
  });
}

function validateClientTask(formData) {
  const errors = [];

  const title = (formData.title || '').trim();
  if (!title) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (title.length < 3 || title.length > 100) {
    errors.push({ field: 'title', message: 'Title must be between 3 and 100 characters' });
  }

  const description = (formData.description || '').trim();
  if (description.length > 500) {
    errors.push({ field: 'description', message: 'Description cannot exceed 500 characters' });
  }

  if (formData.dueDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(formData.dueDate)) {
      errors.push({ field: 'dueDate', message: 'Due date must be in YYYY-MM-DD format' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// =========================================================================
// Data Fetching & List Rendering (Protected by User Token)
// =========================================================================

async function loadTasks() {
  if (!state.token) return;

  hideErrorBanner();
  elements.loadingIndicator.classList.remove('hidden');
  elements.taskList.classList.add('hidden');
  elements.emptyState.classList.add('hidden');

  try {
    const params = new URLSearchParams();
    if (state.filters.status) params.append('status', state.filters.status);
    if (state.filters.priority) params.append('priority', state.filters.priority);
    if (state.filters.search) params.append('search', state.filters.search);
    if (state.filters.sort) params.append('sort', state.filters.sort);
    if (state.filters.order) params.append('order', state.filters.order);
    params.append('page', state.meta.page);
    params.append('limit', state.meta.limit);

    const queryUrl = `/api/tasks?${params.toString()}`;
    const response = await apiCall(queryUrl, { method: 'GET' });

    state.tasks = response.data || [];
    state.meta = response.meta || state.meta;

    renderTaskList(state.tasks, state.meta);
  } catch (error) {
    showErrorBanner(error.message || 'Failed to fetch tasks from server');
    elements.taskCountSummary.textContent = 'Error loading tasks';
  } finally {
    elements.loadingIndicator.classList.add('hidden');
  }
}

function renderTaskList(tasks, meta) {
  while (elements.taskList.firstChild) {
    elements.taskList.removeChild(elements.taskList.firstChild);
  }

  if (meta.total === 0) {
    elements.taskCountSummary.textContent = 'No tasks found';
    elements.emptyState.classList.remove('hidden');
    elements.taskList.classList.add('hidden');
    updatePaginationControls(meta);
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.taskList.classList.remove('hidden');

  const startItem = (meta.page - 1) * meta.limit + 1;
  const endItem = Math.min(meta.page * meta.limit, meta.total);
  elements.taskCountSummary.textContent = `Showing ${startItem}–${endItem} of ${meta.total} tasks`;

  tasks.forEach(task => {
    const card = createTaskCardElement(task);
    elements.taskList.appendChild(card);
  });

  updatePaginationControls(meta);
  announce(`Loaded ${tasks.length} tasks for page ${meta.page}`);
}

function createTaskCardElement(task) {
  const item = document.createElement('article');
  item.className = `task-item status-${task.status}`;
  item.setAttribute('role', 'listitem');
  item.setAttribute('data-task-id', task.id);

  // 1. Task Header
  const header = document.createElement('div');
  header.className = 'task-header';

  const titleArea = document.createElement('div');
  titleArea.className = 'task-title-area';

  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title; // Safe textContent prevents XSS
  titleArea.appendChild(title);

  const badges = document.createElement('div');
  badges.className = 'task-badges';

  const priorityBadge = document.createElement('span');
  priorityBadge.className = `badge badge-priority-${task.priority}`;
  priorityBadge.textContent = task.priority;
  badges.appendChild(priorityBadge);

  const statusBadge = document.createElement('span');
  statusBadge.className = `badge badge-status-${task.status}`;
  statusBadge.textContent = formatStatusLabel(task.status);
  badges.appendChild(statusBadge);

  header.appendChild(titleArea);
  header.appendChild(badges);
  item.appendChild(header);

  // 2. Description
  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-description';
    desc.textContent = task.description; // Safe textContent
    item.appendChild(desc);
  }

  // 3. Meta bar
  const metaBar = document.createElement('div');
  metaBar.className = 'task-meta';

  const details = document.createElement('div');
  details.className = 'meta-details';

  if (task.dueDate) {
    const dueSpan = document.createElement('span');
    dueSpan.className = 'due-date';
    if (isOverdue(task.dueDate, task.status)) {
      dueSpan.classList.add('overdue');
      dueSpan.textContent = `📅 Due: ${task.dueDate} (Overdue)`;
    } else {
      dueSpan.textContent = `📅 Due: ${task.dueDate}`;
    }
    details.appendChild(dueSpan);
  }

  const createdSpan = document.createElement('span');
  createdSpan.className = 'created-date';
  createdSpan.textContent = `ID #${task.id.slice(-6)} • ${formatDate(task.createdAt)}`;
  details.appendChild(createdSpan);

  metaBar.appendChild(details);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-outline btn-sm';
  toggleBtn.setAttribute('title', 'Change task status');
  toggleBtn.textContent = getNextStatusActionLabel(task.status);
  toggleBtn.addEventListener('click', () => {
    handleQuickStatusChange(task);
  });
  actions.appendChild(toggleBtn);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-secondary btn-sm';
  editBtn.setAttribute('title', 'Edit task details');
  editBtn.textContent = '✏️ Edit';
  editBtn.addEventListener('click', () => {
    openEditModal(task);
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-outline btn-sm';
  deleteBtn.setAttribute('title', 'Delete task');
  deleteBtn.textContent = '🗑️ Delete';
  deleteBtn.addEventListener('click', () => {
    openDeleteModal(task);
  });
  actions.appendChild(deleteBtn);

  metaBar.appendChild(actions);
  item.appendChild(metaBar);

  return item;
}

function updatePaginationControls(meta) {
  const totalPages = meta.totalPages || 1;
  const currentPage = meta.page || 1;

  elements.pageInfoText.textContent = `Page ${currentPage} of ${totalPages}`;
  elements.prevPageBtn.disabled = currentPage <= 1;
  elements.nextPageBtn.disabled = currentPage >= totalPages;
}

// =========================================================================
// CRUD Event Handlers
// =========================================================================

async function handleCreateTask(e) {
  e.preventDefault();
  hideErrorBanner();
  clearFieldErrors('create');

  const formData = {
    title: elements.createTitle.value,
    description: elements.createDescription.value,
    priority: elements.createPriority.value,
    status: elements.createStatus.value,
    dueDate: elements.createDueDate.value || null
  };

  const validation = validateClientTask(formData);
  if (!validation.isValid) {
    displayFieldErrors('create', validation.errors);
    return;
  }

  const spinner = elements.submitCreateBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');

  try {
    const newTask = await apiCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(formData)
    });

    showToast(`Task "${newTask.title}" created successfully!`, 'success');
    elements.createTaskForm.reset();
    clearFieldErrors('create');

    await loadTasks();
  } catch (error) {
    if (error.errorData && error.errorData.details) {
      displayFieldErrors('create', error.errorData.details);
    } else {
      showErrorBanner(error.message || 'Failed to create task');
    }
  } finally {
    spinner.classList.add('hidden');
  }
}

async function handleQuickStatusChange(task) {
  hideErrorBanner();
  const nextStatusMap = {
    'todo': 'in-progress',
    'in-progress': 'done',
    'done': 'todo'
  };

  const nextStatus = nextStatusMap[task.status] || 'todo';

  try {
    const updated = await apiCall(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });

    showToast(`Status updated to "${formatStatusLabel(updated.status)}"`, 'success');
    await loadTasks();
  } catch (error) {
    showErrorBanner(error.message || 'Failed to update task status');
  }
}

function openEditModal(task) {
  clearFieldErrors('edit');
  elements.editTaskId.value = task.id;
  elements.editTitle.value = task.title;
  elements.editDescription.value = task.description || '';
  elements.editPriority.value = task.priority;
  elements.editStatus.value = task.status;
  elements.editDueDate.value = task.dueDate || '';

  elements.editModalOverlay.classList.remove('hidden');
  elements.editTitle.focus();
}

function closeEditModal() {
  elements.editModalOverlay.classList.add('hidden');
  clearFieldErrors('edit');
}

async function handleSaveEdit(e) {
  e.preventDefault();
  hideErrorBanner();
  clearFieldErrors('edit');

  const taskId = elements.editTaskId.value;
  const formData = {
    title: elements.editTitle.value,
    description: elements.editDescription.value,
    priority: elements.editPriority.value,
    status: elements.editStatus.value,
    dueDate: elements.editDueDate.value || null
  };

  const validation = validateClientTask(formData);
  if (!validation.isValid) {
    displayFieldErrors('edit', validation.errors);
    return;
  }

  const spinner = elements.saveEditBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');

  try {
    await apiCall(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(formData)
    });

    showToast(`Task updated successfully!`, 'success');
    closeEditModal();
    await loadTasks();
  } catch (error) {
    if (error.errorData && error.errorData.details) {
      displayFieldErrors('edit', error.errorData.details);
    } else {
      showErrorBanner(error.message || 'Failed to update task');
    }
  } finally {
    spinner.classList.add('hidden');
  }
}

function openDeleteModal(task) {
  state.deleteTargetTask = task;
  elements.deleteTargetTitle.textContent = `"${task.title}" (ID #${task.id.slice(-6)})`;
  elements.deleteModalOverlay.classList.remove('hidden');
  elements.confirmDeleteBtn.focus();
}

function closeDeleteModal() {
  state.deleteTargetTask = null;
  elements.deleteModalOverlay.classList.add('hidden');
}

async function handleConfirmDelete() {
  if (!state.deleteTargetTask) return;
  const taskId = state.deleteTargetTask.id;
  const title = state.deleteTargetTask.title;

  const spinner = elements.confirmDeleteBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');

  try {
    await apiCall(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });

    showToast(`Task "${title}" was deleted`, 'info');
    closeDeleteModal();

    if (state.tasks.length === 1 && state.meta.page > 1) {
      state.meta.page--;
    }

    await loadTasks();
  } catch (error) {
    showErrorBanner(error.message || 'Failed to delete task');
  } finally {
    spinner.classList.add('hidden');
  }
}

// =========================================================================
// Formatting & Utility Functions
// =========================================================================

function formatStatusLabel(status) {
  switch (status) {
    case 'in-progress': return 'In Progress';
    case 'done': return 'Done';
    case 'todo':
    default: return 'To Do';
  }
}

function getNextStatusActionLabel(currentStatus) {
  switch (currentStatus) {
    case 'todo': return '▶ Start';
    case 'in-progress': return '✓ Complete';
    case 'done': return '↺ Reopen';
    default: return 'Update';
  }
}

function isOverdue(dueDateStr, status) {
  if (!dueDateStr || status === 'done') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDateStr < today;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function debounce(func, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// =========================================================================
// Event Listeners Setup
// =========================================================================
function setupEventListeners() {
  // Auth tabs & forms
  elements.loginTabBtn.addEventListener('click', () => switchAuthTab('login'));
  elements.registerTabBtn.addEventListener('click', () => switchAuthTab('register'));
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  elements.logoutBtn.addEventListener('click', handleLogout);

  // Create task form
  elements.createTaskForm.addEventListener('submit', handleCreateTask);
  elements.createTaskForm.addEventListener('reset', () => {
    clearFieldErrors('create');
  });

  // Edit task form
  elements.editTaskForm.addEventListener('submit', handleSaveEdit);
  elements.closeEditModalBtn.addEventListener('click', closeEditModal);
  elements.cancelEditBtn.addEventListener('click', closeEditModal);

  // Delete modal
  elements.closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
  elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  elements.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);

  // Close modals on overlay backdrop click
  elements.editModalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.editModalOverlay) closeEditModal();
  });
  elements.deleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.deleteModalOverlay) closeDeleteModal();
  });

  // Keyboard accessibility: ESC closes open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!elements.editModalOverlay.classList.contains('hidden')) closeEditModal();
      if (!elements.deleteModalOverlay.classList.contains('hidden')) closeDeleteModal();
    }
  });

  // Debounced search input
  const onSearchInput = debounce((e) => {
    state.filters.search = e.target.value.trim();
    state.meta.page = 1;
    loadTasks();
  }, 350);
  elements.searchInput.addEventListener('input', onSearchInput);

  // Filter dropdowns
  elements.statusFilter.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    state.meta.page = 1;
    loadTasks();
  });

  elements.priorityFilter.addEventListener('change', (e) => {
    state.filters.priority = e.target.value;
    state.meta.page = 1;
    loadTasks();
  });

  // Sort dropdown & toggle
  elements.sortField.addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    loadTasks();
  });

  elements.sortOrderBtn.addEventListener('click', () => {
    state.filters.order = state.filters.order === 'asc' ? 'desc' : 'asc';
    const isDesc = state.filters.order === 'desc';
    elements.sortOrderLabel.textContent = isDesc ? 'Desc ▼' : 'Asc ▲';
    elements.sortOrderBtn.setAttribute('aria-label', `Sort direction: ${isDesc ? 'descending' : 'ascending'}`);
    loadTasks();
  });

  // Refresh button
  elements.refreshBtn.addEventListener('click', () => {
    loadTasks();
    checkServerHealth();
    showToast('Task list refreshed from server', 'info');
  });

  // Clear filters button
  elements.clearFiltersBtn.addEventListener('click', () => {
    state.filters.search = '';
    state.filters.status = '';
    state.filters.priority = '';
    elements.searchInput.value = '';
    elements.statusFilter.value = '';
    elements.priorityFilter.value = '';
    state.meta.page = 1;
    loadTasks();
  });

  // Pagination controls
  elements.limitSelect.addEventListener('change', (e) => {
    state.meta.limit = parseInt(e.target.value, 10) || 10;
    state.meta.page = 1;
    loadTasks();
  });

  elements.prevPageBtn.addEventListener('click', () => {
    if (state.meta.page > 1) {
      state.meta.page--;
      loadTasks();
    }
  });

  elements.nextPageBtn.addEventListener('click', () => {
    if (state.meta.page < state.meta.totalPages) {
      state.meta.page++;
      loadTasks();
    }
  });

  // Dismiss error banner button
  elements.dismissErrorBtn.addEventListener('click', hideErrorBanner);

  // Weather search form
  if (elements.weatherSearchForm) {
    elements.weatherSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const city = elements.weatherCityInput.value.trim();
      if (city) {
        loadWeather(city);
      }
    });
  }
}

// =========================================================================
// Application Initialization
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  checkServerHealth();

  // Check for OAuth callback parameters in URL
  const urlParams = new URLSearchParams(window.location.search);
  const oauthCode = urlParams.get('oauth_code');
  const oauthError = urlParams.get('oauth_error');

  if (oauthCode || oauthError) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (oauthError) {
    const errorMap = {
      missing_params: 'OAuth authorization was cancelled or incomplete.',
      state_missing: 'Security state missing. Please try signing in again.',
      state_mismatch: 'Security state mismatch. Please try signing in again.',
      token_exchange_failed: 'Failed to authenticate with GitHub. Please try again.',
      unverified_email: 'Your GitHub account does not have a verified primary email address.',
      account_exists: 'An account with this email address already exists. Please log in with your email and password.',
      user_fetch_failed: 'Failed to retrieve GitHub profile details.'
    };
    showErrorBanner(errorMap[oauthError] || 'GitHub authentication failed. Please try again.');
  }

  if (oauthCode) {
    try {
      const data = await apiCall('/api/auth/oauth/exchange', {
        method: 'POST',
        body: JSON.stringify({ code: oauthCode })
      });
      if (data && data.token && data.user) {
        state.token = data.token;
        state.currentUser = data.user;
        setStoredToken(data.token);
        showTaskManagerView(data.user);
        await loadTasks();
        showToast(`Welcome, ${data.user.name || 'Student'}! (GitHub)`, 'success');
        return;
      }
    } catch (err) {
      showErrorBanner(err.message || 'Failed to complete GitHub sign-in.');
    }
  }

  // Check for existing valid session
  const storedToken = getStoredToken();
  if (storedToken) {
    state.token = storedToken;
    try {
      const data = await apiCall('/api/auth/me');
      if (data && data.user) {
        state.currentUser = data.user;
        showTaskManagerView(data.user);
        await loadTasks();
        return;
      }
    } catch (_) {
      // Token invalid or expired: clear and revert to auth view
      state.token = null;
      setStoredToken(null);
    }
  }

  // Default to Auth view
  showAuthView();
});
