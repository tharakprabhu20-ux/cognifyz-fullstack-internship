/**
 * public/js/app.js
 * Front-end logic for Student Task Manager.
 * Communicates exclusively with the /api/tasks REST API using fetch().
 *
 * Security Guarantee:
 * All user inputs and API responses are safely rendered using document.createElement()
 * and element.textContent. innerHTML is NEVER used to render dynamic data, preventing XSS.
 */

// =========================================================================
// Global Application State
// =========================================================================
const state = {
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
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn')
};

// =========================================================================
// API Communication Layer (fetch wrapper)
// =========================================================================

/**
 * Tracks in-flight network requests to toggle loading spinners and disable buttons.
 * @param {boolean} isInFlight
 */
function setNetworkBusy(isInFlight) {
  if (isInFlight) {
    state.inFlightRequests++;
  } else {
    state.inFlightRequests = Math.max(0, state.inFlightRequests - 1);
  }

  const isBusy = state.inFlightRequests > 0;
  elements.submitCreateBtn.disabled = isBusy;
  elements.saveEditBtn.disabled = isBusy;
  elements.confirmDeleteBtn.disabled = isBusy;
  elements.refreshBtn.disabled = isBusy;
}

/**
 * Robust fetch wrapper handling JSON headers, parsing, and structured error responses.
 * @param {string} url - API endpoint URL
 * @param {Object} options - Standard fetch options (method, headers, body)
 * @returns {Promise<any>}
 */
async function apiCall(url, options = {}) {
  setNetworkBusy(true);
  try {
    const config = {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };

    const response = await fetch(url, config);

    // 204 No Content has no body
    if (response.status === 204) {
      updateServerStatus(true);
      return null;
    }

    // Attempt to parse JSON response body
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { raw: text } : null;
    }

    if (!response.ok) {
      // Standardized server error response { error: { code, message, details } }
      const err = new Error((data && data.error && data.error.message) || `HTTP error ${response.status}`);
      err.status = response.status;
      err.errorData = data && data.error ? data.error : null;
      throw err;
    }

    updateServerStatus(true);
    return data;
  } catch (error) {
    // Check if network failed or server is down
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      updateServerStatus(false);
      showErrorBanner('Cannot connect to API server. Please ensure the server is running on port 3000.');
    }
    throw error;
  } finally {
    setNetworkBusy(false);
  }
}

/**
 * Updates the top right server connection status indicator.
 * @param {boolean} isOnline
 */
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

/**
 * Performs a health check ping against /api/health.
 */
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
// UI Feedback: Toasts, Announcements, & Error Banner
// =========================================================================

/**
 * Displays a toast notification and announces to the accessibility live region.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
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

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}

/**
 * Updates the aria-live screen reader region.
 * @param {string} message
 */
function announce(message) {
  elements.liveRegion.textContent = '';
  // Small timeout ensures screen readers register the text change
  setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 50);
}

/**
 * Shows the persistent top error banner.
 * @param {string} message
 */
function showErrorBanner(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.classList.remove('hidden');
  announce(`Error alert: ${message}`);
}

/**
 * Hides the persistent error banner.
 */
function hideErrorBanner() {
  elements.errorBanner.classList.add('hidden');
  elements.errorMessage.textContent = '';
}

// =========================================================================
// Validation Helpers
// =========================================================================

/**
 * Clears all error messages under form fields.
 * @param {string} prefix - 'create' or 'edit'
 */
function clearFieldErrors(prefix) {
  const errorFields = ['Title', 'Description', 'Priority', 'Status', 'DueDate'];
  errorFields.forEach(field => {
    const el = elements[`${prefix}${field}Error`];
    if (el) {
      el.textContent = '';
    }
  });
}

/**
 * Sets validation error messages returned by client or server.
 * @param {string} prefix - 'create' or 'edit'
 * @param {Array<{ field: string, message: string }>} details
 */
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

/**
 * Client-side validation prior to sending API requests.
 * @param {Object} formData
 * @returns {{ isValid: boolean, errors: Array<{ field: string, message: string }> }}
 */
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
// Data Fetching & List Rendering
// =========================================================================

/**
 * Loads tasks from GET /api/tasks using current search, filter, and pagination parameters.
 */
