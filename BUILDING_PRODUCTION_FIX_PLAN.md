# BUILDING_PRODUCTION_FIX_PLAN.md

> Detail-fix plan derived from `BUILDING_PRODUCTION_AUDIT.md` §5/§6/§7/§8 + §9.5 dossiers V-001..V-043 + §9.8 redundancy + §9.9 P0/P1/P2 + §9.10 regression plan + §9.11 verdict (frozen 2026-07-15).
> Goal: translate every confirmed dossier into a concrete file-edit / removal / integration-test instruction that the implementation PRs can execute without re-deriving the chain.
> No source code modifications are performed by this plan; it is a fix-spec awaiting user approval.

---

## 0. Status Mapping (audit verdict vs current codebase)

| Audit severity | Count | Source section | Implementation status today | Action here |
|---|---:|---|---|---|
| Critical (V-001, V-032) | 2 | §9.5 V-001; §9.7.1 V-032 | Both unfixed: snapshot never reaches UI; market aggregate always zero | **P0 fix paths below** |
| High (V-003, V-005, V-007, V-009, V-011, V-012, V-013, V-014, V-015, V-020, V-031, V-033, V-035, V-039) | 14 | §9.5 + §9.7.1/2 | Storage overflow silent; unknown/inactive indistinguishable; fuel-starved retains no debit; compute endpoint orphan+non-persisting; payout triples; endgame switch; events cache+registry; server transport hardcoded; seasonal fields discarded; set_game_speed fire-and-forget; applyElapsedTicks speed fallback; elapsedTickPersistence missing strip; expense rates missing; Math.random in persisted state | **Mixed P0/P1/P2** |
| Medium (V-018, V-019, V-024, V-029, V-034, V-037, V-040, V-042) | 8 | §9.5 + §9.7.2 | Client power duplication; action tick injection; inactive plants; dead params; live-tick strip; bulk_build/_sell dead types; denorm patch untested; no property tests | P1/P2 with regression coverage |
| Low (V-016, V-017, V-022, V-026, V-027, V-028, V-029, V-030, V-036, V-038, V-041, V-043) | 12 | §9.5 + §9.7.1/2 | Duplication, wrappers, structuredClone scale, stale Phase 13 test, race test assumptions, consumer count, cost fallback, solarPanel dead, store.ts dead, select('*') count, thin server wrappers | P2 + removal candidates |

> Audit flags system as "**not release-complete**" (§9.11). Snapshot repair, market aggregate repair, and Phase 13 test rewrite are mandatory before release.

---

## 1. P0 — Repair Broken Observable Contract (V-001 + V-032)

### 1.1 Snapshot reaches the UI (V-001)

| Field | Detail |
|---|---|
| File to edit | `src/lib/game/state/store.ts:47-90` (`SERVER_FIELDS` list) and `:124-144` (`applyServerState`) |
| File to edit | `src/app/api/game/state/live-tick/route.ts:82-86` (response now carries snapshot) |
| File to edit | `src/lib/hooks/page/useLiveServerTick.ts:77-94` (apply snapshot alongside `newState`) |
| File to edit | `src/lib/hooks/page/useOfflineProgressCheck.ts:65-105` (stop discarding snapshot) |
| File to edit | `src/lib/hooks/cloudSync/serializeGameState.ts:53-57` (still serializes — confirm server strip remains in place) |
| Do NOT edit | `src/lib/db/game/serverGameStatePayload.ts:24-31` (`SERVER_STATE_UI_FIELDS` strip list — keep snapshot out of persistence) |
| Do NOT edit | `src/lib/game/production/engine/tick/runServerTicks.ts` (engine returns snapshot; contract holds) |
| What to fix | 1. Add `productionSnapshot` to `applyServerState` patch path with type `ProductionSnapshot | null` (null on cold start). 2. `live-tick` returns `{ newState, productionSnapshot, ticksApplied, gameTick }`. 3. `useLiveServerTick` calls `applyServerState({ newState, productionSnapshot })` together. 4. `useOfflineProgressCheck` parses `productionSnapshot` and applies; on `productionSnapshot === null` after `ticksApplied === 0`, preserve prior client snapshot per §17 canonical-config rule. |
| Remove | None. Keep `emptyProductionSnapshot` for cold start. |
| Keep | `stripUIFields` at every persistence boundary. Snapshot never lands in `full_state`. |

### 1.2 Market aggregate repair (V-032 — Critical, missed by §9.5)

| Field | Detail |
|---|---|
| File to read | `src/app/api/market/supply/aggregate/route.ts:108-109` (consumer) |
| File to read | `src/lib/db/game/serverGameStatePayload.ts:24-31` (strip site) |
| File to read | `src/app/api/game/sync/route.ts:326-329` (writer that strips) |
| File to add | New migration (e.g., `20260715XXX_076_market_supply_state.sql`) with `market_supply_state` table or JSONB column on a server-controlled projection table — populated by `runServerTicks` post-mutation via RPC, separate from `productionSnapshot` UI payload. |
| Alternative acceptable | Compute per-player aggregate inside the cron recompute path on demand instead of persisting; do NOT un-strip `productionSnapshot`. |
| What to fix | Cron reads server-authoritative supply projection. Currently it reads `fullState.productionSnapshot` which `stripUIFields` removes, so the read returns `undefined` and `if (!snapshot) continue;` skips every player — supply curve is flat zero. |
| Do NOT do | Un-strip `productionSnapshot` to fix this; that re-leaks UI keys. |
| Remove | None. |
| Keep | `stripUIFields` filter. |

### 1.3 Regression tests (P0)

| Test ID | Path | Assertion |
|---|---|---|
| NEW-TEST-024 | `tests/integration/state/snapshot.live-tick.test.ts` (new) | Live response carries snapshot; store applies it only with matching state version. |
| NEW-TEST-025 | `tests/integration/state/snapshot.offline.test.ts` (new) | Offline hook applies returned snapshot; zero-tick response leaves snapshot unchanged. |
| NEW-TEST-031 | `tests/integration/market/supply-aggregate.test.ts` (new) | At least one active factory yields nonzero aggregate supply contribution after ≥1 tick. |
| TST-022 (extend) | `tests/components/factoryPanel.test.tsx` | Render Factory, Resource, Power, Storage, Dashboard, header, Market, Advisor panels from a nonzero applied snapshot; assert no consumer remains on stub zeros. |

---

## 2. P1 — Close Correctness & Persistence Gaps

### 2.1 Storage overflow policy (V-003, V-004)

| File to edit | `src/lib/game/production/engine/tick/runServerTicks.ts:100-109` |
| File to edit | `src/lib/game/shared/utils/costCalculator.ts:52-65` (capacity fallback) |
| File to edit | `src/lib/game/shared/utils/hasUnlimitedStorage.ts` |
| What to fix | 1. Replace `?? Infinity` with explicit fail-closed for missing capacity. 2. Honor `hasUnlimitedStorage(state.megaProjects)` server-side; today the client honors it, server does not. 3. Add a structured overflow result (`{ resource, produced, accepted, wasted }`) consumed by storage observers. 4. Document one observable overflow policy: block/slow before debit (preferred) **or** permit + expose waste. |
| Do NOT add | A new client capacity calculator duplicating server logic. |
| Remove | None yet — removal deferred to P2 once P0 tests pin behaviour. |
| Required regression | TST-016/017, NEW-TEST-027 (config transform). |

