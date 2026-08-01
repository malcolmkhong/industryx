# Page Name
**Root Redirect (`/`)**

# Page Description
The root URL `/` is implemented as a Next.js server component that performs an immediate server-side redirect to `/game/dashboard`. There is no visible UI rendered at this URL — the redirect happens at the edge before any HTML reaches the browser. This is the entry point for all players arriving at the application, including:
- First-time visitors with no session (treated as guests).
- Returning players with an active session.
- Players arriving from external links, marketing campaigns, or shared URLs.

The redirect is intended to drop players directly into the active game experience. No marketing copy, no onboarding interstitial, no sign-in gate. The `/game/dashboard` route then renders the full game shell.

# Audit Tasks & TODOs

## Visual Rendering (Default 800×600 Viewport)
- [x] Navigated to `http://localhost:3000` → observed redirect to `/game/dashboard` (Next.js dev compile time: 8-50s on first hit).
- [x] No visible content at `/` itself (immediate redirect).
- [ ] **TODO (manual)**: Verify at 1920×1080, 1366×768, 1024×768, 834×1194, 390×844, 360×640 — expect identical behavior (no visible UI at `/`).

## Cross-Browser Compatibility
- [x] Chrome (via Puppeteer headless) — confirmed redirect.
- [ ] **TODO (manual)**: Firefox, Safari, Edge.

## Layout Shift / Overflow
- [x] No layout to inspect (redirect-only).
- [ ] **TODO (manual)**: Verify the redirect preserves referrer / query params at the destination.

## Missing UI / Components
- [x] None — redirect is the entire UI.

## Screenshot Capture
- N/A (no visible UI at `/`). The visual state of the redirect destination is captured in [game-shell-ui-audit.md](game-shell-ui-audit.md).

## Remediation TODOs

### Critical
- *(none)*

### High
- *(none)*

### Medium
- **M-1**: No interstitial or welcome screen for first-time visitors. The redirect drops guests directly into the game shell. If a future product decision requires a marketing landing page or onboarding modal, this would need to be reworked (the current code path: [src/app/page.tsx](../../src/app/page.tsx) line 5 — `redirect('/game/dashboard')`).

### Low
- **L-1**: The redirect is a server component; no client JS is shipped for this route. This is correct (zero JS for an instant redirect).

# Standardized Cross-Page Audit Rules

The full audit rules apply. See [_standardized-rules.md](_standardized-rules.md) for the complete, identical ruleset used across all audit files in this directory.

**Specifically relevant to this page:**
- **Responsiveness**: N/A (no rendered content).
- **State Rendering**: The only "state" is "redirecting" — always renders the destination's loading skeleton. Confirmed: the redirect destination shows the "Bootstrapping your empire" spinner before the game shell mounts (observed in initial screenshots before compile completed).
- **Visual Integrity**: N/A.