async function loadTasks() {
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

/**
 * Renders the task list DOM strictly using document.createElement() and textContent.
 * @param {Array} tasks
 * @param {Object} meta
 */
function renderTaskList(tasks, meta) {
  // Clear previous list entries safely
  while (elements.taskList.firstChild) {
    elements.taskList.removeChild(elements.taskList.firstChild);
  }

  // Update summary header
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

  // Render each task card
  tasks.forEach(task => {
    const card = createTaskCardElement(task);
    elements.taskList.appendChild(card);
  });

  updatePaginationControls(meta);
  announce(`Loaded ${tasks.length} tasks for page ${meta.page}`);
}

/**
 * Creates a single task card element using safe DOM methods.
 * @param {Object} task
 * @returns {HTMLElement}
 */
function createTaskCardElement(task) {
  const item = document.createElement('article');
  item.className = `task-item status-${task.status}`;
  item.setAttribute('role', 'listitem');
  item.setAttribute('data-task-id', task.id);

  // 1. Task Header (Title + Badges)
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

  // Priority badge
  const priorityBadge = document.createElement('span');
  priorityBadge.className = `badge badge-priority-${task.priority}`;
  priorityBadge.textContent = task.priority;
  badges.appendChild(priorityBadge);

  // Status badge
  const statusBadge = document.createElement('span');
  statusBadge.className = `badge badge-status-${task.status}`;
  statusBadge.textContent = formatStatusLabel(task.status);
  badges.appendChild(statusBadge);

  header.appendChild(titleArea);
  header.appendChild(badges);
  item.appendChild(header);

  // 2. Task Description (if provided)
  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-description';
    desc.textContent = task.description; // Safe textContent
    item.appendChild(desc);
  }

  // 3. Task Meta & Actions Footer
  const metaBar = document.createElement('div');
  metaBar.className = 'task-meta';

  const details = document.createElement('div');
  details.className = 'meta-details';

  // Due date indicator
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

  // Created timestamp
  const createdSpan = document.createElement('span');
  createdSpan.className = 'created-date';
  createdSpan.textContent = `ID #${task.id} • ${formatDate(task.createdAt)}`;
  details.appendChild(createdSpan);

  metaBar.appendChild(details);

  // Actions Toolbar
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  // Quick Status Toggle Button
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-outline btn-sm';
  toggleBtn.setAttribute('title', 'Change task status');
  toggleBtn.textContent = getNextStatusActionLabel(task.status);
  toggleBtn.addEventListener('click', () => {
    handleQuickStatusChange(task);
  });
  actions.appendChild(toggleBtn);

  // Edit Button
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-secondary btn-sm';
  editBtn.setAttribute('title', 'Edit task details');
  editBtn.textContent = '✏️ Edit';
  editBtn.addEventListener('click', () => {
    openEditModal(task);
  });
  actions.appendChild(editBtn);

  // Delete Button
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

/**
 * Updates the pagination buttons and page info text.
 * @param {Object} meta
 */
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

/**
 * Handles submission of the Add Task form (POST /api/tasks).
 * @param {Event} e
 */
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

  // 1. Client-side validation check
  const validation = validateClientTask(formData);
  if (!validation.isValid) {
    displayFieldErrors('create', validation.errors);
    return;
  }

  // Toggle button spinner
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

    // Reload list to reflect newly created task
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

/**
 * Cycles task status to the next sequential status (PATCH /api/tasks/:id).
 * Sequence: todo -> in-progress -> done -> todo
 * @param {Object} task
 */
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

/**
 * Opens the Edit Modal and populates it with existing task data.
 * @param {Object} task
 */
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

/**
 * Closes the Edit Modal.
 */
function closeEditModal() {
  elements.editModalOverlay.classList.add('hidden');
  clearFieldErrors('edit');
}

/**
 * Handles saving changes from the Edit Modal via PUT /api/tasks/:id.
 * @param {Event} e
 */
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

  // Client-side validation
  const validation = validateClientTask(formData);
  if (!validation.isValid) {
    displayFieldErrors('edit', validation.errors);
    return;
  }

  const spinner = elements.saveEditBtn.querySelector('.btn-spinner');
  spinner.classList.remove('hidden');

  try {
    const updatedTask = await apiCall(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(formData)
    });

    showToast(`Task #${updatedTask.id} updated successfully!`, 'success');
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

/**
 * Opens the Delete Confirmation Modal.
 * @param {Object} task
 */
function openDeleteModal(task) {
  state.deleteTargetTask = task;
  elements.deleteTargetTitle.textContent = `"${task.title}" (ID #${task.id})`;
  elements.deleteModalOverlay.classList.remove('hidden');
  elements.confirmDeleteBtn.focus();
}

/**
 * Closes the Delete Confirmation Modal.
 */
function closeDeleteModal() {
  state.deleteTargetTask = null;
  elements.deleteModalOverlay.classList.add('hidden');
}

/**
 * Handles confirmation of task deletion (DELETE /api/tasks/:id).
 */
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

    // If we just deleted the last item on a page higher than 1, step back a page
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

/**
 * Formats a status slug into a user-friendly title.
 * @param {string} status
 * @returns {string}
 */
function formatStatusLabel(status) {
  switch (status) {
    case 'in-progress': return 'In Progress';
    case 'done': return 'Done';
    case 'todo':
    default: return 'To Do';
  }
}

/**
 * Returns the button action label for the quick status cycler.
 * @param {string} currentStatus
 * @returns {string}
 */
function getNextStatusActionLabel(currentStatus) {
  switch (currentStatus) {
    case 'todo': return '▶ Start';
    case 'in-progress': return '✓ Complete';
    case 'done': return '↺ Reopen';
    default: return 'Update';
  }
}

/**
 * Checks if a task with a due date is overdue.
 * @param {string} dueDateStr - YYYY-MM-DD
 * @param {string} status
 * @returns {boolean}
 */
function isOverdue(dueDateStr, status) {
  if (!dueDateStr || status === 'done') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDateStr < today;
}

/**
 * Formats an ISO date string into readable local format.
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Debounce helper for search box input.
 * @param {Function} func
 * @param {number} delay
 * @returns {Function}
 */
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

  // Status filter dropdown
  elements.statusFilter.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    state.meta.page = 1;
    loadTasks();
  });

  // Priority filter dropdown
  elements.priorityFilter.addEventListener('change', (e) => {
    state.filters.priority = e.target.value;
    state.meta.page = 1;
    loadTasks();
  });

  // Sort field dropdown
  elements.sortField.addEventListener('change', (e) => {
    state.filters.sort = e.target.value;
    loadTasks();
  });

  // Sort direction toggle button
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

  // Clear filters button in empty state
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

  // Pagination limit selector
  elements.limitSelect.addEventListener('change', (e) => {
    state.meta.limit = parseInt(e.target.value, 10) || 10;
    state.meta.page = 1;
    loadTasks();
  });

  // Pagination Previous / Next buttons
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
}

// =========================================================================
// Application Initialization
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkServerHealth();
  loadTasks();
});