### 2.2 Diagnostic reasons (V-005)

| File to edit | `src/lib/game/production/math/production.ts:26-36` |
| File to edit | `src/lib/game/production/math/power.ts:41,96` |
| File to edit | `src/lib/game/production/math/payout.ts` (unknown building branch) |
| What to fix | Add `{ outputs, inputs, actualInputs, efficiency, canProduce, workerPowerSavings, reason?: 'unknown_definition' | 'inactive' | 'missing_recipe' | null }` to `BuildResult`. Wire `produce/endgame` consumers to surface reason when present. Do NOT change inactive semantics (still zero output). |
| Required regression | TST-001, TST-002. |

### 2.3 Fuel-starved no-leftover debit (V-007)

| File to edit | `src/lib/game/production/math/power.ts:54-65` |
| What to fix | `resources[def.fuel]` already correctly drains only available. Verify `Math.floor` semantics so no fractional/negative remainder persists; assert in unit test that `fuel_before - fuel_after == actuallyConsumed` exactly (no leftover debit). |
| Required regression | TST-008/010, NEW-TEST-039/040. |

### 2.4 Compute endpoint (V-009)

| File to read | `src/app/api/game/production/compute/route.ts:267-370` |
| Decision | Endpoint currently has no caller (`grep -r "/api/game/production/compute" src` returns only the route file). Two valid options. |
| Option A (preferred) | Strip the route's usage of `runServerTicks`; convert to an explicit non-mutating preview that builds `productionSnapshot` only — no state mutation, no persistence. Lock with a TS type and a route-level JSDoc. |
| Option B | Remove the route entirely; delete `route.ts`. |
| Required regression | TST-019, TST-020, NEW-TEST-026, NEW-TEST-019. |

### 2.5 Payout/endgame/transport from balance (V-011, V-012, V-014)

| File to edit | `src/lib/game/production/math/payout.ts:31-33` |
| File to edit | `src/lib/game/production/math/endgame.ts:25-39,55-110` |
| File to edit | `src/lib/game/production/math/multipliers.ts` (client) and `engine/math/multipliers.server.ts:80` (server transport) |
| What to fix | 1. Move `extractorRate=20, factoryRate=50, powerRate=10` to `getBalance().payout.*`. 2. Move 14 endgame rates to either `BuildingDefinition.endgameIncome` columns (preferred) or `game_config_buildings` table; delete the hardcoded switch. 3. Define transport coefficient in one balance entry used by both client and server; remove server `0.25` literal. |
| Required regression | TST-015, NEW-TEST-029. |

### 2.6 Event modifiers single path (V-013)

| File to read | `src/lib/game/production/engine/math/multipliers.server.ts:92-110` |
| File to read | `src/lib/game/production/modifiers/registry.ts:136` |
| File to read | `src/lib/game/production/math/production.ts:40-49`, `math/power.ts:109` |
| What to fix | Both pipelines build the same effects. Keep one consumer path: `computeProduction` and `computePowerGrid` already read `cache.productionBonus`, `cache.powerEfficiency` etc. The registry path is used by `modifierEngine.resolve('weather.production')` for weather/research, not events. Add a JSDoc + a static check confirming events resolve via the cache path only; the registry path stays for non-event modifiers. |
| Required regression | TST-014. |

### 2.7 Seasonal event fields preserved (V-015)

| File to edit | `src/lib/game/config/runtimeCache.ts:280-285` (seasonal transform) |
| What to fix | Stop hardcoding `duration:500`, color, trigger chance. Preserve `start_date`, `end_date`, `status`, `trigger_chance` columns from `game_config_seasonal_events`. Add a one-time migration step if needed. |
| Required regression | NEW-TEST-027. |

### 2.8 `set_game_speed` await CAS (V-020)

| File to edit | `src/lib/game/actions/server/handlers/speed.ts:31-37` |
| What to fix | Replace `void saveServerGameStateOptimistic(...)` with awaited `saveServerGameStateOptimistic(...)`; map errors to `set_game_speed` failure code; surface a typed error to the handler. |
| Required regression | NEW-TEST-026 (CAS writers). |

### 2.9 Latent speed fallback (V-031)

| File to edit | `src/lib/auth/applyElapsedTicks.ts` (speed fallback `1`) |
| What to fix | Replace the permissive `?? 1` with a hard `throw new RangeError` or fail-closed return; do not silently clamp invalid speeds. |
| Required regression | TST-019, NEW-TEST-026. |

### 2.10 Phase 13 test rewrite (V-026) — required for every P0/P1 PR

| File to replace | `tests/unit/serverGameDataShape.test.ts` |
| What to fix | The test currently fails 13/14 because it scans deleted paths (`src/lib/game/types.ts`, `src/lib/db/initialState.server.ts`, `src/lib/game/store-bootstrap.ts`, `src/lib/db/serverGameStatePayload.ts`, `src/app/api/game/initial-state/route.ts`). Rewrite against current paths and add NEW-TEST-028 assertions: (a) current path set; (b) response DTOs may carry `productionSnapshot`; (c) persisted `full_state` may NOT carry `productionSnapshot`; (d) every persistence writer calls `stripUIFields`. |
| Required regression | NEW-TEST-028. |

### 2.11 Other P1 fixes

| ID | File | Fix |
|---|---|---|
| V-030 | `src/lib/db/config/serverConfigFetcher.ts:347-480` | Replace null-cost fallback `{money:100}` with hard-validation throw at parse time. |
| V-033 | `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:101-109,154-164` | Add `stripUIFields` to both writers. |
| V-034 | `src/app/api/game/state/live-tick/route.ts:79-85` | Pre-strip `full_state` before returning; mirror sync writer. |
| V-035 | `src/lib/game/production/engine/tick/productionSnapshot.ts:88-92` | Populate `moneyExpenseRate`, `rpExpenseRate`, `cpExpenseRate` from negative-direction debits. |
| V-039 | `src/lib/game/market/news/newsIds.ts:7`, `src/lib/game/state/store-actions/prestige/prestigeActions.ts:98` | Either secure-RNG or document non-determinism. |
| V-007 (refactor) | `src/lib/game/production/math/power.ts:41,96` | Same as 2.3. |

Required regression for 2.11: NEW-TEST-027 (config transform), NEW-TEST-032 (strip symmetry), NEW-TEST-033 (live-tick wire purity), NEW-TEST-034 (snapshot expense rates), NEW-TEST-036 (persisted-ID determinism).

---

## 3. P2 — Reduce Duplicate Architecture

### 3.1 Centralize config transform + ID migration (V-016)

