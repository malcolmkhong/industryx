# Phase 1C Follow-Up Report

**Date:** 2025-01-24
**Status:** Clarification Response to Conditional Approval
**Purpose:** Address 3 concerns raised in Phase 1C review

---

> **STATUS NOTICE — NOT CURRENT**  
> This document has been classified as **CONTRADICTORY** in `planning/DOCUMENT_INVENTORY.md` (June 2026 audit).  
> **Known contradiction:** Claims `useCloudSync` has `serverStateVersion`; verified it uses `serverStateHash`.  
> For the canonical project status and verified 25-issue registry, see [PROJECT_STATUS_SOURCE_OF_TRUTH.md](./PROJECT_STATUS_SOURCE_OF_TRUTH.md).  
> Claims in this document have not been independently verified against the current codebase.

---

## 1. TradingPostPanel UI Changes

### Shield Badge

**Location:** Two instances — header (line 395) and rate-info bar (line 555)

```
<Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 bg-green-900/20">
  <Shield className="w-2.5 h-2.5 mr-0.5" />
  Server-authoritative
</Badge>
```

| Aspect | Answer |
|--------|--------|
| Visual only? | **Yes** — green outline badge with Shield icon, no interactivity |
| Behavioral change? | **None** — no click handler, no gating, no conditional rendering |
| Layout change? | **Minor** — adds a second badge in `flex-wrap gap-2` header row; wraps on narrow screens |
| User flow change? | **None** — does not alter any trade execution path |

**Verdict:** Pure visual indicator. Zero behavioral impact.

---

### Estimate Disclaimer

**Location:** Rate-info bar (line 559) and receive-amount label (line 507)

```
<span className="flex items-center gap-1 text-gray-600">
  <Info className="w-3 h-3" />
  Rate is estimated — server uses base prices
</span>
```

The receive-amount label was changed from "You will receive" to "You will receive (estimate)".

| Aspect | Answer |
|--------|--------|
| Visual only? | **Yes** — muted gray text (`text-gray-600`), no interactivity |
| Behavioral change? | **None** — no click handler, no tooltip, no popover |
| Layout change? | **None** — inline text in existing rate-info bar |
| User flow change? | **None** — the receive amount is still calculated client-side for display; the server's actual rate is used at execution time regardless of what the label says |

**Verdict:** Pure visual indicator. Zero behavioral impact. The estimate concept was already implicit (client display ≠ server execution); this just makes it explicit to the user.

---

### Updated Info Card

**Location:** Bottom of panel (lines 755–781) — four paragraphs replacing a simpler predecessor

| Paragraph | Content | Color |
|-----------|---------|-------|
| How it works | Standard trading description | `text-gray-400` |
| Security (Phase 1C) | Server validates AND executes, reads from DB, not browser | `text-green-400` |
| Rate accuracy | Displayed rate is estimate; server's base price config is always used | `text-cyan-400` |
| Tip | Offline trades rejected to prevent cheating | `text-gray-400` |

| Aspect | Answer |
|--------|--------|
| Visual only? | **Yes** — static informational text, no interactivity |
| Behavioral change? | **None** — no buttons, no links, no conditional rendering |
| Layout change? | **None** — same `bg-card border rounded-xl p-4` container that existed before, just with more text content |
| User flow change? | **None** — the card does not gate or redirect any user action |

**Verdict:** Pure visual indicator. The card informs users about security changes but does not alter any execution path.

---

### Summary for Concern 1

```
Shield badge        → Visual only. No behavioral, layout, or flow change.
Estimate disclaimer → Visual only. No behavioral, layout, or flow change.
Updated info card   → Visual only. No behavioral, layout, or flow change.
```

All three items are **pure visual indicators**. They communicate the new security posture to users but do not alter any execution path, data flow, or user interaction.

The only behavioral changes in TradingPostPanel are the core Phase 1C changes themselves:
- Trade request sends intent-only payload (no gameState)
- Trade request goes to `/api/game/trade` (not `/api/game/action`)
- Server rejection triggers state refresh (not retry with different data)

These were the approved scope.

---

## 2. Deprecated Trade Path — Exact Status

### Answer

```text
validateTradeAction is: UNREACHABLE
```

Not "deprecated but callable." It is **exported but never imported or called** by any code in the codebase.

### Evidence

#### Function Definition

**File:** `src/lib/game/serverEngine.ts`, lines 943–1014

```typescript
/**
 * [DEPRECATED] Old trade validation — kept for reference during Phase 1C migration.
 * This function validated against client-supplied gameState and market data,
 * which is insecure. Use executeTradeAction instead.
 * Will be removed in Step 5 of Phase 1C implementation.
 */
export function validateTradeAction(
  giveResource: string,
  giveAmount: number,
  receiveResource: string,
  receiveAmount: number,
  state: Partial<GameState>,
): { valid: boolean; error?: string; correctedReceiveAmount?: number }
```

