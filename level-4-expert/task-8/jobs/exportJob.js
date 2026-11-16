/**
 * jobs/exportJob.js
 * Task export job worker.
 * Reads user tasks paginated from taskStore to avoid memory spikes,
 * safely formats as JSON or CSV, and applies spreadsheet formula injection guards.
 */

'use strict';

/**
 * Sanitizes and formats a single cell for RFC-4180 compliant CSV,
 * with protection against CSV/spreadsheet formula injection.
 * Any cell beginning with '=', '+', '-', '@', or '\t' is prefixed with a single quote.
 *
 * @param {any} value
 * @returns {string} Safe CSV cell string
 */
function formatCsvCell(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  let str = String(value);

  // Security: Guard against Spreadsheet Formula Injection (CSV Injection)
  // Attackers can craft malicious cells like "=CMD|' /C calc'!A0"
  if (/^[=+\-@\t]/.test(str)) {
    str = "'" + str;
  }

  // Escape internal double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Converts a list of task objects into a safe CSV document.
 * @param {Array<Object>} tasks
 * @returns {string} CSV text
 */
function tasksToCsv(tasks) {
  const headers = ['id', 'title', 'description', 'status', 'priority', 'dueDate', 'createdAt', 'updatedAt'];
  const headerLine = headers.join(',');

  const rows = tasks.map(task => [
    formatCsvCell(task.id),
    formatCsvCell(task.title),
    formatCsvCell(task.description),
    formatCsvCell(task.status),
    formatCsvCell(task.priority),
    formatCsvCell(task.dueDate),
    formatCsvCell(task.createdAt),
    formatCsvCell(task.updatedAt)
  ].join(','));

  return [headerLine, ...rows].join('\r\n');
}

/**
 * Creates the export job handler for registration with JobQueue.
 * @param {Object} taskStore - Injected task store
 * @returns {Function} job handler: async (job, { updateProgress }) => result
 */
function createExportJobHandler(taskStore) {
  return async function handleExportJob(job, { updateProgress }) {
    const { userId } = job;
    const format = (job.data && job.data.format ? String(job.data.format).toLowerCase() : 'json');

    if (!['csv', 'json'].includes(format)) {
      throw new Error(`Unsupported export format: ${format}. Supported formats are 'csv' or 'json'.`);
    }

    const allTasks = [];
    const pageSize = 50;
    let page = 1;
    let totalPages = 1;

    // Fetch page by page until all user tasks are collected
    do {
      const result = await taskStore.getAll({
        ownerId: userId,
        page,
        limit: pageSize,
        sort: 'createdAt',
        order: 'asc'
      });

      const tasks = result.data || [];
      allTasks.push(...tasks);

      totalPages = (result.meta && result.meta.totalPages) ? result.meta.totalPages : 1;
      const progressPercent = totalPages > 0 ? Math.min(99, Math.round((page / totalPages) * 100)) : 100;
      updateProgress(progressPercent);

      page++;
    } while (page <= totalPages);

    let content = '';
    let contentType = '';
    let filename = '';

    if (format === 'csv') {
      content = tasksToCsv(allTasks);
      contentType = 'text/csv; charset=utf-8';
      filename = `tasks-export-${job.id}.csv`;
    } else {
      content = JSON.stringify(allTasks, null, 2);
      contentType = 'application/json; charset=utf-8';
      filename = `tasks-export-${job.id}.json`;
    }

    updateProgress(100);

    return {
      format,
      count: allTasks.length,
      contentType,
      filename,
      content
    };
  };
}

module.exports = {
  createExportJobHandler,
  formatCsvCell,
  tasksToCsv
};
