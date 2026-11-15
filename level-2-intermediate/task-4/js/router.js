/**
 * router.js - Client-Side Hash Router for the Student Portal
 * Cognifyz Full Stack Development Internship - Level 2, Task 4
 * Step 3: Client-side routing
 *
 * Provides:
 * 1. Pure `matchRoute(hash)` function testable in Node.js.
 * 2. Hash-based SPA routing without page reloads.
 * 3. Browser Back / Forward history support.
 * 4. Active nav link indicator (aria-current="page").
 * 5. Document title updates and focus management (accessibility).
 * 6. Unsaved changes guard when navigating away from the registration form.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment for unit testing
    module.exports = factory();
  } else {
    // Browser global environment
    root.AppRouter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // List of registered routes supported by the Student Portal
  var KNOWN_ROUTES = ['home', 'register', 'students', 'about'];
  var DEFAULT_ROUTE = 'home';

  /**
   * Pure function: Matches a raw URL hash string to a route name.
   * Strips '#', '/', queries, and trailing slashes.
   * Defaults to 'home' when hash is empty or root '#/'.
   * Returns 'not-found' for unrecognized paths.
   *
   * @param {string} hash
   * @returns {string} One of 'home', 'register', 'students', 'about', or 'not-found'.
   */
  function matchRoute(hash) {
    if (typeof hash !== 'string') {
      return DEFAULT_ROUTE;
    }

    // Remove hash symbol and leading/trailing whitespace
    var clean = hash.trim().replace(/^#+/, '');

    // Strip search query params if present in hash
    var queryIdx = clean.indexOf('?');
    if (queryIdx !== -1) {
      clean = clean.substring(0, queryIdx);
    }

    // Strip leading and trailing slashes
    clean = clean.replace(/^\/+|\/+$/g, '');

    // Empty or root hash resolves to the default home route
    if (clean === '' || clean === 'home') {
      return 'home';
    }

    for (var i = 0; i < KNOWN_ROUTES.length; i++) {
      if (clean === KNOWN_ROUTES[i]) {
        return KNOWN_ROUTES[i];
      }
    }

    return 'not-found';
  }

  /**
   * Router Constructor / Factory for the browser.
   *
   * @param {Object} config
   * @param {HTMLElement} config.container - Target container element (#app)
   * @param {Object.<string, Function>} config.views - Map of route names to view rendering functions
   * @param {Object.<string, string>} config.titles - Map of route names to document titles
   * @param {Function} [config.hasUnsavedChanges] - Returns true if current view has unsaved data
   * @returns {Object} Router instance with init() and navigate() methods
   */
  function createRouter(config) {
    var container = config.container;
    var views = config.views || {};
    var titles = config.titles || {};
    var hasUnsavedChanges = config.hasUnsavedChanges || function () { return false; };

    var currentRoute = null;
    var isReverting = false;

    /**
     * Updates active navigation state.
     * Sets aria-current="page" and CSS class 'active' on matching links.
     */
    function updateNavLinks(activeRoute) {
      var navLinks = document.querySelectorAll('nav a[href^="#/"], nav a[href="#"]');
      for (var i = 0; i < navLinks.length; i++) {
        var link = navLinks[i];
        var href = link.getAttribute('href') || '';
        var linkRoute = matchRoute(href);

        if (linkRoute === activeRoute) {
          link.setAttribute('aria-current', 'page');
          link.classList.add('active');
        } else {
          link.removeAttribute('aria-current');
          link.classList.remove('active');
        }
      }
    }

    /**
     * Handles route transitions.
     */
    function handleRoute() {
      if (isReverting) {
        isReverting = false;
        return;
      }

      var targetRoute = matchRoute(window.location.hash);

      // Unsaved changes guard: If leaving 'register' with dirty form input
      if (currentRoute === 'register' && targetRoute !== 'register') {
        if (hasUnsavedChanges()) {
          var confirmed = window.confirm(
            'You have unsaved changes in the registration form. Are you sure you want to leave?'
          );
          if (!confirmed) {
            // Revert hash back to #/register without triggering a re-confirm
            isReverting = true;
            window.location.hash = '#/register';
            return;
          }
        }
      }

      currentRoute = targetRoute;

      // 1. Swap content inside container (#app)
      if (views[targetRoute]) {
        views[targetRoute](container);
      } else if (views['not-found']) {
        views['not-found'](container);
      }

      // 2. Update document title
      var title = titles[targetRoute] || titles['default'] || 'Student Portal - Cognifyz Internship';
      document.title = title;

      // 3. Highlight active nav link
      updateNavLinks(targetRoute);

      // 4. Scroll to top of viewport
      window.scrollTo(0, 0);

      // 5. Shift focus to page heading for screen-reader & keyboard accessibility
      if (container) {
        var heading = container.querySelector('h1, h2');
        if (heading) {
          if (!heading.hasAttribute('tabindex')) {
            heading.setAttribute('tabindex', '-1');
          }
          heading.focus();
        }
      }
    }

    /**
     * Programmatic navigation helper.
     * @param {string} routeName
     */
    function navigate(routeName) {
      window.location.hash = '#/' + routeName;
    }

    /**
     * Initializes the router and attaches browser event listeners.
     */
    function init() {
      // Listen to hash changes for SPA navigation and Back/Forward buttons
      window.addEventListener('hashchange', handleRoute);

      // Listen to beforeunload for accidental tab close with unsaved data
      window.addEventListener('beforeunload', function (e) {
        if (currentRoute === 'register' && hasUnsavedChanges()) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      });

      // If no initial hash is present, set default route to #/home
      if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        window.location.hash = '#/home';
      } else {
        handleRoute();
      }
    }

    return {
      init: init,
      navigate: navigate,
      getCurrentRoute: function () {
        return currentRoute;
      }
    };
  }

  return {
    KNOWN_ROUTES: KNOWN_ROUTES,
    DEFAULT_ROUTE: DEFAULT_ROUTE,
    matchRoute: matchRoute,
    createRouter: createRouter
  };
});
