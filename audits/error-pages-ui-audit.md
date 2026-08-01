# Page Name
**System Error / Not-Found Pages**

# Page Description
This audit covers the four Next.js system-level pages that handle non-happy-path navigation:

- **`/not-found`** ([src/app/not-found.tsx](../../src/app/not-found.tsx)) — Root 404 page. Shown when a route outside `/admin` doesn't exist. Includes "Back to Factory" link + "Go Back" button. Uses the app's standard dark theme with brand accents.
- **`/error`** ([src/app/error.tsx](../../src/app/error.tsx)) — Root error boundary. Fires when any unhandled error is thrown from a route segment. Replaces the failed segment but keeps parent layouts intact. Shows error digest (for support), error message (in `<details>`), "Try Again" button + "Back Home" link.
- **`/global-error`** ([src/app/global-error.tsx](../../src/app/global-error.tsx)) — Last-resort handler. Fires only when the root layout itself crashes. Renders a minimal `<html><body>` structure with title, error ID, and "Try again" button. This is the only system page that ships its own `<html>` element (because the root layout is broken).
- **`/loading`** — Not present at the app root. The game route has its own `loading.tsx` (`src/app/game/loading.tsx`). Top-level public routes (`/waitlist`, `/`) do not define their own loading UI — they rely on the framework default.

These pages are intentionally simple, high-contrast, and use the app's standard brand colors for consistency. They are the player's "I'm stuck" experience and must always render correctly.

# Audit Tasks & TODOs

## Visual Rendering
- [ ] **TODO (manual)**: Trigger a 404 by navigating to a non-existent route. Capture at 800×600 and the 6 standard viewport sizes.
- [ ] **TODO (manual)**: Trigger an error boundary by introducing a runtime error in a route segment. Capture the rendered error page.
- [ ] **TODO (manual)**: Verify `/global-error` rendering — this requires breaking the root layout, which is non-trivial. May need a temporary dev-only error thrower.

## Cross-Browser Compatibility
- [ ] **TODO (manual)**: Firefox, Safari, Edge.

## Layout Shift / Overflow
- [x] All four pages use `min-h-screen` and centered card layout — no scroll expected on desktop viewports.
- [ ] **TODO (manual)**: Verify error details `<pre>` block (in `/error`) doesn't overflow at narrow viewports. Current code uses `whitespace-pre-wrap break-all` which should wrap.

## Missing UI / Components
- [x] All four pages have a "go back / try again" affordance.
- [x] All four pages display an icon.
- [x] All four pages show error ID / digest for support correlation.
- [ ] **TODO (manual)**: Verify the "Share this ID with support" copy in `/global-error` is reachable on a long error digest (does the `break-all` styling preserve readability?).

## Screenshot Capture
- ⏸ Not captured during this audit pass (no easy way to trigger `/global-error` without breaking the app). Manual screenshots required.

## Code-Level Observations

### `/not-found`
- ✅ Uses `'use client'` (required for the back-button onClick).
- ✅ Lucide icons (`Compass`, `Home`, `ArrowLeft`) all have `aria-hidden="true"`.
- ✅ Responsive button layout: `flex-col sm:flex-row` — stacks on mobile, row on desktop.
- ✅ Buttons are 44px tall (`h-11`) — meets touch-target minimum.

### `/error`
- ✅ Shows error digest as truncated copyable text (`title={error.digest}`).
- ✅ Error message in collapsible `<details>` — keeps UI clean for non-debuggers.
- ✅ Reset function wired to "Try Again" button.
- ✅ Uses `text-danger` for the icon container — semantic color use.
- ⚠️ The reset button is `h-10` (40px) — slightly below the 44px touch target minimum. **Severity: Low** (the page is mostly informational; the touch target is a secondary action).

### `/global-error`
- ✅ Renders its own `<html><body>` structure (required because root layout is broken).
- ✅ Logs error digest + message to console on mount.
- ⚠️ Uses Tailwind classes without explicit token names (`bg-primary text-primary-foreground`) — this is the only system page that doesn't use the app's `bg-background text-foreground` token style. Visual consistency may break under the project's design-token theme. **Severity: Medium** — verify visually.
- ⚠️ The "Try again" button is not styled with brand tokens (uses generic `bg-primary`). **Severity: Medium**.

## Remediation TODOs

### Critical
- *(none)*

### High
- *(none)*

### Medium
- **M-1**: `/global-error` does not use the app's design tokens (uses raw `bg-primary` / `text-primary-foreground` / `text-muted-foreground` instead of the project's `bg-background` / `text-foreground` / `text-muted-label`). Verify visually; if the project's Tailwind config doesn't map `bg-primary` to the same color, the global error page will look visually different from the rest of the app. Consider replacing with the app's tokens for consistency.
  - **Location**: [src/app/global-error.tsx](../../src/app/global-error.tsx) lines 24-27.
- **M-2**: There is no `loading.tsx` at the app root. Top-level public routes (`/waitlist`, future marketing pages) have no custom loading UI. If a long-running top-level route is added in the future, the framework default will be used (typically just a spinner). Acceptable for now but flag for future.

### Low
- **L-1**: `/error` "Try Again" button is 40px tall, slightly below the 44px touch-target minimum. Bump to `h-11` for parity with `/not-found` buttons.
  - **Location**: [src/app/error.tsx](../../src/app/error.tsx) line 68.
- **L-2**: Verify the error digest truncation in `/error` is accessible — current implementation uses `max-w-64` + `truncate` + native `title` attribute. Screen readers should still read the full digest via the `title`. Confirm with manual screen-reader test.
- **L-3**: `/not-found` could benefit from a "Contact support" link for users who believe the page should exist. Currently only "Back to Factory" + "Go Back". Consider adding a tertiary action.

# Standardized Cross-Page Audit Rules

The full audit rules apply. See [_standardized-rules.md](_standardized-rules.md) for the complete, identical ruleset used across all audit files in this directory.

**Specifically relevant to this page:**
- **Responsiveness**: All four pages use centered card layouts with `min-h-screen`. Should scale gracefully from mobile to desktop.
- **Layout Consistency**: `/not-found` and `/error` follow the same template (icon container, title, body, two-button row). `/global-error` deviates (see M-1).
- **Visual Integrity**: Icons are Lucide React (confirmed render correctly in `/not-found` and `/error`; `/global-error` has no icon).
- **Accessibility**: All interactive elements have accessible text labels. Icons are `aria-hidden`. Error digests are exposed for screen readers via `title` attribute.
- **State Rendering**: Each page renders the same regardless of underlying error state (the error state is parameterized). No empty/loading variants needed for these system pages — they ARE the error/404 state.