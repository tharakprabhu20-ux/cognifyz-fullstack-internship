/**
 * ==============================================================================
 * STUDENT REGISTRATION DESK - MAIN JAVASCRIPT
 * Beginner-friendly, well-commented interactive logic.
 *
 * Core Features:
 * 1. Dark Mode Toggle with localStorage persistence (safe try/catch)
 * 2. IntersectionObserver for scroll-triggered section fade/slide animations
 * 3. Animated Number Counter for Milestone Statistics
 * 4. Client-side Contact / Enquiry Form Validation & Feedback
 * ==============================================================================
 */

// Run our initialization once the DOM is fully loaded and ready
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initScrollAnimations();
  initStatsCounter();
  initContactForm();
});

/**
 * ------------------------------------------------------------------------------
 * 1. THEME TOGGLE (Light / Dark Mode)
 * Switches [data-theme="light"] and [data-theme="dark"] on <html>.
 * Uses try/catch around localStorage so it never crashes in restricted sandboxes
 * or incognito modes where storage might be disabled.
 * ------------------------------------------------------------------------------
 */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById("themeToggle");
  const htmlRoot = document.documentElement;
  const STORAGE_KEY = "studentRegDesk_theme";

  // Helper function to safely read from localStorage
  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn("Storage access not available:", err);
      return null;
    }
  }

  // Helper function to safely write to localStorage
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      console.warn("Unable to save theme to storage:", err);
    }
  }

  // Apply theme to DOM and update button accessibility label
  function applyTheme(theme) {
    htmlRoot.setAttribute("data-theme", theme);
    if (themeToggleBtn) {
      const isDark = theme === "dark";
      themeToggleBtn.setAttribute(
        "aria-label",
        isDark ? "Switch to light theme" : "Switch to dark theme"
      );
      themeToggleBtn.setAttribute(
        "title",
        isDark ? "Switch to light theme" : "Switch to dark theme"
      );
    }
  }

  // Determine initial theme:
  // 1. Saved user preference
  // 2. System OS dark mode preference
  // 3. Fallback default: 'light'
  const savedTheme = getSavedTheme();
  if (savedTheme === "dark" || savedTheme === "light") {
    applyTheme(savedTheme);
  } else if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }

  // Listen for clicks on the toggle button
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = htmlRoot.getAttribute("data-theme") || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });
  }
}

/**
 * ------------------------------------------------------------------------------
 * 2. INTERSECTION OBSERVER FOR SCROLL ANIMATIONS
 * Detects when a .fade-in-section enters the visible viewport and adds
 * the .is-visible class so CSS transitions animate it smoothly.
 * ------------------------------------------------------------------------------
 */
function initScrollAnimations() {
  const animatedSections = document.querySelectorAll(".fade-in-section");

  // Fallback if IntersectionObserver is not supported by the browser
  if (!("IntersectionObserver" in window)) {
    animatedSections.forEach((section) => {
      section.classList.add("is-visible");
    });
    return;
  }

  const observerOptions = {
    root: null, // viewport
    rootMargin: "0px",
    threshold: 0.15, // Trigger when 15% of the section is visible
  };

  const sectionObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        // Once revealed, unobserve so it doesn't repeatedly animate
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  animatedSections.forEach((section) => {
    sectionObserver.observe(section);
  });
}

/**
 * ------------------------------------------------------------------------------
 * 3. STATS NUMBER COUNTER ANIMATION
 * Smoothly counts from 0 up to each stat's target number (e.g. 1200+, 25+, 95%)
 * triggers once when the stats strip enters viewport.
 * ------------------------------------------------------------------------------
 */
function initStatsCounter() {
  const statsSection = document.getElementById("stats");
  const statNumbers = document.querySelectorAll(".stat-number");
  let hasCounted = false;

  if (!statsSection || statNumbers.length === 0) return;

  // Function to animate a single counter element
  function countUp(el) {
    const target = parseInt(el.getAttribute("data-target"), 10) || 0;
    const suffix = el.getAttribute("data-suffix") || "";
    const durationMs = 1800; // Total animation time
    const frameRateMs = 1000 / 60; // 60 FPS
    const totalFrames = Math.round(durationMs / frameRateMs);
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      // Easing function (easeOutQuad) for natural decelerating motion
      const progress = frame / totalFrames;
      const easedProgress = progress * (2 - progress);
      const currentVal = Math.round(target * easedProgress);

      el.textContent = currentVal.toLocaleString() + suffix;

      if (frame >= totalFrames) {
        clearInterval(timer);
        el.textContent = target.toLocaleString() + suffix;
      }
    }, frameRateMs);
  }

  // Trigger counters when scrolled into view
  if ("IntersectionObserver" in window) {
    const statsObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasCounted) {
            hasCounted = true;
            statNumbers.forEach((numEl) => countUp(numEl));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 }
    );

    statsObserver.observe(statsSection);
  } else {
    // Immediate fallback
    statNumbers.forEach((numEl) => countUp(numEl));
  }
}

/**
 * ------------------------------------------------------------------------------
 * 4. CONTACT / ENQUIRY FORM HANDLER
 * Intercepts form submission, performs HTML5 constraint validation,
 * displays a friendly in-page "Thanks" confirmation alert, and clears inputs.
 * No data is submitted anywhere over the network.
 * ------------------------------------------------------------------------------
 */
function initContactForm() {
  const form = document.getElementById("contactForm");
  const successBox = document.getElementById("formSuccessMessage");
  const successName = document.getElementById("successUserName");

  if (!form || !successBox) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault(); // Stop default HTTP page reload

    // Check if form fields pass required / type constraints
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Extract submitted values safely
    const nameInput = document.getElementById("contactName");
    const enteredName = nameInput ? nameInput.value.trim() : "Student";

    // Update personalized thank-you message
    if (successName) {
      successName.textContent = enteredName || "Student";
    }

    // Unhide the success alert
    successBox.classList.remove("d-none");
    successBox.focus();

    // Reset the form inputs
    form.reset();

    // Scroll smoothly so the user sees the confirmation
    successBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