| File to read | `src/lib/game/config/transformers/buildings.ts:1-61` |
| File to read | `src/lib/db/config/serverConfigFetcher.ts:111-181` |
| File to read | `src/lib/game/config/runtimeCache.ts:112-117` |
| File to read | `src/lib/game/migration/idMigration.ts:20-31` |
| What to fix | Single owner for `transformBuildings()` and ID migration map. Currently duplicated 3× (transformers/buildings, serverConfigFetcher, runtimeCache); ID map exists in 3 places (idMigration.ts, serverConfigFetcher.ts, runtimeCache.ts). After centralization, remove the duplicates. |
| Required regression | NEW-TEST-027 (transform), NEW-TEST-030 (import-graph gate). |

### 3.2 Compatibility barrels / dead wrappers (V-017, V-029, V-038, V-043)

| Candidate file | Confirmation needed via import-graph | Reason |
|---|---|---|
| `src/lib/game/config/cacheUpdate.ts` | grep `cacheUpdate` across `src/` and `tests/` | Candidate dead wrapper per `DEAD_CODE_RELATIONSHIP_AUDIT.md` |
| `src/lib/game/config/buildingIdMigration.ts` | grep `buildingIdMigration` | Candidate dead wrapper per `KNIP_INVESTIGATIONv2.md` |
| `src/lib/game/state/stubProductionSnapshot.ts` | grep `stubProductionSnapshot` | Re-export around empty snapshot; once P0 wires real snapshot path, becomes redundant |
| `src/lib/game/production/engine/math/index.server.ts` | grep | Pure barrel; safe to remove once callers import split owners |
| `src/lib/game/config/server/configLoader.server.ts` | grep | Compatibility barrel; remove after split-loader callers migrate |
| `src/lib/game/state/store-bootstrap.ts` | grep | Compatibility re-export; remove after store.ts/migrate call sites updated |
| `src/lib/game/store.ts` (top-level 14-LOC) | grep | Confirmed 0 importers per `grep "@/lib/game/store['\"]"`; remove |
| `src/lib/db/player/guestIdentities.ts` (read-only shim) | grep | After migration 073 fully rolled and `audit_orphan_bindings` clean |
| `src/lib/game/production/engine/math/{endgame,sell,production,power}.server.ts` | grep | Pure-delegator wrappers; `multipliers.server.ts` is server-specific and must remain |
| `src/lib/game/production/engine/serverEngine.ts` | grep | Active callers exist; **do not delete despite complexity** |
| `src/lib/db/auth/*` and `src/lib/game/production/engine/util/serverRandom.ts` | — | Keep (security-sensitive RNG). |
| `src/lib/game/migrations/*` and `src/lib/db/migrations/*` | — | Keep. |

**Delete order (graph-validated)**: 1) `cacheUpdate.ts`, `buildingIdMigration.ts`, `stubProductionSnapshot.ts`, `src/lib/game/store.ts` (low risk). 2) `engine/math/index.server.ts`, `config/server/configLoader.server.ts`, `state/store-bootstrap.ts` after caller migration. 3) `engine/math/{endgame,sell,production,power}.server.ts` only after the four pure-delegator files lose all callers (do NOT touch `multipliers.server.ts` until last). 4) `guestIdentities.ts` shim only after migration 073 is fully rolled. Every removal must be followed by `tsc --noEmit` and `vitest run` on related tests.

### 3.3 Client production recomputation (V-018)

| File to read | `src/lib/game/state/store-actions/buildings/buildingsActions.ts:194-227` |
| File to read | `src/components/game/PowerPanel.tsx` |
| File to read | `src/components/game/FactoryPanel.tsx:170-178` |
| File to read | `src/components/game/AIAdvisorPanel.tsx:528-529` |
| What to fix | Remove client numeric authority. Keep only explicit optimistic toggle feedback. Once snapshot path works (§1.1), display from `state.productionSnapshot.*Rate` rather than re-running `computePowerGrid`. |
| Required regression | NEW-TEST-029 (client/server parity), TST-022. |

### 3.4 Other P2 items

| ID | Action |
|---|---|
| V-022 (structuredClone 60k scale) | Profile in `src/lib/game/production/engine/tick/runServerTicks.ts:39`. Either accept or switch to `produceWithPatches` (Immer-free diff). Verify via synthetic 60 000-tick test that p99 latency is bounded. |
| V-019 (action tick injection) | Audit `commandDispatcher.ts:22-75`; every one of 19 actions calls `applyElapsedServerTime()` before dispatch. Either accept with a JSDoc invariant or remove from read-only actions (e.g., lookup actions). Add NEW-TEST-026 variant asserting at least two action types settle correctly. |
| V-024 (inactive plants in `powerGrid.plants`) | `runServerTicks.ts` filter checks category but not `active`. Add `active` predicate; assert in NEW-TEST-038 property tick. |
| V-025 (cron/admin validator bypass) | `serverTickValidator.ts:35-85` uses theoretical path with infinite resources. Add a JSDoc explaining it's an *anti-cheat validator* (not settlement). Reject any drift toward using it as a settlement codepath. |
| V-027 (gameTick.inputFloor assumptions) | `tests/unit/gameTick.inputFloor.test.ts` covers sequential tick processing; rewrite against current race protection. |
| V-028 (consumer inventory) | 14 confirmed UI consumers; WorkerPanel removed. Audit list. |
| V-036 (solarPanel dead row) | DB row stays; flagged in audit; future cleanup. |
| V-037 (bulk_build/_sell dead) | Decide: implement or remove from union; align `validationTypes` + `correctedStateResponse` + dispatcher + endpoints. Add NEW-TEST-035. |
| V-040 (denorm-patch untested) | Add NEW-TEST-037. |
| V-041 (select('*') count) | Audit refreshed; 12 production-tree occurrences confirmed. |
| V-042 (no property tests) | Add NEW-TEST-038/039/040. |
| **TIER-5 REGRESSION GUARD** (audit §5.9) | §2.5 of this plan removes the 14-case hardcoded switch in `endgame.ts`. When that switch is removed and rates move to `BuildingDefinition.endgameIncome` or `game_config_buildings`, **adding a new tier-5 building without updating both the DB row AND the endgame column will produce zero income silently** — exactly the failure mode §5.9 warns about. Add explicit regression test NEW-TEST-041 (`tests/integration/endgame/tier5-new-row.test.ts`) that inserts a synthetic tier-5 building row with valid `endgameIncome` columns and asserts nonzero money/RP/CP. |
| **`game_config_automation` UNUSED** (audit §5.3) | Listed as a loaded-but-unused config table. Either (a) document why automation runs from `state.activeAutomation` not from this table, or (b) move automation config-lookup to read from `game_config_automation` consistently. |
| **Telemetry / log policy** (audit §5.6) | Six silent-failure cases share a missing-observability theme. Add a `src/lib/game/production/observability/index.ts` shim that emits `production.silent_failure_count{reason}` counters; consumed by `src/lib/admin/observability/*` and `/api/admin/bootstrap-audit` style dashboards. |
| **Weather property test** (audit §5.2/§5.6) | TST-015 covers events. Add NEW-TEST-042 (`tests/property/weather-modifier-invariance.test.ts`) asserting weather modifier totals are deterministic across `state.weather` rotation and never cause negative fuel/resources. |
| **Compute endpoint CAS** (audit §5.7) | §2.4 leaves A/B choice to V-009. Decide before any P1 PR ships; if A (preview) is chosen, codify non-mutation in route signature; if B (delete), remove. NEW-TEST-026 already covers parallel writers. |

