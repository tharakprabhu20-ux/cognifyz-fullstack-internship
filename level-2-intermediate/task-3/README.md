# Task 3: Advanced CSS Styling and Responsive Design
### Cognifyz Full Stack Development Internship — Level 2 (Intermediate)

A modern, responsive landing page for the **"Student Registration Desk"**, an academic course-enquiry and college admissions assistance service.

---

## 📁 Project Structure

```text
task-3/
├── index.html        # Semantic HTML5 multi-section markup with Bootstrap 5.3 components
├── css/
│   └── style.css     # Advanced custom CSS styling, themes, keyframes, transitions, and media queries
├── js/
│   └── main.js       # Lightweight vanilla JavaScript for theme toggle, animations, counters, and form validation
└── README.md         # Comprehensive project documentation
```

---

## 🌟 What the Page Contains

The landing page implements a structured, multi-section layout:

1. **Sticky Responsive Navbar (`#navbar`)**:
   - Brand logo with gradient text (`StudentRegDesk`).
   - Collapsible mobile navigation toggler.
   - Smooth-scrolling links to every section on the page.
   - Theme toggle button for **Dark Mode** with persistent `localStorage` support.
   - Accessible keyboard **Skip to main content** link.
2. **Hero Section (`#hero`)**:
   - Academic intake headline with dual-tone gradient text.
   - Subtitle outlining the admissions service value proposition.
   - Two call-to-action buttons (primary with glowing pulse effect, secondary for advisory enquiry).
   - A **100% pure CSS-only decorative illustration** depicting an active admissions portal with progress tracks, floating chips, and ambient glow (no external images).
3. **Features Grid (`#features`)**:
   - 6 responsive feature cards (1 column on mobile, 2 columns on tablets, 3 columns on desktop).
   - Inline icons, custom hover card-lift transitions (`transform: translateY(-8px)`), and elevation shadows.
4. **Courses Section (`#courses`)**:
   - 3 pricing-style degree tracks (Undergraduate, Postgraduate, Executive).
   - The middle card is highlighted with a "Most Popular" badge, prominent border, and elevated scale.
5. **Stats Strip (`#stats`)**:
   - 4 key academic metrics (1,200+ Students, 25+ Courses, 40+ Mentors, 95% Placement).
   - Powered by **CSS Grid** (`display: grid`) and a JavaScript number counter animation triggered once on scroll.
6. **Testimonials Carousel (`#testimonials`)**:
   - Bootstrap 5.3 carousel with 3 authentic student reviews, circular CSS initials avatars, slide indicators, and accessible previous/next controls.
7. **FAQ Accordion (`#faq`)**:
   - Bootstrap 5.3 accordion containing 4 frequently asked questions with smooth expand/collapse transitions.
8. **Contact Section (`#contact`)**:
   - Two-column layout:
     - Left column: Helpdesk location, email address, hotline, and advisory hours.
     - Right column: Interactive course enquiry form (Name, Email, Degree Track, Message).
   - Submits via client-side JavaScript, validates input, reveals an in-page "Thank You" confirmation banner, and resets the form without page reloads.
9. **Site Footer (`#footer`)**:
   - Multi-column layout structured using **CSS Grid** (`display: grid`).
   - Includes platform mission summary, quick navigation links, academic fields, accessible social media placeholder icons, and copyright details.

---

## 🎨 Advanced CSS Techniques Used (in `css/style.css`)

| Technique | Description & Implementation Details |
| :--- | :--- |
| **1. CSS Custom Properties** | Centralized design tokens defined in `:root` and overridden in `[data-theme=dark]` for `--primary-color`, `--bg-body`, `--text-primary`, `--space-*`, `--radius-*`, `--shadow-*`, and transitions. |
| **2. CSS Grid Layout** | Utilized for the milestone statistics strip (`.stats-grid`) and the multi-column footer (`.footer-grid`) for precise alignment across breakpoints. |
| **3. Flexbox Layout** | Used across the sticky navbar, hero actions, feature card contents, testimonials, contact details, and footer bottom bar. |
| **4. Smooth Transitions** | Interactive hover effects: card lifts (`transform: translateY(-8px)` + `box-shadow`), button color transitions, and an underline-grow animation on `.navbar-custom .nav-link::after`. |
| **5. Keyframe Animations** | Three distinct `@keyframes`: <br>• `@keyframes heroFadeUp` for staggered hero text entrance. <br>• `@keyframes floatAnimation` for perpetual floating on the hero illustration. <br>• `@keyframes pulseGlow` for a pulsing box-shadow on the primary CTA button. |
| **6. Linear Gradients** | Applied to the hero section background (`linear-gradient(135deg, ...)`), primary CTA buttons, and the stats strip banner. |
| **7. Gradient Text** | Applied to heading keywords using `-webkit-background-clip: text` and `-webkit-text-fill-color: transparent`. |
| **8. Scroll Reveal (Observer)** | Elements with `.fade-in-section` start transparent and translated down; upon viewport entry, `main.js` adds `.is-visible` to trigger smooth CSS transitions. |
| **9. Dark Theme Support** | Full dark palette activated via `[data-theme=dark]` on `<html>`, toggled by a navbar button, and remembered safely using `localStorage` wrapped in `try/catch`. |
| **10. Reduced Motion Support** | `@media (prefers-reduced-motion: reduce)` zeroes out animation durations, transitions, and smooth scrolling for users who prefer reduced motion. |
| **11. Custom Media Queries** | Three custom media queries (`max-width: 576px`, `min-width: 768px`, `min-width: 992px`) that reconfigure typography, grid columns, button stacking, and padding. |
| **12. Bootstrap Extension** | Extended Bootstrap 5.3 components (Navbar, Cards, Carousel, Accordion, Buttons, Form controls) with custom border radiuses, shadows, and color variables. |

---

## 🚀 How to Open and View the Project

No Node.js runtime, npm installation, or local web server is required.

1. Navigate to the project directory:
   ```text
   c:\Projects\cognifyz-fullstack-internship\level-2-intermediate\task-3
   ```
2. Open `index.html` directly in any modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari):
   - **Windows Explorer**: Double-click `index.html`.
   - **Command Line / PowerShell**:
     ```powershell
     Start-Process "index.html"
     ```
3. Test the features directly:
   - Click the **🌙 / ☀️** toggle in the navbar to switch between Light and Dark themes.
   - Scroll down to watch sections smoothly fade into view and numbers count up to `1,200+`, `25+`, `40+`, and `95%`.
   - Interact with the **Courses**, **Testimonials carousel**, and **FAQ accordion**.
   - Fill in the **Contact form** and click **Submit Registration Enquiry** to verify the in-page JavaScript confirmation.
   - Resize your browser window (or open DevTools Device Toolbar) to inspect responsiveness at 360px, 768px, and 1280px.

---

## 📱 Responsive Design Verification

- **Mobile Viewport (360px – 576px)**:
  - Hero actions stack vertically into full-width touch buttons.
  - Stats strip collapses into 1 column.
  - Features grid displays 1 card per row.
  - Navbar collapses into a responsive hamburger menu.
  - No horizontal scrolling occurs (`overflow-x: hidden`).
- **Tablet Viewport (768px)**:
  - Stats strip expands into a 2-column grid.
  - Features grid displays 2 cards per row.
  - Footer displays 2 columns.
- **Desktop Viewport (992px – 1280px+)**:
  - Full horizontal navigation bar with hover underline effects.
  - Features grid displays 3 cards per row.
  - Stats strip displays all 4 counters side-by-side in 1 row.
  - Footer expands into a 4-column layout.

