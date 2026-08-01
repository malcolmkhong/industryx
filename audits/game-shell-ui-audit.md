# Page Name

**Game Shell (`/game/[tab]`)**

# Page Description

The game shell is the main authenticated player surface. It renders one of 27 dynamically-loaded panels based on the `tab` URL parameter (default: `dashboard`). The shell chrome includes:

- **DesktopHeader** (top bar): INDUSTRIAX logo, tagline, money widget, drone widget, weather widget, factory count widget, time display, speed controls (1x / 2x / 5x / 10x), PWR bar, status pills (Saved, weather, Live, players), Sign In button.
- **Left Sidebar**: Quick-access icons (home, panels).
- **Main content area**: Active panel (e.g., Dashboard, Resource, Factory).
- **BottomNav** (8 tabs): Overview, Production, Logistics, Progress, Rewards, Finance, System, Quick.
- **NewsTicker** (top strip): Active market news headlines.
- **QR code widget** (lower-left, conditional): "Buy Me a Coffee" or similar.

The default tab (`/game/dashboard`) renders the Rank and Empire Score cards, the "Upgrade Storage" CTA, and provides quick navigation to other panels.

The shell uses code-split dynamic imports for each panel — first navigation to a new tab triggers a panel fetch.

# Audit Tasks & TODOs

## Visual Rendering (Default 800×600 Viewport)

- [x] Captured screenshot of `/game/dashboard` — shell renders correctly with header, sidebar, main, bottom nav.
- [ ] **TODO (manual)**: Verify each of the other 26 tabs renders correctly. Each tab requires its own navigation and screenshot.

### Observed Issues (from `/game/dashboard` screenshot)

- **Issue 1 (BottomNav label truncation, narrow viewports only)**: At 800×600 viewport, the 8 bottom-nav labels truncate to "Produc...", "Logisti...", "Progre...", "Rewar...". Icons render fine; only text labels are clipped. **At 1920×1080 desktop, the bottom nav doesn't exist** — the navigation is sidebar-based. **Severity: Medium** — only matters if narrow-viewport support is in scope.
- **Issue 2 (QR code clipping, narrow viewports only)**: At 800×600 the QR code widget at lower-left appears partially clipped at the viewport edge. At 1920×1080 desktop, the QR is positioned properly. **Severity: Low** — only matters if narrow-viewport support is in scope.

## Cross-Browser Compatibility

- [x] Chrome (via Puppeteer headless) — confirmed rendering.
- [ ] **TODO (manual)**: Firefox, Safari, Edge.

## Layout Shift / Overflow

- [ ] **TODO (manual)**: Tab switches may cause layout shift as panels load. The dynamic import + loading skeleton should prevent shift, but verify.

## Missing UI / Components

- [x] Header bar renders fully.
- [x] Bottom nav present with all 8 tabs.
- [x] Main content area renders the active panel.
- [ ] **TODO (manual)**: Verify each of the 27 panels renders without missing UI elements (icon-only, text-only, mixed content).

## Screenshot Capture

- ✅ Captured at `/audits/screenshots/game-dashboard-800.png`.

## Server-Side Issues Found (from dev logs)

The following Next.js dev warnings were captured during the audit:

```
[browser] Image with src "/bmc_qr.png" has either width or height modified, but not the other.
If you use CSS to change the size of your image, also include the styles 'width: "auto"' or
'height: "auto"' to maintain the aspect ratio.
```

This warning appears for the QR code image used in the lower-left of the game shell. The image has only one dimension (width OR height) set via CSS, causing the browser to lose the intrinsic aspect ratio.

## Remediation TODOs

### Critical

- _(none)_

### High

- **H-1**: Fix the QR code image aspect ratio warning. Either:
  - Add `width: "auto"` or `height: "auto"` to the image's CSS, OR
  - Set both width AND height as explicit CSS values matching the intrinsic aspect ratio.
  - **Location**: The component that renders `<Image src="/bmc_qr.png">`. Search the codebase for the source.

### Medium

- **M-1 (revised)**: Bottom nav labels truncate at 800×600 and below. **At 1920×1080 desktop, the bottom nav doesn't exist** — navigation is sidebar-based. **Only applies if narrow-viewport support is in scope.** Fix options (if needed):
  - Reduce the number of bottom-nav tabs (combine some).
  - Use icon-only labels at narrow widths (responsive variant).
  - Add `overflow-x-auto` to allow horizontal scrolling on narrow viewports.
  - Reduce label text length (e.g., "Production" → "Produce").
  - **Location**: The BottomNav component.

### Low