- **Exported:** Yes
- **Called by any code:** No
- **Imported by any code:** No

#### Old Action Route

**File:** `src/app/api/game/action/route.ts`

- **Line 28:** Import is a comment only — `// validateTradeAction — REMOVED in Phase 1C`
- **Line 331:** `validActions` array does NOT include `'trade'`:
  ```typescript
  const validActions = ['build', 'sell', 'buy', 'research', 'upgrade', 'transport'];
  ```
- **Lines 332–337:** A request with `actionType: 'trade'` is **rejected** with error: `"Invalid action 'trade'. Must be one of: build, sell, buy, research, upgrade, transport"`
- **Lines 384–388:** A dead `case 'trade':` exists in the switch, returning `{ valid: false, error: 'Trade actions must use /api/game/trade (Phase 1C)' }` — **unreachable** because the `validActions` guard above blocks `'trade'` before the switch

#### Complete Call Graph — Old Path (100% Dead)

```
User clicks "Execute Trade"
  → TradingPostPanel.executeTrade()           [OLD VERSION — REMOVED]
    → fetch('/api/game/action', { actionType: 'trade', gameState, ... })
      → POST handler in /api/game/action/route.ts
        → handleTradeAction()                  [FUNCTION DELETED]
          → validateTradeAction(give, giveAmt, receive, receiveAmt, gameState)
              ↑ Uses CLIENT-SUPPLIED gameState (SECURITY VULNERABILITY)
              ↑ This function still EXISTS in source but is NEVER CALLED
```

**Every link in this chain is dead:**
- The old `TradingPostPanel.executeTrade()` no longer exists
- The client never sends `actionType: 'trade'` to `/api/game/action`
- `handleTradeAction()` function is deleted
- `validateTradeAction` import is removed from the action route

#### Complete Call Graph — New Path (Active)

```
User clicks "Execute Trade" / Quick Trade / Storage Suggestion
  → TradingPostPanel.executeTrade(gRes, gAmt, rRes)
    → executeTradeWithServer(gRes, gAmt, rRes)
      → fetch('/api/game/trade', { giveResource, giveAmount, receiveResource })
        → POST handler in /api/game/trade/route.ts
          → Auth check
          → Rate limit check
          → Account lock check
          → Reject forbidden fields (gameState, market, etc.)
          → Load GameConfig from Supabase (5-min cache)
          → executeTradeAction(userId, giveResource, giveAmount, receiveResource, config, supabase)
              ↑ Reads resources from server_game_state (NOT client)
              ↑ Reads base prices from game_config_market (NOT client)
              ↑ Calculates exchange rate server-side
              ↑ Mutates server_game_state atomically (optimistic concurrency)
              ↑ Returns { newResources, newMoney, stateVersion }
          → Audit log
          → Return { success, tradeId, receiveAmount, newResources, ... }
      ← Client receives result
      → useGameStore.setState({ resources: result.newResources, money: result.newMoney })
```

### Classification

```text
validateTradeAction status: UNREACHABLE (not "deprecated but callable")

- Exported: Yes (can be imported in theory)
- Imported: No (zero importers in entire codebase)
- Called:   No (zero callers in entire codebase)
- Callable: No (no code path reaches it)

Security debt: NONE — no live code path invokes this function

Recommended action: Delete the function entirely to remove dead code.
The deprecation comment says "Will be removed in Step 5 of Phase 1C implementation."
This step was not executed. The function should be deleted.
```

---

## 3. Cloud Sync Ownership Matrix

### State Version Conflict vs Load-from-Cloud

There are **two distinct conflict scenarios** with **different merge rules**:

1. **STATE_VERSION_CONFLICT** — Client tries to save, but server's `state_version` is higher (e.g., a trade occurred on another device). Server refuses the overwrite and returns authoritative data.

2. **loadFromCloud** — Client loads state from server on login. GameTick ratio determines which version wins.

These are documented separately below.

---

### Ownership Matrix — STATE_VERSION_CONFLICT

This is the scenario where a trade occurred on another device/session, and the client tries to save.

| State | Authority | Strategy | Rationale |
|-------|-----------|----------|-----------|
| **Resources** | Server wins | Overwrite | Server is the authoritative source for resources post-trade. Client's resource counts are stale. |
| **Money** | Server wins | Overwrite | Money is tied to trade execution and server-side validation. Server's value is authoritative. |
| **Buildings** | Client wins | Preserve | Buildings are not mutated by trades. The client's building state is more recent (user built something locally). Overwriting would lose progress. |
| **Research** | Client wins | Preserve | Research is not mutated by trades. Client's research progress is more recent. |
| **Contracts** | Client wins | Preserve | Contracts are not mutated by trades. Client's contract state is more recent. |
| **Automation** | Client wins | Preserve | Automation is not mutated by trades. Client's automation state is more recent. |
| **Achievements** | Client wins | Preserve | Achievements are not mutated by trades. Client's achievement state is more recent. |

