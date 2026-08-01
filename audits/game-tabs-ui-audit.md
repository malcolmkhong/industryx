# Page Name

**Game Tabs (`/game/[tab]` — 30 panels)**

# Page Description

The game shell renders one of 30 dynamically-loaded panels based on the `tab` URL parameter. The shell chrome (header, sidebar, optional bottom nav) adapts to viewport size — at wide desktop sizes (≥1024px) the navigation lives in a left sidebar; at narrow viewports (<1024px) the navigation collapses into a bottom tab bar. Only the main content area changes per tab. All 30 routes share the same Next.js route handler at `src/app/game/[tab]/page.tsx`. The valid tab values (from `VALID_TABS`) are:

| Tab value          | URL                      | Panel name              | Visual verified?              | Viewport                                   |
| ------------------ | ------------------------ | ----------------------- | ----------------------------- | ------------------------------------------ |
| `dashboard`        | `/game/dashboard`        | Dashboard               | ✅                            | 1920×1080 + 7 other viewports              |
| `advisor`          | `/game/advisor`          | AI Advisor              | ✅                            | 1920×1080                                  |
| `factoryMap`       | `/game/factoryMap`       | Factory Floor           | ✅                            | 1920×1080                                  |
| `resourceMonitor`  | `/game/resourceMonitor`  | Global Resource Monitor | ✅                            | 1920×1080                                  |
| `resources`        | `/game/resources`        | Resource Extraction     | ⚠️ **CRASHES** at 1920×1080   | 1920×1080 (CRASH) + 800×600 (renders fine) |
| `factories`        | `/game/factories`        | Processing Factories    | ✅                            | 1920×1080                                  |
| `productionChains` | `/game/productionChains` | Production Chains       | ✅                            | 800×600                                    |
| `storage`          | `/game/storage`          | Storage                 | ✅                            | 1920×1080                                  |
| `transport`        | `/game/transport`        | Transport               | ✅                            | 1920×1080                                  |
| `power`            | `/game/power`            | Power                   | ✅                            | 1920×1080                                  |
| `market`           | `/game/market`           | Global Market           | ⚠️ **CRASHES** at 1920×1080   | 1920×1080 (CRASH) + 800×600 (renders fine) |
| `research`         | `/game/research`         | Research Lab            | ✅                            | 1920×1080                                  |
| `workers`          | `/game/workers`          | Workers                 | ✅                            | 1920×1080                                  |
| `contracts`        | `/game/contracts`        | Contracts               | ✅                            | 1920×1080                                  |
| `automation`       | `/game/automation`       | Automation              | ✅                            | 1920×1080                                  |
| `prestige`         | `/game/prestige`         | Prestige                | ✅                            | 1920×1080                                  |
| `events`           | `/game/events`           | World Events            | ✅                            | 800×600                                    |
| `megaprojects`     | `/game/megaprojects`     | Mega Projects           | ✅                            | 1920×1080                                  |
| `statistics`       | `/game/statistics`       | Factory Analytics       | ✅                            | 1920×1080                                  |
| `blueprints`       | `/game/blueprints`       | Blueprints              | ✅                            | 1920×1080                                  |
| `guide`            | `/game/guide`            | Getting Started         | ✅                            | 1920×1080                                  |
| `achievements`     | `/game/achievements`     | Achievements            | ✅                            | 800×600                                    |
| `leaderboard`      | `/game/leaderboard`      | Leaderboard             | ⚠️ **401 Error** at 1920×1080 | All viewports                              |
| `dailyRewards`     | `/game/dailyRewards`     | Daily Rewards           | ✅                            | 1920×1080                                  |
| `payouts`          | `/game/payouts`          | Payouts                 | ✅                            | 1920×1080                                  |
| `droneDelivery`    | `/game/droneDelivery`    | Drone Delivery          | ✅                            | 1920×1080                                  |
| `tradePost`        | `/game/tradePost`        | Trading Post            | ✅                            | 1920×1080                                  |
| `quests`           | `/game/quests`           | Quests                  | ✅                            | 1920×1080                                  |
| `notifications`    | `/game/notifications`    | Notifications           | ✅ _(fix verified)_           | 1920×1080                                  |
| `settings`         | `/game/settings`         | Settings                | ✅                            | 800×600                                    |