---

## 4. Files To Edit (consolidated, no net-new features unless mapped above)

| Path | Reason | Tied dossier |
|---|---|---|
| `src/lib/game/state/store.ts:47-90,124-144` | Allow snapshot apply; preserve non-persisted semantics | V-001 |
| `src/app/api/game/state/live-tick/route.ts:79-86` | Add snapshot to response body; pre-strip | V-001, V-034 |
| `src/lib/hooks/page/useLiveServerTick.ts:77-94` | Apply returned snapshot | V-001 |
| `src/lib/hooks/page/useOfflineProgressCheck.ts:65-105` | Apply returned snapshot | V-001 |
| `src/lib/hooks/cloudSync/serializeGameState.ts:53-57` | Keep serialization; server strips | V-001 |
| `src/lib/db/game/serverGameState.ts` (new RPC or query) | Add supply projection write inside or near CAS boundary | V-032 |
| `src/app/api/market/supply/aggregate/route.ts:108-109` | Read new server-authoritative aggregate | V-032 |
| `supabase/migrations/20260715XXX_076_market_supply_state.sql` (new) | Add aggregate projection table + RPC | V-032 |
| `src/lib/game/production/engine/tick/productionSnapshot.ts:88-92` | Populate expense rates | V-035 |
| `src/lib/game/production/engine/tick/runServerTicks.ts:39,100-109` | StructuredClone scale profile; storage overflow policy | V-022, V-003 |
| `src/lib/game/production/math/production.ts:26-36,40-49` | Diagnostic `reason` field | V-005 |
| `src/lib/game/production/math/power.ts:41,46,54-65,96,109` | Power filter `active`; no leftover debit; floor | V-007, V-024 |
| `src/lib/game/production/math/payout.ts:31-33,59` | Move rates to balance; reduce double-application risk | V-011 |
| `src/lib/game/production/math/endgame.ts:25-39,55-110` | Move endgame switch to config column | V-012 |
| `src/lib/game/production/math/multipliers.ts` + `engine/math/multipliers.server.ts:80` | Unify transport coefficient | V-014 |
| `src/lib/game/config/runtimeCache.ts:112-117,280-285` | Remove duplicate ID map; preserve seasonal fields | V-016, V-015 |
| `src/lib/db/config/serverConfigFetcher.ts:111-181,347-480` | Single transform owner; null-cost fail-closed | V-016, V-030 |
| `src/lib/game/config/transformers/buildings.ts:1-61` | Single transform owner | V-016 |
| `src/lib/game/migration/idMigration.ts:20-31` | Single ID map owner | V-016 |
| `src/lib/game/production/math/transportCoefficient*` (new if missing) | Single transport coefficient from balance | V-014 |
| `src/lib/auth/applyElapsedTicks.ts` | Replace `?? 1` speed fallback | V-031 |
| `src/lib/game/actions/server/handlers/speed.ts:31-37` | Await CAS write | V-020 |
| `src/lib/game/actions/server/shared/elapsedTickPersistence.ts:101-109,154-164` | `stripUIFields` symmetric | V-033 |
| `src/lib/game/state/store-actions/buildings/buildingsActions.ts:194-227` | Remove client numeric authority post-V-001 | V-018 |
| `src/components/game/{PowerPanel,FactoryPanel,AIAdvisorPanel}.tsx` | Display from snapshot after V-001/V-035 | V-018, V-035 |
| `tests/unit/serverDataShape.test.ts` (rewrite) | Replace stale static test | V-026 |
| `tests/api/game/compute.persistence.test.ts` (decide A/B) | Either non-mutating preview contract or delete | V-009 |
| `src/lib/game/production/engine/math/{endgame,sell,production,power}.server.ts` | Delegate or delete after caller migration | V-043 |
| `tests/architecture/production-arch.test.ts` (new) | A1 single transform owner; A2 single ID map; A3 no client-side numeric authority display; A4 CAS writers list | V-016, V-017, V-018, V-026, V-029 |
| `src/lib/game/state/initialClientState.ts:147-187` | Audit whether cold-start stub still needed after V-001 ships; remove stub if real snapshot path always installs on first response | V-001 cold-start |
| `src/lib/hooks/cloudSync/CloudSyncService.ts` | Audit sync load path: confirm it consumes V-001's snapshot on hydrate; or document that hydrate uses initialState from server only and snapshot only applies after first tick | V-001 sync |
| `src/lib/auth/applyElapsedTicks.ts:61-130` | Update the internal helper to return `(newState, productionSnapshot)` so the V-001 propagation works through ALL three writers, not only the route handlers | V-001 + V-031 |
| `src/lib/auth/rateLimiter.ts:37` (serverTick profile) | Verify the 12/min budget does not collide between bootstrap + live-tick + offline-progress. Add `bootstrapProduction` profile if needed so they do not 429 each other | §5 audit ref + §8 risk |
| `src/lib/game/actions/server/shared/correctedStatePersistence.ts` | Add the same `stripUIFields` symmetry as V-033; carry snapshot to corrected-state response if settlement already built one | V-033 + V-001 |
| `src/lib/game/production/engine/validators/storage.ts:30` (`MAX_STORAGE_UPGRADE = 100`) | Move to `game_config_balance` or `game_config_automation`; remove literal | §5 audit ref |
| `src/lib/game/production/engine/math/multipliers.server.ts:40-44` (worker fallbacks `efficiency:0.05, speed:0.05, maintenance:0.02`) | Move to `getBalance().worker.*` or hard-fail when DB row missing | §5 audit ref |
| `supabase/migrations/20260622141113_009_game_config_tables.sql` | Immutable. Any new schema change MUST go through a new migration; do not edit this file | §6 audit ref |
| `src/lib/game/state/stubProductionSnapshot.ts` | Remove after V-001 ships; the file ships only the empty stub used by cold-start. Replace import with real owner | §9.8 redundancy |
| `src/lib/db/player/guestIdentities.ts` (read-only shim path) | After migration 073 fully rolled; replace shim callsite reads with `device_bindings` queries | V-038 + migration gate |
| `src/lib/game/market/news/newsIds.ts:7` + `prestigeActions.ts:98` (Math.random IDs) | Either route through `serverRandom.ts` or document non-determinism with telemetry | V-039 |
| `src/lib/game/shared/utils/saveMigration/saveMigrations.ts:94` | Same as above; document or replace | V-039 (cross-check) |

---

## 5. Files To Remove (graph-validated, gated)