- **L-1**: QR code widget clips at narrow viewport edges (800×600 only — at 1920×1080 desktop it's positioned properly). Verify positioning at 360×640 (mobile). May need to hide on mobile, reposition, or add margin.
- **L-2**: The 27 panels are loaded on first navigation. Verify each panel's loading skeleton is visually consistent (currently `DynamicPanelFallback` provides a generic spinner — verify each panel's actual content doesn't pop in jarringly).
- **L-3**: Verify the "Sign In" button is present and accessible for guests, AND that it disappears / is replaced by a user menu for signed-in users. Currently captured: guests see "Sign In" button at both 800×600 and 1920×1080. Signed-in state not captured.

# Per-Panel Audit TODOs

The following panels require their own visual + code-level audits. Not yet performed in this audit pass. Each entry below is a TODO for a future audit session.

| Panel              | Component file                                    | Status    |
| ------------------ | ------------------------------------------------- | --------- |
| Dashboard          | `src/components/game/DashboardPanel.tsx`          | ⏸ Pending |
| Resource           | `src/components/game/ResourcePanel.tsx`           | ⏸ Pending |
| Factory            | `src/components/game/FactoryPanel.tsx`            | ⏸ Pending |
| FactoryMap         | `src/components/game/FactoryMapPanel.tsx`         | ⏸ Pending |
| Transport          | `src/components/game/TransportPanel.tsx`          | ⏸ Pending |
| Power              | `src/components/game/PowerPanel.tsx`              | ⏸ Pending |
| Market             | `src/components/game/MarketPanel.tsx`             | ⏸ Pending |
| TradingPost        | `src/components/game/TradingPostPanel.tsx`        | ⏸ Pending |
| Research           | `src/components/game/ResearchPanel.tsx`           | ⏸ Pending |
| Worker             | `src/components/game/WorkerPanel.tsx`             | ⏸ Pending |
| Contract           | `src/components/game/ContractPanel.tsx`           | ⏸ Pending |
| Automation         | `src/components/game/AutomationPanel.tsx`         | ⏸ Pending |
| Prestige           | `src/components/game/PrestigePanel.tsx`           | ⏸ Pending |
| Event              | `src/components/game/EventPanel.tsx`              | ⏸ Pending |
| Blueprint          | `src/components/game/BlueprintPanel.tsx`          | ⏸ Pending |
| Onboarding         | `src/components/game/OnboardingPanel.tsx`         | ⏸ Pending |
| Achievement        | `src/components/game/AchievementPanel.tsx`        | ⏸ Pending |
| MegaProject        | `src/components/game/MegaProjectPanel.tsx`        | ⏸ Pending |
| Settings           | `src/components/game/SettingsPanel.tsx`           | ⏸ Pending |
| Statistics         | `src/components/game/StatisticsPanel.tsx`         | ⏸ Pending |
| Leaderboard        | `src/components/game/LeaderboardPanel.tsx`        | ⏸ Pending |
| DailyRewards       | `src/components/game/DailyRewardsPanel.tsx`       | ⏸ Pending |
| Quest              | `src/components/game/QuestPanel.tsx`              | ⏸ Pending |
| NotificationCenter | `src/components/game/NotificationCenterPanel.tsx` | ⏸ Pending |
| Payout             | `src/components/game/PayoutPanel.tsx`             | ⏸ Pending |
| DroneDelivery      | `src/components/game/DroneDeliveryPanel.tsx`      | ⏸ Pending |
| Storage            | `src/components/game/StoragePanel.tsx`            | ⏸ Pending |
| AIAdvisor          | `src/components/game/AIAdvisorPanel.tsx`          | ⏸ Pending |

Each panel audit should verify:

- Empty state (no player save / no data) renders without errors.
- Loading state shows the `DynamicPanelFallback` spinner.
- Error state (network failure) renders a useful message.
- Interactive elements (buttons, forms, hover states) work.
- Responsive layout at the 6 standard viewport sizes.
- Color contrast and keyboard navigation.

# Standardized Cross-Page Audit Rules

The full audit rules apply. See [\_standardized-rules.md](_standardized-rules.md) for the complete, identical ruleset used across all audit files in this directory.

**Specifically relevant to this page:**

- **Responsiveness**: Most critical page in the app. Header, bottom nav, sidebar, and main content must all scale gracefully from 360px to 1920px. The bottom-nav truncation is a known issue.
- **Layout Consistency**: Each of the 27 panels must follow the same layout primitives (cards, headers, spacing) for visual cohesion.
- **Visual Integrity**: All icons (Lucide React library), resource icons, and weather/condition icons must render at the correct size. Verified in captured screenshot — icons render correctly.
- **Interactive Element Functionality**: The speed control buttons (1x, 2x, 5x, 10x), bottom nav tabs, sidebar icons, and "Sign In" button all need hitbox verification.
- **State Rendering**: Multiple states per panel: loading, empty, error, with-data, with-selection, with-confirmation-dialog. Each must be tested individually per panel.
- **Accessibility**: 8 bottom-nav items need keyboard navigation testing (arrow keys, Tab order). Sidebar icons need `aria-label` verification.