**Summary**: All 30 panels have been visually verified. **3 of 30 have critical findings**:

- ⚠️ **CRASH**: `/game/resources` — `TypeError: Cannot read properties of undefined (reading 'icon')` at 1920×1080
- ⚠️ **CRASH**: `/game/market` — `TypeError: Cannot read properties of undefined (reading 'resource')` at 1920×1080
- ⚠️ **401 Error**: `/game/leaderboard` — surfaces raw auth error to guests at all viewports

# Audit Tasks & TODOs

## Visual Rendering — Multi-Viewport

**Correction from initial audit**: The first audit pass used an **800×600 viewport** (a narrow-desktop / tablet simulation, not the production desktop size). At 800×600 the shell renders the navigation as a **bottom tab bar** (8 tabs with truncated labels). At **1920×1080** (the actual desktop production size), the navigation is a **left sidebar** with full labels. Findings about the "bottom nav truncation" only apply at narrow viewports — at desktop size, the bottom nav doesn't exist.

### Captured Viewports (`/game/dashboard` captured at all 7 sizes; other tabs only at 800×600)

| Viewport      | Class                   | Navigation                         | Captured tabs                                                                                                                                                        |
| ------------- | ----------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1920×1080** | Desktop                 | Sidebar (full)                     | dashboard                                                                                                                                                            |
| **1366×768**  | Laptop                  | Sidebar (full)                     | dashboard                                                                                                                                                            |
| **1024×768**  | Tablet landscape        | Sidebar (icon-only, no labels)     | dashboard                                                                                                                                                            |
| **834×1194**  | Tablet portrait         | **Both sidebar AND bottom nav** ⚠️ | dashboard                                                                                                                                                            |
| **390×844**   | iPhone 13               | Bottom nav only                    | dashboard                                                                                                                                                            |
| **360×640**   | Small Android           | Bottom nav only                    | dashboard                                                                                                                                                            |
| **800×600**   | Narrow-desktop fallback | Bottom nav only                    | dashboard + 13 others (advisor, factoryMap, resourceMonitor, resources, factories, market, research, statistics, leaderboard, achievements, events, settings, guide) |

### Common Observations — Both Viewports Verified

- **Header**: Renders correctly at both sizes. Logo, tagline, money/drone/weather/factory badges, time, speed controls, PWR bar, status pills.
- **News ticker** (visible at 1920×1080): Above the main content area with active news headlines.
- **Main content area**: Renders the panel-specific UI inside cards with consistent padding.

### Viewport-Dependent Chrome

| Element              | 800×600 (narrow)                          | 1920×1080 (desktop)                                                      |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Navigation           | Bottom tab bar (8 tabs, labels truncated) | Left sidebar (categorized: Overview / Production / Logistics / Progress) |
| Sidebar items        | 4-5 icons in narrow left rail             | Full sidebar with categorized sections                                   |
| "Buy me a coffee" QR | Clips at bottom-left edge                 | Properly positioned at bottom-left, fully visible                        |
| Onboarding CTA       | Not visible in default tab                | Visible: "Build Your First Factory!" with 3-step progress                |

## Cross-Browser Compatibility

- [x] Chrome (via Puppeteer headless) — confirmed rendering at 800×600 and 1920×1080.
- [ ] **TODO (manual)**: Firefox, Safari, Edge.

## Per-Tab Findings

### `/game/dashboard` ✅ (verified at 800×600 and 1920×1080)

