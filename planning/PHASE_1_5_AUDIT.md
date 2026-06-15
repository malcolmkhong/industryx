# Phase 1.5 Audit: What Already Exists vs What Needs Work

Based on codebase exploration, here's the actual state of 1.5.2, 1.5.4, 1.5.6.

---

## 1.5.4 Guest Gating — EXISTS but BROKEN

**File:** `src/lib/hooks/page/useTabChange.ts`

The hook already defines the gating logic:
- `GUEST_GATED_TABS` map (leaderboard, tradePost, megaprojects)
- When user clicks a gated tab and is unauthenticated, calls `promptLogin(reason)`
- This opens the `LoginFloatingPanel` with the right "reason" config

**Two problems with the existing code:**

1. **Wrong auth check.** Line 28: `if (!user && !authLoading && GUEST_GATED_TABS[tab])`
   - Checks `!user` (user is null)
   - After Phase 1.2, every visitor is auto-signed-in as anonymous, so `user` is **never null**
   - Guests now bypass the gate entirely

2. **Missing stock_market.** The spec requires 4 gated tabs (stock_market, trade_post, leaderboard, mega_project). Only 3 are in the list.

**Fix needed:**
```ts
const GUEST_GATED_TABS: Record<string, LoginPromptReason> = {
  leaderboard: 'leaderboard',
  tradePost: 'trading_post',
  megaprojects: 'mega_project',
  stockMarket: 'stock_market',  // add
};

if (isGuest && GUEST_GATED_TABS[tab]) {
  promptLogin(GUEST_TAB_REASON_MAP[tab]);
  return;
}
```

The `'stock_market'` reason and config already exist in LoginFloatingPanel REASON_CONFIGS (added in Phase 1.5.3).

**Also missing:** API-side gate (return 403 with `code: 'GUEST_GATED'`) on the 4 feature routes:
- `/api/game/trade` and `/api/game/trades`
- `/api/leaderboard` and `/api/leaderboard/submit`
- Whatever route backs mega projects

---

## 1.5.2 Avatar / Display Name — EXISTS but partial

**Files with existing code:**
- `src/components/game/headers/DesktopHeader.tsx` line 80: `const userAvatar = user?.user_metadata?.avatar_url;`
- `src/components/game/GameHeader.tsx` line 145: same
- `MobileHeader.tsx`: **NO** avatar code

**DesktopHeader already renders** (lines 387-396):
```tsx
<button>
  {userAvatar ? (
    <img src={userAvatar} alt="" className="w-5 h-5 rounded-full" />
  ) : (
    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600">
      {userName.charAt(0).toUpperCase()}
    </div>
  )}
  <span>{userName}</span>
</button>
```

**What's missing:**
- `(Guest)` badge next to the name when `isGuest === true`
- MobileHeader has no avatar at all (just a Sign Out button)
- GameHeader (the mobile one) needs the same

**Fix needed (small):**
1. Add `(Guest)` badge in DesktopHeader
2. Add avatar + name to MobileHeader and GameHeader's mobile section

---

## 1.5.6 Account Menu — NOT implemented (uses Tooltip instead)

**The `DropdownMenu` component EXISTS** in the UI library:
- `src/components/ui/dropdown-menu.tsx` (260 lines, full Radix UI implementation)
- Has all sub-components: Root, Trigger, Content, Item, Separator, Label

**But it's NOT used in any header.** The current "user menu" in DesktopHeader is a Tooltip:
- Hover the avatar+name button → menu appears
- This is a poor UX pattern (should be click-to-open)
- Menu items: Save to Cloud, Reload Config, Sign Out
- **No "Manage Account" item** (Phase 1.5.7)

**What needs to change:**
1. Replace the Tooltip-based menu in DesktopHeader with a DropdownMenu
2. Add menu items:
   - "Manage Account" → opens `AccountSettingsModal` (component already exists)
   - "Sign Out" (existing)
3. For guests: show "Bind Account" at the top of the menu
4. Same for GameHeader (the desktop section)

---

## Summary of What Actually Needs to Be Built

| Sub-task | Existing? | Fix needed |
|---|---|---|
| 1.5.1 Header "Sign In" → "Bind Account" for guests | ✅ Done (commit 78b6b4d) | None |
| 1.5.2 Avatar + display name in header | 🟡 Partial | Add `(Guest)` badge, add to MobileHeader/GameHeader mobile |
| 1.5.3 Merge dialog rendering | ✅ Done (commit 78b6b4d) | None |
| 1.5.4 Guest gating (UI side) | 🟡 Exists but broken | Fix `!user` → `isGuest`, add `stock_market` |
| 1.5.4 Guest gating (API side) | ❌ Missing | Add 403 with `code: 'GUEST_GATED'` to 4 feature routes |
| 1.5.5 `?auth=error` toast | ✅ Done (commit 78b6b4d) | None |
| 1.5.6 Account menu in header | 🟡 Tooltip exists | Replace with DropdownMenu, add "Manage Account" + "Bind Account" |
| 1.5.7 Account settings modal | ✅ Done (commit 78b6b4d) | Wire trigger from new DropdownMenu |

**Remaining work estimate: 2-3 hours**

The biggest gaps are:
1. **1.5.4 bug fix** (useTabChange.ts) — 10 minutes
2. **1.5.4 API gates** (4 routes) — 1-2 hours
3. **1.5.6 dropdown menu replacement** (3 headers) — 1 hour

All other pieces are already in place.