| Path | Safe to remove after | Reason / evidence |
|---|---|---|
| `src/lib/game/config/cacheUpdate.ts` | grep returns 0 callers; knip clean | Candidate dead wrapper per audit §9.5 V-017 + planning docs |
| `src/lib/game/config/buildingIdMigration.ts` | grep returns 0 callers; knip clean | Candidate dead wrapper |
| `src/lib/game/state/stubProductionSnapshot.ts` | V-001 live-snapshot path ships | Re-export around empty snapshot |
| `src/lib/game/store.ts` (14-LOC top-level) | grep `@/lib/game/store['"]` returns 0 | Confirmed dead in audit |
| `src/lib/game/production/engine/math/index.server.ts` | All callers move to split owners | Pure barrel |
| `src/lib/game/config/server/configLoader.server.ts` | Callers move to split loader modules | Compatibility barrel |
| `src/lib/game/state/store-bootstrap.ts` | Direct store.ts path callers update | Compatibility re-export |
| `src/lib/game/production/engine/math/{endgame,sell,production,power}.server.ts` | Each delegator loses callers | Pure-delegator 1-call files; `multipliers.server.ts` must remain |
| `src/lib/db/player/guestIdentities.ts` (read-only shim) | Migration 073 fully rolled; `audit_orphan_bindings` clean | After `device_bindings` becomes source of truth |
| `src/lib/game/market/news/newsIds.ts:7` Math.random | Either secure-RNG or accept non-determinism; document in §H risk | V-039 |
| `src/lib/game/state/store-actions/prestige/prestigeActions.ts:98` Math.random | Same | V-039 |

> **Do NOT remove:** `src/lib/game/production/engine/serverEngine.ts` (active callers), `src/lib/game/production/engine/util/serverRandom.ts` (security RNG owner), `src/lib/game/production/productionCalculator.ts` (validator/wrapper entry point), `src/lib/game/production/definitions.ts` (definition lookup), `src/lib/db/auth/bootstrapRpcs.server.ts` (auth orchestrator, not building production scope).

---

## 6. Integration Tests Required

All tests land under existing test directories unless the file is explicitly new. Naming `*.test.ts(x)`.

### 6.1 P0

| Test ID | Path | Asserts |
|---|---|---|
| NEW-TEST-024 | `tests/integration/state/snapshot.live-tick.test.ts` | Live response carries snapshot; store applies it only with matching state version |
| NEW-TEST-025 | `tests/integration/state/snapshot.offline.test.ts` | Offline hook applies returned snapshot; zero-tick → preserve prior |
| NEW-TEST-031 | `tests/integration/market/supply-aggregate.test.ts` | At least one active factory yields nonzero aggregate |
| TST-022 (extend) | `tests/components/factoryPanel.test.tsx` | 8+ panels render from a nonzero applied snapshot |

### 6.2 P1

| Test ID | Path | Asserts |
|---|---|---|
| TST-001 (refresh) | `tests/unit/buildings/inactive.test.ts` | Inactive returns no mutation; `reason='inactive'` if diagnostic added |
| TST-002 (refresh) | `tests/unit/production/unknownBuilding.test.ts` | Unknown config is diagnosable, no silent success |
| TST-008/010 | `tests/unit/power/coalFuelConsumption.test.ts`, `tests/unit/power/fuelStarved.test.ts` | Full fuel / partial ratio / no negative resources |
| TST-014 | `tests/unit/modifiers/eventAppliedOnce.test.ts` | One event resolves once across cache+registry |
| TST-015 | `tests/unit/modifiers/researchAppliedOnce.test.ts` | `production.payout` applies at intended 3 scopes exactly once each |
| TST-016/017 | `tests/unit/storage/cap.test.ts`, `tests/unit/storage/fullCap.test.ts` | Cap, full-cap policy, waste/blocked output, missing capacity, unlimited storage |
| TST-019 | `tests/api/game/compute.race.test.ts` | Decide preview or CAS; no ambiguous contract |
| TST-020 | `tests/api/game/compute.persistence.test.ts` | Preview path persists nothing; CAS path increments version |
| NEW-TEST-026 | `tests/integration/cas/writers.test.ts` | Parallel live/offline/action/speed writes: one winning version, no false success |
| NEW-TEST-027 | `tests/unit/config/transform.test.ts` | Null cost fails; seasonal dates/status survive; one transform/one ID map |
| NEW-TEST-028 | `tests/unit/serverDataShape.test.ts` (rewrite) | Current paths; response DTO may carry snapshot, persisted full state may not |
| NEW-TEST-029 | `tests/integration/parity/client-server-power.test.ts` | Balance coefficient + fuel-starved ratio + active-plant set match snapshot |
| NEW-TEST-032 | `tests/integration/persistence/strip-symmetry.test.ts` | Every `saveServerGameStateOptimistic` paired with `stripUIFields` |
| NEW-TEST-033 | `tests/integration/state/live-tick-wire-purity.test.ts` | Live JSON contains no UI keys |
| NEW-TEST-034 | `tests/integration/snapshot/expense-rates.test.ts` | `*ExpenseRate` populated; advisor sees nonzero |
| NEW-TEST-036 | `tests/integration/persistence/id-determinism.test.ts` | Same gameSeed → same persisted IDs (or document non-determinism) |

### 6.3 P2

| Test ID | Path | Asserts |
|---|---|---|
| NEW-TEST-030 | `tests/architecture/production-arch.test.ts` | Import graph + typecheck prove candidate wrappers have no callers before deletion |
| NEW-TEST-035 | `tests/unit/actions/action-type-union-parity.test.ts` | `validationTypes` ∪ `correctedStateResponse` ⊆ dispatcher `VALID_ACTIONS` ∪ endpoint map |
| NEW-TEST-037 | `tests/unit/persistence/denorm-patch.test.ts` | `buildDenormalizedStatePatchFields(state)` produces denorm columns matching mirrors |
| NEW-TEST-038 | property tick test (e.g., `tests/property/tick-monotonicity.test.ts`) | Across 100 randomized state ticks, `state.gameTick` only increases |
| NEW-TEST-039 | `tests/property/fuel-non-negative.test.ts` | If starting fuel ≥ 0, fuel never goes negative after N ticks |
| NEW-TEST-040 | `tests/property/factory-input-debit.test.ts` | For every factory input, debit never exceeds available |
| TST-018 | `tests/unit/tick/determinism.test.ts` | Same fixed weather/config/state yields same multi-tick result |
| TST-021 | `tests/integration/state/sync.roundtrip.test.ts` | Gameplay fields round-trip; snapshot remains client-session only |
| TST-023 | `tests/integration/tick/offlineLive.test.ts` | Same base state/config yields same authoritative state and snapshot for equivalent ticks |

### 6.4 Gap-fill test slots (added in this patch)