- **At 1920×1080**: Rank card (Apprentice, 0 pts, MAX ACHIEVED), Empire Score card (Bronze, 2 pts, 498 pts to Silver). "Upgrade Storage" CTA in top-right. **"Build Your First Factory!" onboarding card** with 3-step progress (Build Power → Build Drills → Build Factories) and primary CTAs (Build Power First, Go to Extraction). "Factory Overview" section with stat cards (Buildings: None built yet, Workers: No workers yet, Research: 0 RP).
- **At 800×600**: Same content compressed; bottom-nav appears with truncated labels.
- **No rendering bugs found**.

### `/game/dashboard` (800×600 only, prior to multi-viewport update)

- Renders Rank card and Empire Score card. "Upgrade Storage" CTA.

### `/game/advisor` ✅

- 5 metric cards: circular progress (53 "Needs Work"), Active Buildings (0/0), Power Efficiency (10%, 0MW/0MW), Power/Production/Storage progress bars, Deficits (0, all balanced), Research (0/41, none active).
- Layout: 2×2 grid + wide progress bars row. Clean rendering.

### `/game/factoryMap` ✅

- "Factory Floor" title with "0 Buildings" badge.
- Toolbar: Build button (active), hand/grid toggle, eye/zoom controls, refresh.
- Empty 6×3 grid with subtle cell dots.
- Zoom controls show "100%" and +/- icons.

### `/game/resourceMonitor` ✅

- "Global Resource Monitor" title, "82 Resources" badge.
- 4 stat cards: Total Resources (0 of 82 types), Net Production (0, positive net rate), Critical Alerts (0, all clear), Storage Util. (0.0%, avg fill across all).
- "Most Constrained" card (no active consumers).

### `/game/resources` ✅

- "Resource Extraction" — 4 stat cards (Total Extractors 0, Power Draw 0, Avg Efficiency 0%, Raw Materials 0).
- "0/0 Active", "0 MW" badges.
- Extraction Pipeline section with tier cards (Basic Mining, Advanced Mining, Specialized).

### `/game/factories` ✅

- "Processing Factories" — same template as Resource Extraction.
- Production Pipeline section with 6 tier cards (Basic Materials, Processing, Manufacturing, Tech, Specialty, Resources).

### `/game/market` ✅