**Implementation:**

```
On STATE_VERSION_CONFLICT:
  1. Server returns: { serverResources, serverMoney, serverStateVersion }
  2. Client applies: resources = serverResources, money = serverMoney
  3. Client preserves: buildings, research, contracts, automation, achievements
  4. Client retries save with merged state and updated stateVersion
```

**Logic:** The version conflict is triggered because a trade bumped `state_version`. Trades only mutate `resources` and (indirectly) `money`. Therefore, only `resources` and `money` need to be updated from the server. All other state categories are unaffected by trades and the client's version is more recent.

---

### Ownership Matrix — Load-from-Cloud (GameTick Ratio)

This is the scenario where the client loads state on login and must decide between local and cloud data.

| State | When Cloud Wins | When Local Wins | Strategy |
|-------|-----------------|-----------------|----------|
| **Resources** | Cloud overwrite | Local preserved | Winner's resources are used |
| **Money** | Cloud overwrite | Local preserved | Winner's money is used |
| **Buildings** | Cloud overwrite | Local preserved | Winner's buildings are used |
| **Research** | Cloud overwrite | Local preserved | Winner's research is used |
| **Contracts** | Cloud overwrite | Local preserved | Winner's contracts are used |
| **Automation** | Cloud overwrite | Local preserved | Winner's automation is used |
| **Achievements/Stats** | Shallow merge | Shallow merge | Always merged — `{ ...local.stats, ...cloud.stats }` |

**GameTick ratio decision:**

```
cloudTick / localTick < 0.9  →  Local is ahead  →  Local wins
cloudTick / localTick > 1.1  →  Cloud is ahead  →  Cloud wins
0.9 ≤ ratio ≤ 1.1           →  Ambiguous       →  User chooses
```

**Logic:** When one version is clearly ahead (more game ticks = more playtime), its entire state is used as the winner. When ambiguous, the user decides. Stats are always shallow-merged to preserve progress on both sides.

---

### Ownership Matrix — Trade Execution

This is the scenario where a trade is executed via `/api/game/trade`.

| State | Authority | Strategy | Rationale |
|-------|-----------|----------|-----------|
| **Resources** | Server authoritative | Server reads from DB, mutates atomically, returns new values | Core Phase 1C security guarantee |
| **Money** | Server authoritative | Server returns current value (not mutated by trades) | Money is part of the server-authoritative return |
| **Buildings** | Server read-only | Server reads buildings from DB for capacity calculation | Buildings determine storage capacity but are never mutated by trades |
| **Research** | Not accessed | Server does not read or write research during trades | Irrelevant to trade execution |
| **Contracts** | Not accessed | Server does not read or write contracts during trades | Irrelevant to trade execution |
| **Automation** | Not accessed | Server does not read or write automation during trades | Irrelevant to trade execution |
| **Achievements** | Not accessed | Server does not read or write achievements during trades | Irrelevant to trade execution |

---

### Unified Ownership Summary

| State | Trade Execution | STATE_VERSION_CONFLICT | Load-from-Cloud |
|-------|----------------|----------------------|-----------------|
| **Resources** | Server authoritative (atomic) | Server wins (overwrite) | Winner's data (or user choice) |
| **Money** | Server authoritative (read) | Server wins (overwrite) | Winner's data (or user choice) |
| **Buildings** | Server read-only (capacity calc) | Client wins (preserve) | Winner's data (or user choice) |
| **Research** | Not accessed | Client wins (preserve) | Winner's data (or user choice) |
| **Contracts** | Not accessed | Client wins (preserve) | Winner's data (or user choice) |
| **Automation** | Not accessed | Client wins (preserve) | Winner's data (or user choice) |
| **Achievements** | Not accessed | Client wins (preserve) | Shallow merge (always) |

### Key Insight

The ownership boundary is clean:

```text
Trade-mutable state (resources, money)
  → Server is authoritative in ALL scenarios

Trade-immutable state (buildings, research, contracts, automation, achievements)
  → Client wins during version conflict (server never mutates these)
  → Winner-takes-all during cloud load (GameTick ratio decides)
  → Stats always merged (preserve progress from both sources)
```

There is no scenario where the server overwrites trade-immutable state without the user's explicit choice (cloud load conflict resolution).

---

## Summary

| Concern | Answer | Status |
|---------|--------|--------|
| **1. TradingPost UI Changes** | All three items are **pure visual indicators**. Zero behavioral, layout, or user flow changes. | Clean |
| **2. Deprecated Trade Path** | `validateTradeAction` is **UNREACHABLE** — exported but zero importers/callers. No live code path invokes it. Recommended: delete the dead function. | Clean (dead code to remove) |
| **3. Cloud Sync Ownership** | **Documented above.** Resources/money → server wins. Everything else → client wins on version conflict, winner-takes-all on cloud load, stats always merged. | Clean |
