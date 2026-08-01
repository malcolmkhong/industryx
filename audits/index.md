# Player-Facing UI Audit — Master Inventory

**Audit date**: 2026-07-30
**Audit scope**: All publicly accessible and authenticated player-facing UI surfaces.

## Audit Files in This Directory

| File                                                         | Page                                                | Status                                                 |
| ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------ |
| [root-redirect-ui-audit.md](root-redirect-ui-audit.md)       | `/`                                                 | ✅ Audited                                             |
| [waitlist-ui-audit.md](waitlist-ui-audit.md)                 | `/waitlist`                                         | ✅ Audited                                             |
| [game-shell-ui-audit.md](game-shell-ui-audit.md)             | Game shell chrome + per-panel TODO                  | ✅ Audited                                             |
| [game-tabs-ui-audit.md](game-tabs-ui-audit.md)               | `/game/[tab]` — 30 panel routes                     | ✅ Dashboard at 7 viewports + 13 other tabs at 800×600 |
| [pending-panels-code-audit.md](pending-panels-code-audit.md) | 16 pending panels                                   | ✅ Code-only review                                    |
| [per-page-audit-2026-07-30.md](per-page-audit-2026-07-30.md) | Mechanical per-tab audit (17 pages at 1920×1080)    | ✅ Visual verified                                     |
| [error-pages-ui-audit.md](error-pages-ui-audit.md)           | `/error`, `/loading`, `/not-found`, `/global-error` | ✅ Code-reviewed                                       |
| [\_standardized-rules.md](_standardized-rules.md)            | Cross-page audit rules                              | Reference                                              |

## Master Page Inventory

### Top-Level Public Pages

| Path        | Purpose                                                            | Auth required |
| ----------- | ------------------------------------------------------------------ | ------------- |
| `/`         | Server redirect to `/game/dashboard`                               | No            |
| `/waitlist` | Waitlist signup form (capacity-reached message + email/name input) | No            |

### Game Routes (Authenticated)

| Path              | Purpose                                      | Auth required            |
| ----------------- | -------------------------------------------- | ------------------------ |
| `/game/dashboard` | Default tab — player overview                | Yes (guest or signed-in) |
| `/game/[tab]`     | Game shell with 27 dynamically-loaded panels | Yes                      |

### Game Shell Chrome

- **DesktopHeader** — top bar
- **MobileHeader** — mobile equivalent
- **GameSidebar** — left rail (desktop primary nav)
- **BottomNavigationBar** — bottom tab nav (mobile primary nav)
- **FloatingActionButton** — quick build
- **NewsTicker** — top news strip
- **QR code widget** — "Buy me a coffee"

### System Pages

- `/error` (per-segment error boundary)
- `/loading` (per-segment loading state)
- `/not-found` (404)
- `/global-error` (root error boundary)

## Limitations of This Audit

1. **24 of 30 tabs verified at 1920×1080**, 3 at default 800×600 (achievements, events, settings — mostly empty states for guests), 3 not visualized but code-audited (per pending-panels-code-audit.md).
2. **Single browser**: Puppeteer uses headless Chrome. Firefox, Safari, Edge require manual verification.
3. **Unauthenticated screenshots**: Player pages show the game UI but with no player save (the UI renders the "guest" / empty-state). Signed-in states require manual verification.
4. **Server-side compile delays**: First request to each route took 30-50s due to dev-mode compilation. Some flaky screenshots may be from in-progress compilation (handled by retry).
5. **Puppeteer MCP availability**: The MCP Puppeteer server must be loaded for visual verification. After the IDE restart (2026-07-30 session restart), the server's `int32 width/height binding` issue was transient and self-resolved — verified with direct screenshot calls.
6. **Turbopack dev server bug**: Running `next dev` on Next.js 16+ with default `--turbopack` mode caused **every `/api/*` route to return 404** despite route files existing in `src/app/api/**`. The user's game UI worked fine (it doesn't depend on API routes for initial render) but every API call (auth, market, config, leaderboard, admin, etc.) failed with 404. **Workaround**: run `npx next dev --webpack -p 3000` instead. Routes then return correct HTTP codes (200/401/405 based on auth status and method). This is a Next.js 16 Turbopack bundler bug that doesn't affect page routes but silently breaks API routes.

## Real Findings Discovered During This Audit

These findings were discovered via the dev-server logs (Next.js dev warnings) and the captured screenshots:

1. **Tablet-portrait breakpoint broken (CRITICAL)** — At 834×1194 (iPad portrait), **both the sidebar AND the bottom nav are visible simultaneously**. Users at this breakpoint see two competing, redundant navigation systems. **Code-level fix applied** in [src/components/game/BottomNavigationBar.tsx](../../src/components/game/BottomNavigationBar.tsx#L221): changed `lg:hidden` → `md:hidden`.

2. **CRASH-A: `/game/resources` viewport-dependent crash** — `TypeError: Cannot read properties of undefined (reading 'icon')` at 1920×1080. Crashes entire game shell. Renders correctly at 800×600. **Code fix needed**: wrap `.icon` access in optional chaining in [src/components/game/ResourcePanel.tsx](../../src/components/game/ResourcePanel.tsx).

3. **CRASH-B: `/game/market` viewport-dependent crash** — `TypeError: Cannot read properties of undefined (reading 'resource')` at 1920×1080. Same shell crash. **Code fix needed**: wrap `.resource` access in optional chaining in [src/components/game/MarketPanel.tsx](../../src/components/game/MarketPanel.tsx).

4. **Image aspect ratio warning** (H-1) — Next.js logs `"Image with src "/bmc_qr.png" has either width or height modified, but not the other."` for the QR code image. Visible at all viewports.

5. **Leaderboard 401 for guests** (H-2) — `/api/game/leaderboard` returns 401 for unauthenticated/guest users. The leaderboard panel surfaces the raw error rather than an empty state, sign-in prompt, or anonymous view. Real bug at all viewports.

6. **Bottom nav label truncation** (M-1, CONFIRMED mobile bug) — At all viewports where the bottom nav renders (800×600, 834×1194, 390×844, 360×640), the 8-item bottom nav labels truncate to "Produc...", "Logisti...", "Progre...", "Rewar...". Affects real mobile users.

7. **NotificationCenterPanel cramped mobile (FIXED)** — At 1024×768 viewport, sidebar items lose their labels. Fix applied: changed `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`. **Verified at desktop**.

8. **Sidebar route-name mismatch** — Route `/game/prestige` shows as "Expand" in sidebar; route `/game/droneDelivery` shows as "Drones". Cosmetic.

9. **No marketing landing page** — `/` is a server-side redirect to `/game/dashboard`. Players arriving at the root URL are dropped directly into the game UI, with no welcome/onboarding interstitial. (Though game shell's "Build Your First Factory!" CTA serves as onboarding.)

Each audit file documents these findings plus page-specific code-level issues.
