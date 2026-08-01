# Page Name
**Waitlist (`/waitlist`)**

# Page Description
The waitlist page is a single-column public form that displays when the game has reached its testing-phase player capacity (469/500 in the captured screenshot). The page presents:
- A title ("Thank You For Visiting").
- A capacity message explaining why sign-ups are paused.
- A live counter ("2 people are already on the waitlist") as social proof.
- A sign-up form with email (required) and name (optional) fields.
- A "Join Waitlist" CTA button.
- A "Sign in" link for existing users at the bottom.
- A floating chat/notification widget in the lower-left corner.

The page is the sole public-facing entry point for prospective players when capacity is reached. It uses the application's standard dark theme with brand purple accents.

# Audit Tasks & TODOs

## Visual Rendering (Default 800×600 Viewport)
- [x] Captured screenshot at 800×600 — form renders centered, well-padded, single column.
- [ ] **TODO (manual)**: Verify at 1920×1080, 1366×768, 1024×768, 834×1194, 390×844, 360×640 — confirm form stays centered and remains usable at all sizes.

### Observed Issues
- **Observation 1**: At 800×600, the floating widget in the lower-left (the "N" circle) appears partially clipped at the viewport edge. **Severity: Low** — widget is decorative, not core content.
- **Observation 2**: The capacity message and counter use two distinct typographic styles (bold title + body + counter). Hierarchy is clear.

## Cross-Browser Compatibility
- [x] Chrome (via Puppeteer headless) — confirmed rendering.
- [ ] **TODO (manual)**: Firefox, Safari, Edge.

## Layout Shift / Overflow
- [x] No layout shift on initial render (single static form, no async data above the fold).
- [x] No horizontal scrollbar at 800×600.
- [ ] **TODO (manual)**: Verify no layout shift on form submission state transitions.

## Missing UI / Components
- [x] All required form fields present (email, optional name).
- [x] Submit CTA present and visually distinct.
- [x] Sign-in link present for returning users.
- [ ] **TODO (manual)**: Verify success state (post-submit), error state (validation failure, network error), and loading state (submit in flight) all render correctly.

## Screenshot Capture
- ✅ Captured at `/audits/screenshots/waitlist-desktop-800.png` (visible in this session's Puppeteer output).

## Remediation TODOs

### Critical
- *(none)*

### High
- *(none)*

### Medium
- **M-1**: The waitlist success / error states should be visually verified. The form's submit handler presumably shows a confirmation message on success, but no screenshot evidence of this was captured (form not submitted during audit). **TODO**: Submit a test entry and capture the resulting state.

### Low
- **L-1**: The floating widget at lower-left appears to clip at narrow viewports (observed at 800×600). Verify behavior at 360×640 (mobile). If clipping is intentional (overflow decoration), document; if not, add padding/margin.
- **L-2**: Verify the "Sign in" link destination — does it point to the player sign-in flow or the admin login? Currently both `/admin/login` and (presumably) `/auth/login` exist. Code-level: check that the link target is the player flow, not admin.

# Standardized Cross-Page Audit Rules

The full audit rules apply. See [_standardized-rules.md](_standardized-rules.md) for the complete, identical ruleset used across all audit files in this directory.

**Specifically relevant to this page:**
- **Responsiveness**: Single-column form should naturally scale. Verify mobile layout — input fields must remain full-width and tappable (≥44px height).
- **Accessibility**: Email input must have a visible label (observed in screenshot: "Email Address *" with red asterisk indicating required). Name input has "(Optional)" suffix — verify it's also programmatically associated via `aria-label` or `<label for>`.
- **Color Contrast**: White text on dark background easily exceeds 4.5:1. Brand purple button likely needs verification against the dark background (suggest manual contrast check).
- **State Rendering**: Three states must render correctly: (a) idle, (b) submitting (button shows loading state), (c) success/error (form replaced by status message). Idle state captured; submitting and success/error states require manual verification.