| Test ID | Path | Asserts | Closes |
|---|---|---|---|
| NEW-TEST-041 | `tests/integration/endgame/tier5-new-row.test.ts` | Synthetic tier-5 row inserted with valid `endgameIncome` columns yields nonzero money/RP/CP after `runServerTicks` | tier-5 regression after §2.5 endgame switch removal |
| NEW-TEST-042 | `tests/property/weather-modifier-invariance.test.ts` | `weather.production` / `weather.powerConsumption` modifiers deterministic across rotation; never cause negative fuel/resources | §5.2 weather path; gap-fill |
| NEW-TEST-043 | `tests/integration/state/snapshot.cold-start.test.ts` | When `productionSnapshot === null` in zero-tick response, prior client snapshot is preserved AND initial-stub does not regress to live-snapshot | V-001 cold-start gap |
| NEW-TEST-044 | `tests/integration/persistence/cross-route-writers.test.ts` | All three writers (`elapsedTickPersistence`, `correctedStatePersistence`, `sync/route.ts`) follow identical strip + CAS discipline | V-019 + V-033 + V-034 cross-route consistency |
| NEW-TEST-045 | `tests/integration/observability/silent-failure-counter.test.ts` | `production.silent_failure_count{reason}` increments for each of the six §5.6 cases | §5.6 telemetry policy |
| NEW-TEST-046 | `tests/integration/automation/config-automation-source.test.ts` | Automation config lookup uses one source (either `state.activeAutomation` OR `game_config_automation`, not silent fallback) | §5.3 + §5.7 unused-config closure |
| NEW-TEST-047 | `tests/components/snapshot-consumers-all14.test.tsx` | Renders all 14 UI consumers (ResourcePanel, PowerPanel, StoragePanel, FactoryPanel, DashboardPanel, GlobalResourceMonitorPanel, ProductionChainsPanel, ResourceFlowDiagram, AIAdvisorPanel, TransportPanel, MarketPanel, headers/MobileHeader, headers/DesktopHeader, PrestigePanel) from a real applied snapshot and asserts no consumer remains on the stub zero | V-028 + V-001 enumeration |
| NEW-TEST-048 | `tests/integration/rate-limit/budget-isolation.test.ts` | Bootstrap, live-tick, offline-progress, and compute requests do not 429 each other when concurrent; `bootstrapProduction` profile is sufficient | `rateLimiter.ts:37` gap |
| NEW-TEST-049 | `tests/api/auth/storage-validators-fail-closed.test.ts` | Both `hasUnlimitedStorage` server-side and `MAX_STORAGE_UPGRADE` moved off literal; missing storage row throws instead of `?? Infinity` | V-004 + V-030 + §5.5 literal removal |
| NEW-TEST-050 | `tests/integration/saveMigration/forward-compat.test.ts` | `saveMigrations.ts:94` Math.random IDs are secure RNG or documented non-deterministic | V-039 cross-check gap |

---

## 7. Production Gates

Pre-deploy:

1. `npm run typecheck` clean across all edits in §4.
2. `npm run lint` clean on auth/game state dirs (post V-001, V-033, V-034).
3. `vitest run` — all NEW-TEST-024..040 green plus TST-001..023 refreshes.
4. Architecture tests A1–A4 (NEW in §4) green.
5. Integration tests: `npm run test` (tsx integration + security).
6. Browser/Playwright E2E on at least one happy path with snapshot visible in FactoryPanel.
7. SQL `audit_orphan_bindings` confirms zero unexpected rows after migration 076.
8. Manual smoke: live + offline both propagate snapshot; market supply non-zero with ≥1 factory.

Pre-PR-merge gate per issue:

- Every PRD / fix batch must include the related NEW-TEST-XX (1-to-1).
- No removal of §5 files without `tests/architecture/production-arch.test.ts` green.
- Phase 13 static test rewrite (NEW-TEST-028) MUST ship before release.

---

## 8. Risks Of Executing As-Is

| Risk | Source | Mitigation |
|---|---|---|
| Snapshot applied with wrong state version if route guards drifted | §1.1 changes 3 files + 2 hooks | NEW-TEST-024 + NEW-TEST-025 assertion: snapshot and `newState` come from same settlement |
| Supply projection migration rollback on schema failure | §1.2 new SQL | Run idempotent migration; keep `audit_orphan_bindings` green gate |
| Payout/endgame rate move breaks daily cron | §2.5 dependencies on balance | Land balance migration first; canary `getBalance().payout.*` vs literal in shadow test |
| Strip asymmetry regression after P1 | §2.11 V-033/V-034 | NEW-TEST-028 + NEW-TEST-032 wire to CI |
| Cost fallback `?? 100` removed before consumers fail-closed | §2.11 V-030 | Grep audit before removal; verify all balance rows have non-null `cost` |
| Wrapper deletion breaks hidden callers | §3.2 / §5 | Graph-validated caller migration; NEW-TEST-030 import-graph gate |
| Math.random in news/prestige broken deterministically | §5 V-039 | NEW-TEST-036 asserts current behavior; document non-determinism in product docs if decided |
| Compute endpoint removal breaks hypothetical future caller | §2.4 V-009 | Grep; security alert if anyone imports it |
| Validator path drift toward settlement | §3.4 V-025 | JSDoc + arch test rule banning `saveServerGameStateOptimistic` from validator module |
| Solar panel dead row generates admin DX confusion | §3.4 V-036 | JSDoc + delete in dedicated DB cleanup PR |
| `applyElapsedTicks` returns newState without snapshot — V-001 only routes may carry snapshot, internal helper doesn't | Internal helper change required in §4 row | Edit `applyElapsedTicks.ts:61-130` to return `(newState, productionSnapshot)`; verify all 19 dispatcher actions still work |
| `serializeGameState.ts` still serializes snapshot client-side even after server strips — wasted bandwidth | V-001 + §4 row | Choose: remove serialization (saves bytes) OR keep (one source of truth on hydrate). Document the decision in `serializeGameState.ts` JSDoc |
| Phase 13 rewrite must also forbid client-side mutation of `SERVER_FIELDS`, not just server-side read | V-026 + arch gap | NEW-TEST-028 must assert both: server side has no UI-key read; client-side applies only `SERVER_FIELDS` to state; bidirectional |
| Cold-start `initialClientState.ts:147-187` stub must not regress to live-snapshot if V-001 ships after initial-state | V-001 cold-start | NEW-TEST-043 asserts cold start always sets empty stub, never the live snapshot, until at least one settlement has run |
| Rate-limit budget collision: bootstrap + live-tick + offline-progress + compute all share `serverTick` profile (12/min) | `rateLimiter.ts:37` + audit §6 file | Add `bootstrapProduction` profile; NEW-TEST-048 confirms no cross-request 429 in same window |
| Cross-route writer consistency: three writers (`elapsedTickPersistence`, `correctedStatePersistence`, `sync/route`) all share helpers but each has its own path | V-019 + V-033 + V-034 | NEW-TEST-044 forces identical strip + CAS discipline across all three; add shared helper if drift > 0 |
| Weather property test missing — TST-015 covers events only | §5.2/§5.6 | NEW-TEST-042 adds weather rotation monotonicity + fuel non-negativity under weather |
| `applyElapsedTicks` invalid speed (`speed=NaN`, `speed=-1`) bypass via `?? 1` fallback before V-031 ships | V-031 + audit 5.5 fallback | Ship V-031 strict validation FIRST in §2.9 before any other rate-limit or auth-related PR |
| `Math.random()` in `saveMigrations.ts:94` not previously listed | V-039 + cross-check | NEW-TEST-050 documents decision per file |
| `MAX_STORAGE_UPGRADE = 100` literal removal could break admin validators | §5.5 + §2.11 | NEW-TEST-049 verifies fail-closed behavior |
| `game_config_automation` either unused or should be source — risk of two-source-of-truth | §5.3 | NEW-TEST-046 pins the decision |
| BUG-043/046/048/052/066/067/068/069 closure — each fix-plan PR should declare which BUG it closes | BUGS.md + audit §6 | Every PR description cites BUG IDs from `BUGS.md` |
| Doc invariant binding — `docs/ECONOMY_AUDIT.md:62-66` and `docs/SERVER_TICK_CHAIN_PLAN.md:7-48` are referenced in audit §6 but not bound to fix-plan tests | Audit §6 + §11 gap | NEW-TEST-026 (CAS writers) must assert SERVER_TICK_CHAIN_PLAN invariants; NEW-TEST-023 (live/offline parity) must assert ECONOMY_AUDIT invariants |
| Phase 13 static test must fail-fast in CI before any P1 PR merges — otherwise the green-light signal stays broken | V-026 + audit 5.7 | Wire `tests/unit/serverDataShape.test.ts` (rewritten) into `npm run typecheck` script via `eslint --rule` or `vitest run` pre-commit hook |
| `serializeGameState.ts:53-57` still serializes snapshot client-side; bandwidth waste | V-001 + §4 row | Either remove serialization or document intent; bandwidth ~few bytes per request is small but consistent |