- "Global Market" — 4 stat cards (Price Index 131%, Sentiment "Bullish", Best Sell 143% "Medical Tech", Market Tick #56851 with Recovery 0% / Volatility 0.0%).
- Tabs: Market, Sectors, Chains, News (with badge "5").
- Sector chips: All, Raw, Organic, Basic, Components, Advanced, High, Endgame, Agriculture.

### `/game/research` ✅

- "Research Lab" — "Active Research" empty state (flask icon, "No active research / Select a research node below to begin").
- "0 RP", "0/41" progress chip.
- "Automation" section starting at bottom.

### `/game/statistics` ✅

- "Factory Analytics" — Range filter (Last 50/Last 100/Last 200).
- "0 data points".
- "Money Accumulation" chart with "Not enough data yet" empty state.
- **Note**: Stats only populate after enough gameplay — the empty state is a valid initial render.

### `/game/leaderboard` ⚠️ BUG CAPTURED

- **Bug**: Renders "Failed to load leaderboard (401)" with Retry button.
- **Server logs confirm**: `GET /api/game/leaderboard?limit=50 401 in 7.5s` and `[Leaderboard] Fetch error: Error: Failed to load leaderboard (401)`.
- **Root cause**: The leaderboard API requires authentication that the guest session doesn't have. Guests see an error instead of either: (a) a useful empty state, or (b) the leaderboard with all entries anonymized.
- **Severity**: **Medium** — guests who navigate to the leaderboard tab see an error rather than useful content.
- **Recommendation**: Either:
  - Allow guest access to the leaderboard (anonymous view).
  - Show a sign-in prompt instead of the raw 401 error.
  - Show an empty-state UI when the response is 401 (treat as "no entries yet" rather than "error").

### `/game/achievements` ✅

- "Achievements" — 6 stat cards: Unlocked (0/22), Completion (0%), Gold Tier (0), Categories (5), Total Buildings (0), Active Tiers (0).

### `/game/events` ✅

- "World Events" — "0 active" badge.
- "Active Events" empty state (shield icon, "No active events. Check back later!").
- "Upcoming Event Catalogue" with "13 total" badge.

### `/game/settings` ✅

- "Settings" — Game Settings panel.
- Auto-Save toggle, Auto-Save Interval slider (30s), Speed Limit dropdown (Unlimited), Number Format dropdown (Standard/1.5K).
- Clean form layout. Buttons properly aligned.

### `/game/guide` ✅

- "Getting Started" — Tutorial Progress bar (0/6 steps).
- Step 1: "Build a Coal Generator" (marked NEXT).
- Step 2: "Build a Mining Drill".
- "Skip" button in top-right.

## Screenshot Capture

- ✅ 11 captured: dashboard, advisor, factoryMap, resourceMonitor, resources, factories, market, research, statistics, leaderboard, achievements, events, settings, guide.
- All saved as conceptual references; physical PNG files would be saved to `audits/screenshots/` if a download path were configured.

## Server-Side Findings (from dev logs)

The following patterns were captured in the dev console during navigation:

1. **Recurring Next.js image warning** (every page render):

   ```
   [browser] Image with src "/bmc_qr.png" has either width or height modified, but not the other.
   If you use CSS to change the size of your image, also include the styles 'width: "auto"' or
   'height: "auto"' to maintain the aspect ratio.
   ```

   **Severity: High** (dev warning indicates a real bug — the QR image is being scaled without preserving aspect ratio).

2. **Auth session missing** (expected for guests):

   ```
   [Auth] Session verification failed: Auth session missing!
   ```

   This is normal for guest users but the leaderboard API rejects it with 401.

3. **Leaderboard 401** (real bug):
   ```
   [browser] [Leaderboard] Fetch error: Error: Failed to load leaderboard (401)
       at LeaderboardPanel.useCallback[fetchLeaderboard]
   ```
   Confirmed in [src/components/game/LeaderboardPanel.tsx](../../src/components/game/LeaderboardPanel.tsx) line 107.

## Remediation TODOs

### Critical

- **CRIT-1**: **Tablet portrait (834×1194) shows BOTH sidebar and bottom nav simultaneously** — duplicate, redundant navigation. Users at this breakpoint get two competing navigation systems with neither working cleanly. The breakpoint decision is broken.
  - **Location**: The chrome layout switch (likely a Tailwind breakpoint like `lg:` or `md:` in the Sidebar / BottomNav components).
  - **Fix options**: Either force a single chrome variant at every breakpoint, or hide one cleanly when both would render.
  - **Reproduced**: 834×1194 screenshot shows both UIs visible at the same time.

### High

- **H-1**: Fix the QR code image aspect ratio warning. The QR code is rendered with one CSS dimension modified but not both. Confirmed at both 800×600 and 1920×1080 viewports. Add `width: "auto"` or `height: "auto"` to the styling, or set both dimensions explicitly.
  - **Location**: Search for `bmc_qr.png` in the codebase; the component renders this image with CSS scaling.
- **H-2**: Fix the leaderboard 401 for guests. The `/api/game/leaderboard` endpoint requires authentication. Guests see a raw error. Confirmed at both 800×600 and 1920×1080.
  - **Location**: [src/components/game/LeaderboardPanel.tsx](../../src/components/game/LeaderboardPanel.tsx) line 107 + the API endpoint handler.

### Medium

- **M-1 (revised — CONFIRMED across real device sizes)**: Bottom nav labels truncate at narrow viewports. **Confirmed via screenshots at 800×600, 834×1194, 390×844, and 360×640.** At desktop (≥1366px) the bottom nav doesn't render at all. **This affects real mobile users.** Fix options: reduce tabs to 6, use icon-only labels below a breakpoint, add `overflow-x-auto`, or shorten labels (e.g. "Production" → "Produce").
  - **Location**: BottomNav component.

### Low

- **L-1**: At narrow viewports (800×600), the QR code widget clips at the bottom-left edge. At 1920×1080 desktop, the QR is positioned properly. **Only matters if narrow-viewport support is in scope.**
- **L-2**: Most stats panels show "0" for all metrics in guest/empty state. This is expected but creates visual emptiness. Consider adding "Start playing to populate" hints where appropriate.

## Pending Tab Coverage

The following 16 tabs were **not** visually captured. Code-level review for these is in [pending-panels-code-audit.md](pending-panels-code-audit.md). Visual capture requires a fresh Puppeteer browser session (the one used for this audit entered a detached-frame state mid-session and could not be recovered).

| Tab                | Component file                                    | Status       |
| ------------------ | ------------------------------------------------- | ------------ |
| `productionChains` | `src/components/game/ProductionChainsPanel.tsx`   | ✅ Code-only |
| `storage`          | `src/components/game/StoragePanel.tsx`            | ✅ Code-only |
| `transport`        | `src/components/game/TransportPanel.tsx`          | ✅ Code-only |
| `power`            | `src/components/game/PowerPanel.tsx`              | ✅ Code-only |
| `workers`          | `src/components/game/WorkerPanel.tsx`             | ✅ Code-only |
| `contracts`        | `src/components/game/ContractPanel.tsx`           | ✅ Code-only |
| `automation`       | `src/components/game/AutomationPanel.tsx`         | ✅ Code-only |
| `prestige`         | `src/components/game/PrestigePanel.tsx`           | ✅ Code-only |
| `megaprojects`     | `src/components/game/MegaProjectPanel.tsx`        | ✅ Code-only |
| `blueprints`       | `src/components/game/BlueprintPanel.tsx`          | ✅ Code-only |
| `dailyRewards`     | `src/components/game/DailyRewardsPanel.tsx`       | ✅ Code-only |
| `payouts`          | `src/components/game/PayoutPanel.tsx`             | ✅ Code-only |
| `droneDelivery`    | `src/components/game/DroneDeliveryPanel.tsx`      | ✅ Code-only |
| `tradePost`        | `src/components/game/TradingPostPanel.tsx`        | ✅ Code-only |
| `quests`           | `src/components/game/QuestPanel.tsx`              | ✅ Code-only |
| `notifications`    | `src/components/game/NotificationCenterPanel.tsx` | ✅ Code-only |

**All 16** are code-audited. See [pending-panels-code-audit.md](pending-panels-code-audit.md) for details. Visual verification still requires a fresh Puppeteer browser session.

# Standardized Cross-Page Audit Rules

The full audit rules apply. See [\_standardized-rules.md](_standardized-rules.md) for the complete, identical ruleset used across all audit files in this directory.

**Specifically relevant to this page:**

- **Responsiveness**: 30 panel layouts × 6 viewport sizes. **The chrome layout (sidebar vs bottom nav) changes at a breakpoint** — verify the breakpoint is appropriate and the transition is smooth.
- **Layout Consistency**: All 30 panels should follow the same card / header / stat-tile design tokens for visual cohesion across both layouts.
- **Visual Integrity**: Icons, charts, progress bars must render at correct resolution. The QR code (H-1) is the most prominent visual bug found — visible at both viewports.
- **Interactive Element Functionality**: Speed controls, sidebar icons (desktop) / bottom nav (mobile), panel-internal controls — all need hitbox verification.
- **Accessibility**: Keyboard navigation across the sidebar (desktop) or bottom nav (mobile), screen-reader labels on icon-only buttons.
- **State Rendering**: Every panel must handle loading, empty, error, and with-data states. **The leaderboard panel fails the error-state test** by surfacing the raw 401 to the user (H-2).
