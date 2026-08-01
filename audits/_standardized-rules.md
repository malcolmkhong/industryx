# Standardized Cross-Page Audit Rules

These evaluation criteria apply identically to every audit file in this directory. Deviations are not permitted.

## Non-Negotiable Evaluation Criteria

### 1. Responsiveness

All page elements must render without cut-off, overlap, or unintended scrollbar generation across all supported viewport sizes:

- Desktop: 1920×1080, 1366×768
- Tablet: 1024×768, 834×1194 (portrait and landscape)
- Mobile: 390×844, 360×640

### 2. Layout Consistency

Alignment of core UI elements (headers, navigation bars, footers, card grids) must match the application's design system specifications across all pages. Spacing tokens, padding, and grid behavior must be consistent.

### 3. Visual Integrity

All images, icons, fonts, and color assets must load fully, display at the correct resolution, and adhere to brand guidelines. No broken image placeholders, missing icon glyphs, or fallback fonts in production.

### 4. Interactive Element Functionality

All clickable, tappable, or hoverable UI elements must maintain their intended hitbox size (≥44×44 CSS px recommended for touch) and interactivity without rendering artifacts. Hover/focus/active states must be visually distinct.

### 5. Accessibility Compliance

UI rendering must not block screen reader access, maintain sufficient color contrast (minimum 4.5:1 for body text, 3:1 for large text), and support keyboard navigation without layout breaks. All interactive elements must have accessible names.

### 6. State Rendering

All page states (loading, empty, error, success, permission-denied, signed-out) must render as specified in design documentation with no missing UI elements. No blank screens under any error path.