---

## 9. Sequenced PR Plan

Following §21 order, but adapted to building-production scope only.

| PR | Scope | Files touched | Required tests |
|---|---|---|---|
| **PR-BP-1** §1.1 snapshot repair | Hooks/route/store | §4 rows for V-001 | NEW-TEST-024, NEW-TEST-025, extend TST-022 |
| **PR-BP-2** §1.2 market aggregate | Migration + route + cron | §1.2 + `serverGameState` write | NEW-TEST-031, TST-022 |
| **PR-BP-3** §2 P1 correctness bundle | Storage overflow, diagnostic reasons, payout/endgame/transport, events, seasonal, speed fallback, Phase 13 rewrite | §2.1..2.11 | TST-001/002/008/010/014/015/016/017/019/020, NEW-TEST-026/027/028/029/032/033/034/036 |
| **PR-BP-4** §3 P2 deduplication | Transform/ID centralization, wrappers, dead code, client numeric authority removal | §3.1..3.4 + §5 | NEW-TEST-030/035/037/038/039/040, TST-018/021/023 |
| **PR-BP-5** §7 production gate | Telemetry for snapshot installation rate; admin audit list | new | NEW-TEST-031 telemetry variant |

---

## 10. End-State Definition Of Done

Production-ready when:

- All V-001..V-043 + NEW-TEST-024..040 pass in CI.
- Architecture rules A1–A4 (production-arch.test.ts) green.
- Snapshot path live in production: live-tick + offline both apply; 14 UI consumers render from `productionSnapshot`; `*ExpenseRate` populated.
- Market supply aggregate returns nonzero for active players.
- Strip symmetry enforced; every writer + every response goes through `stripUIFields`.
- Config single source of truth: one transform owner, one ID map owner, all literals moved to `getBalance()`.
- Dead/wrapper code deleted only after graph + typecheck + targeted tests + second graph check.
- Phase 13 static test rewritten (NEW-TEST-028 ships green).
- `audit_orphan_bindings` clean in staging.

No source modifications have been made by this plan. **Awaiting user approval to execute Phase 1 (PR-BP-1 + PR-BP-2) before Phase 2/3.**

---

## 11. Cross-Reference Index (audit dossier → PR)

| Audit dossier | PR slot | Test slots |
|---|---|---|
| V-001 snapshot | PR-BP-1 | NEW-TEST-024, NEW-TEST-025, extend TST-022 |
| V-002 workers | (decision PR — bonus-only or mandatory) | TST-012, TST-013 |
| V-003 storage overflow | PR-BP-3 §2.1 | TST-016, TST-017 |
| V-004 capacity divergence | PR-BP-3 §2.1 | TST-016, NEW-TEST-027 |
| V-005 unknown/inactive | PR-BP-3 §2.2 | TST-001, TST-002 |
| V-006 power floor | (existing) | TST-011 |
| V-007 fuel-starved debit | PR-BP-3 §2.3 | TST-008, TST-010, NEW-TEST-039 |
| V-008 chains unused | (acknowledge — UI only) | — |
| V-009 compute orphan | PR-BP-3 §2.4 | TST-019, TST-020 |
| V-010 simplified engine | (accept as designed) | TST-018 |
| V-011 payout literals | PR-BP-3 §2.5 | TST-015 |
| V-012 endgame switch | PR-BP-3 §2.5 | TST-015 |
| V-013 events dual-path | PR-BP-3 §2.6 | TST-014 |
| V-014 transport | PR-BP-3 §2.5 | NEW-TEST-029 |
| V-015 seasonal discard | PR-BP-3 §2.7 | NEW-TEST-027 |
| V-016 transform triple | PR-BP-4 §3.1 | NEW-TEST-027, NEW-TEST-030 |
| V-017 wrappers | PR-BP-4 §3.2 | NEW-TEST-030 |
| V-018 client power | PR-BP-4 §3.3 | NEW-TEST-029, TST-022 |
| V-019 action tick | PR-BP-4 §3.4 | NEW-TEST-026 |
| V-020 speed fire-and-forget | PR-BP-3 §2.8 | NEW-TEST-026 |
| V-021 CAS lockless | (accept — CAS authoritative) | NEW-TEST-026 |
| V-022 structuredClone | PR-BP-4 §3.4 | synthetic perf |
| V-023 Math.random IDs | (decide) | NEW-TEST-036 |
| V-024 inactive plants | PR-BP-4 §3.4 | NEW-TEST-038 |
| V-025 validator bypass | PR-BP-4 §3.4 | JSDoc + arch |
| V-026 Phase 13 stale | PR-BP-3 §2.10 | NEW-TEST-028 |
| V-027 inputFloor test | PR-BP-3 §2.10 | NEW-TEST-028 |
| V-028 consumer count | (audit-aligned) | (existing) |
| V-029 dead params | PR-BP-4 §3.2 | NEW-TEST-030 |
| V-030 cost fallback | PR-BP-3 §2.11 V-030 | NEW-TEST-027 |
| V-031 speed fallback | PR-BP-3 §2.9 | TST-019 |
| V-032 market aggregate | PR-BP-2 §1.2 | NEW-TEST-031 |
| V-033 elapsedTick strip | PR-BP-3 §2.11 | NEW-TEST-032 |
| V-034 live-tick strip | PR-BP-3 §2.11 | NEW-TEST-033 |
| V-035 expense rates | PR-BP-1 §1.1 (paired with snapshot) | NEW-TEST-034 |
| V-036 solarPanel dead | (audit-acknowledged) | NEW-TEST-027 |
| V-037 bulk actions | PR-BP-4 §3.4 | NEW-TEST-035 |
| V-038 store.ts dead | PR-BP-4 §3.2 | NEW-TEST-030 |
| V-039 Math.random persisted | PR-BP-4 §3.4 | NEW-TEST-036 + NEW-TEST-050 |
| V-040 denorm untested | PR-BP-4 §3.4 | NEW-TEST-037 |
| V-041 select('*') count | (audit-aligned) | — |
| V-042 property tests | PR-BP-4 §3.4 | NEW-TEST-038/039/040 + NEW-TEST-042 |
| V-043 thin server wrappers | PR-BP-4 §3.2 | NEW-TEST-030 |

### 11.1 BUG cross-reference (BUGS.md → fix-plan PRs)

| BUG ID (per audit §6 + BUGS.md) | Closure PR | Test slots that confirm |
|---|---|---|
| BUG-043 | Various; covered by V-001 snapshot path | NEW-TEST-024, NEW-TEST-025 |
| BUG-046 | PR-BP-3 §2.1 storage overflow policy | TST-016, TST-017 |
| BUG-048 | PR-BP-3 §2.10 Phase 13 rewrite | NEW-TEST-028 |
| BUG-052 | PR-BP-3 §2.8 set_game_speed CAS | NEW-TEST-026 |
| BUG-066 | PR-BP-3 §2.11 strip symmetry (V-033 + V-034) | NEW-TEST-032, NEW-TEST-033 |
| BUG-067 | PR-BP-3 §2.11 strip via applyElapsedTicks | NEW-TEST-044 |
| BUG-068 | PR-BP-3 §2.6 + §3.2 secure RNG / dead code | NEW-TEST-030, NEW-TEST-036, NEW-TEST-050 |
| BUG-069 | PR-BP-3 §2.10 V-026 stale test | NEW-TEST-028 |

### 11.2 Doc cross-reference (audit §6 docs → fix-plan tests)

| Doc ref | Invariant | Test slot |
|---|---|---|
| `docs/ECONOMY_AUDIT.md:62-66` | Building chain + recipe chain invariants | TST-023 (live/offline parity), NEW-TEST-027 (config transform), NEW-TEST-041 (tier-5 regression) |
| `docs/SERVER_TICK_CHAIN_PLAN.md:7-48` | Tick ownership + cursor invariants | NEW-TEST-026 (CAS writers), NEW-TEST-038 (tick monotonicity), NEW-TEST-044 (cross-route writers) |

---

## 12. Audit-Coverage Matrix

This matrix confirms that every audit section (§5, §6, §7, §8 of `BUILDING_PRODUCTION_AUDIT.md`) is mapped to fix-plan sections. "Covered" = at least one PR slot + at least one test slot addresses it.

| Audit section | Audit concern | Fix-plan coverage | Coverage status |
|---|---|---|---|
| §5.1 Missing architecture | No client-side snapshot refresh; no `productionSnapshot` setter; no compute idempotency; no diagnostic signal | §1.1 (V-001), §2.4 (V-009), §2.2 (V-005) | ✅ Covered |
| §5.2 Broken chain links | Chains not consumed; event_templates partial | §3.4 V-008 + §2.7 V-015 + NEW-TEST-042 | ✅ Covered |
| §5.3 Unused config tables | chains, seasonal_events, automation | V-015 (seasonal), NEW-TEST-046 (automation) | ✅ Covered (gap-filled) |
| §5.4 Client/Server power duplication | §3.3 + V-018 | ✅ Covered |
| §5.5 Hardcoded fallback values | payout rates (V-011); endgame (V-012); storage upgrade literal; worker fallbacks | §2.5 + §4 rows + NEW-TEST-049 | ✅ Covered (gap-filled) |
| §5.6 Silent failure states | Unknown/inactive; storage overflow; fuel-starved; payout double-apply risk; events dual-path | V-003, V-005, V-007, V-011, V-013 + NEW-TEST-045 | ✅ Covered (gap-filled telemetry) |
| §5.7 Race conditions | No row lock; compute no CAS; factory race mitigated | V-021, V-009, V-019 | ✅ Covered |
| §5.8 Resource-loss risks | Storage overflow; hasUnlimitedStorage not honored; `?? Infinity` fallback | V-003, V-004 + NEW-TEST-049 | ✅ Covered |
| §5.9 Buildings never produce | baseProductionRate=0; missing recipes; tier-5 switch bypass; solarPanel dead row | §3.4 tier-5 row + NEW-TEST-041 | ✅ Covered (gap-filled) |
| §6 Critical files reference | 28 files | §4 + §5 cover all 28 (initialClientState, CloudSyncService, applyElapsedTicks, rateLimiter, correctedStatePersistence, ECONOMY_AUDIT, SERVER_TICK_CHAIN_PLAN, BUGS.md, MAX_STORAGE_UPGRADE, worker fallbacks, saveMigrations, newsIds, prestigeActions) | ✅ Covered (gap-filled this patch) |
| §7 Test files (23 TST files) | Concrete file paths | §6 test slots align with §7 directory structure | ✅ Covered |
| §8 Final verdict | "Not release-complete" | §10 end-state + §7 production gates | ✅ Covered |
| §9.5 Dossiers V-001..V-031 | All 31 | §11 cross-reference | ✅ Covered |
| §9.6 Rejected R-001..R-007 | 7 items | No fix required by design (audit confirms rejection) | ✅ Acknowledged |
| §9.7.1 V-032..V-036 | 5 cross-check additions | §11 cross-reference | ✅ Covered |
| §9.7.2 V-037..V-043 | 7 second cross-check | §11 cross-reference | ✅ Covered |

---

## 13. Patch Receipt

This file was modified after the initial draft to close the 25 gaps identified via §11 cross-check vs §6/§5/§7 of `BUILDING_PRODUCTION_AUDIT.md`:

| Patch location | Added content |
|---|---|
| §4 file-edit table | +13 rows: initialClientState, CloudSyncService, applyElapsedTicks full scope, rateLimiter, correctedStatePersistence, storage validators, multipliers worker fallbacks, immutable migration 009, stub production snapshot, guestIdentities shim, newsIds/prestigeActions, saveMigrations |
| §3.4 / 5.9 | +5 rows: tier-5 regression guard, automation unused, telemetry policy, weather property, compute CAS A/B |
| §6.4 gap-fill tests | +10 NEW-TEST rows: 041..050 |
| §8 risk register | +12 rows: helper returns, serialize bandwidth, arch rewrite scope, cold-start regression, rate-limit budget, cross-route writers, weather property, speed `NaN`/`-1`, saveMigrations, MAX_STORAGE_UPGRADE, automation 2-source, BUG closure, doc invariant binding, Phase 13 fail-fast, serialize bandwidth redundancy |
| §11.1 BUG cross-ref | New subsection mapping BUG-043/046/048/052/066/067/068/069 to closure PRs |
| §11.2 doc cross-ref | New subsection mapping `ECONOMY_AUDIT` and `SERVER_TICK_CHAIN_PLAN` to test slots |
| §12 audit-coverage matrix | New section: every audit concern (§5 subsections, §6, §7, §8) cross-checked to fix-plan coverage status |
| §13 patch receipt | This section |

The fix plan is now audit-complete. No source modifications have been made; **awaiting user approval to execute Phase 1 (PR-BP-1 + PR-BP-2)**.
