# lib/game Spaghetti Code Refactor Plan

Purpose: identify mixed-responsibility files in `src/lib/game` and document a second-pass cleanup plan after the first path migration.

Rule for this document:

- Each file section talks only about that file.
- `NEW` means proposed new folder or file for a later refactor pass.
- Do not move or split files until imports, tests, and ownership are checked for that specific batch.
- First priority is ownership clarity: pure math, server authority, client orchestration, UI metadata, persistence, and config should not live in the same file.

## `src/lib/game/actions/client/actionValidator.ts`

Current role: client bridge that calls server actions and normalizes validation results for store actions.

Problem: medium spaghetti risk. It is close to correct, but it still owns both server-call result interpretation and client-facing validation shape.

Required standard fix:

```text
src/lib/game/actions/client/
|-- actionValidator.ts
|-- NEW resultMapper.ts
`-- NEW validationTypes.ts
```

## `src/lib/game/actions/client/serverActions.ts`

Current role: client network wrapper for server-backed game actions and sync.

Problem: medium spaghetti risk. It mixes endpoint selection, request construction, response validation, error mapping, and sync persistence calls.

Required standard fix:

```text
src/lib/game/actions/client/
|-- serverActions.ts
|-- NEW endpoints.ts
|-- NEW requestBuilder.ts
|-- NEW responseParser.ts
`-- NEW errorMapper.ts
```

## `src/lib/game/actions/server/actionCommandRunner.ts`

Current role: dispatches validated server commands and applies corrected-state response shaping.

Problem: medium spaghetti risk. Command dispatch and corrected-state response finalization are coupled.

Required standard fix:

```text
src/lib/game/actions/server/
|-- actionCommandRunner.ts
|-- NEW commandDispatcher.ts
`-- NEW correctedStateResponse.ts
```

## `src/lib/game/actions/server/handlers/actionHandlers.ts`

Current role: maps action commands to server engine validation/mutation functions.

Problem: high spaghetti risk. One file contains handlers for building, trade, research, transport, prestige, drones, workers, quests, rewards, contracts, payout, storage, and speed.

Required standard fix:

```text
src/lib/game/actions/server/handlers/
|-- actionHandlers.ts
|-- NEW buildings.ts
|-- NEW market.ts
|-- NEW research.ts
|-- NEW transport.ts
|-- NEW prestige.ts
|-- NEW drones.ts
|-- NEW workers.ts
|-- NEW quests.ts
|-- NEW rewards.ts
|-- NEW contracts.ts
|-- NEW payouts.ts
|-- NEW storage.ts
`-- NEW speed.ts
```

## `src/lib/game/actions/server/shared/actionConfig.ts`

Current role: loads server action config and transforms Supabase config rows.

Problem: medium spaghetti risk. Config fetching, DB row mapping, defaults, and action-time config shape live together.

Required standard fix:

```text
src/lib/game/actions/server/shared/
|-- actionConfig.ts
|-- NEW actionConfigLoader.ts
|-- NEW actionConfigTransformers.ts
`-- NEW actionConfigTypes.ts
```

## `src/lib/game/actions/server/shared/actionContext.ts`

Current role: loads server action context, including user state and timing data.

Problem: medium spaghetti risk. Context creation combines state loading, elapsed-time settlement expectations, and request-owned metadata.

Required standard fix:

```text
src/lib/game/actions/server/shared/
|-- actionContext.ts
|-- NEW actionStateLoader.ts
|-- NEW actionTimingContext.ts
`-- NEW actionRequestContext.ts
```

## `src/lib/game/actions/server/shared/actionPersistence.ts`

Current role: persists post-action server state and corrected state.

Problem: high spaghetti risk. Persistence, merge policy, denormalized columns, audit-oriented output, and corrected-state fallback behavior are coupled.

Required standard fix:

```text
src/lib/game/actions/server/shared/
|-- actionPersistence.ts
|-- NEW correctedStatePersistence.ts
|-- NEW denormalizedStateColumns.ts
|-- NEW stateMergePolicy.ts
`-- NEW actionPersistenceResult.ts
```

## `src/lib/game/actions/server/shared/actionTiming.ts`

Current role: tiny timing helper for server action flow.

Problem: low spaghetti risk. File is already small and focused.

Required standard fix:

```text
src/lib/game/actions/server/shared/
`-- actionTiming.ts
```

## `src/lib/game/actions/server/shared/actionTypes.ts`

Current role: shared server action request/result types.

Problem: low spaghetti risk. File is focused, but should stay type-only.

Required standard fix:

```text
src/lib/game/actions/server/shared/
`-- actionTypes.ts
```

## `src/lib/game/audio/soundEngine.ts`

Current role: browser audio engine and exported singleton.

Problem: medium spaghetti risk. Audio definitions, browser API handling, enabled/volume state, and playback logic live together.

Required standard fix:

```text
src/lib/game/audio/
|-- soundEngine.ts
|-- NEW soundCatalog.ts
|-- NEW audioSettings.ts
`-- NEW browserAudio.ts
```

## `src/lib/game/buildings/buildingDiscovery.ts`

Current role: derives building discovery/grouping from building definitions.

Problem: low spaghetti risk. File is mostly focused.

Required standard fix:

```text
src/lib/game/buildings/
`-- buildingDiscovery.ts
```

## `src/lib/game/catalog/ui/uiCatalog.ts`

Current role: huge UI-facing catalog for buildings, resources, research, quests, contracts, events, and display metadata.

Problem: critical spaghetti risk. One static catalog file owns many unrelated business domains and UI metadata in one place.

Required standard fix:

```text
src/lib/game/catalog/ui/
|-- uiCatalog.ts
|-- NEW buildings.ts
|-- NEW resources.ts
|-- NEW research.ts
|-- NEW quests.ts
|-- NEW contracts.ts
|-- NEW events.ts
|-- NEW workers.ts
|-- NEW transport.ts
|-- NEW drones.ts
|-- NEW prestige.ts
|-- NEW market.ts
`-- NEW index.ts
```

## `src/lib/game/config/balance/balanceConfig.ts`

Current role: balance config schema, defaults, runtime state, validation, and accessors.

Problem: high spaghetti risk. It mixes schema/type definition, default values, validation rules, runtime cache, and fail-closed access.

Required standard fix:

```text
src/lib/game/config/balance/
|-- balanceConfig.ts
|-- NEW balanceTypes.ts
|-- NEW balanceDefaults.ts
|-- NEW balanceValidator.ts
|-- NEW balanceRuntime.ts
`-- NEW balanceErrors.ts
```

## `src/lib/game/config/config.ts`

Current role: Supabase row types, transformed config type, row transformers, and browser config loader.

Problem: high spaghetti risk. Raw DB types, game config shape, transformers, and `fetch('/api/admin/config?...')` client loading are in one file.

Required standard fix:

```text
src/lib/game/config/
|-- config.ts
|-- NEW types/
|   |-- supabaseRows.ts
|   `-- gameConfig.ts
|-- NEW transformers/
|   |-- buildings.ts
|   |-- resources.ts
|   |-- research.ts
|   |-- market.ts
|   `-- index.ts
`-- NEW client/
    `-- configLoader.client.ts
```

## `src/lib/game/config/configCache.ts`

Current role: runtime config cache, config migration maps, derived production chains, contract templates, helper formatting, and color derivation.

Problem: high spaghetti risk. Cache ownership and derived-domain generation are mixed.

Required standard fix:

```text
src/lib/game/config/
|-- configCache.ts
|-- NEW runtimeCache.ts
|-- NEW buildingIdMigration.ts
|-- NEW derived/
|   |-- productionChains.ts
|   |-- contractTemplates.ts
|   `-- resourceDisplay.ts
`-- NEW cacheUpdate.ts
```

## `src/lib/game/config/server/configLoader.server.ts`

Current role: server-side game config loading from Supabase.

Problem: medium spaghetti risk. Server DB loading, fallback policy, table transforms, and balance loading are coupled.

Required standard fix:

```text
src/lib/game/config/server/
|-- configLoader.server.ts
|-- NEW serverConfigQueries.ts
|-- NEW serverConfigTransformers.ts
|-- NEW serverConfigFallbackPolicy.ts
`-- NEW serverBalanceLoader.ts
```

## `src/lib/game/events/eventArchetypes.ts`

Current role: market/event archetype templates and random event generation.

Problem: medium spaghetti risk. Static archetype definitions and random selection logic live together.

Required standard fix:

```text
src/lib/game/events/
|-- eventArchetypes.ts
|-- NEW archetypeDefinitions.ts
|-- NEW eventSelection.ts
`-- NEW eventRandom.ts
```

## `src/lib/game/market/engine/correlations.ts`

Current role: market resource correlation definitions.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/market/engine/
`-- correlations.ts
```

## `src/lib/game/market/engine/index.ts`

Current role: market engine barrel/export file.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/market/engine/
`-- index.ts
```

## `src/lib/game/market/engine/sectors.ts`

Current role: market sector definitions and sector helpers.

Problem: low to medium spaghetti risk. Mostly focused, but split if sector data and helper logic grow further.

Required standard fix:

```text
src/lib/game/market/engine/
|-- sectors.ts
|-- NEW sectorDefinitions.ts
`-- NEW sectorHelpers.ts
```

## `src/lib/game/market/engine/types.ts`

Current role: market engine types.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/market/engine/
`-- types.ts
```

## `src/lib/game/market/marketSimulator.ts`

Current role: market simulation helper.

Problem: low spaghetti risk. File is small and focused.

Required standard fix:

```text
src/lib/game/market/
`-- marketSimulator.ts
```

## `src/lib/game/market/news/newsBuilder.ts`

Current role: market news packet builders, template banks, anti-repeat selection, fallback text, and ID generation.

Problem: high spaghetti risk. News event modeling, text templates, random template selection, and runtime anti-repeat state are coupled.

Required standard fix:

```text
src/lib/game/market/news/
|-- newsBuilder.ts
|-- NEW eventPackets.ts
|-- NEW templates/
|   |-- priceMove.ts
|   |-- volatility.ts
|   |-- sector.ts
|   `-- trade.ts
|-- NEW templateSelector.ts
|-- NEW fallbackText.ts
`-- NEW newsIds.ts
```

## `src/lib/game/market/news/newsLLM.ts`

Current role: LLM-backed market news generation.

Problem: medium spaghetti risk. Prompt construction, API call, parsing, fallback behavior, and response normalization live together.

Required standard fix:

```text
src/lib/game/market/news/
|-- newsLLM.ts
|-- NEW llmPrompt.ts
|-- NEW llmClient.ts
|-- NEW llmResponseParser.ts
`-- NEW llmFallback.ts
```

## `src/lib/game/market/trade/tradeConstants.ts`

Current role: trade constant compatibility exports.

Problem: low spaghetti risk. Keep small, but remove later if all callers use balance config directly.

Required standard fix:

```text
src/lib/game/market/trade/
`-- tradeConstants.ts
```

## `src/lib/game/migration/idMigration.ts`

Current role: ID migration helpers.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/migration/
`-- idMigration.ts
```

## `src/lib/game/modifiers/modifierEngine.ts`

Current role: modifier engine plus converters from research, prestige, mega-projects, events, and weather.

Problem: high spaghetti risk. Generic engine and domain-specific source conversion are mixed.

Required standard fix:

```text
src/lib/game/modifiers/
|-- modifierEngine.ts
|-- NEW engine.ts
|-- NEW registry.ts
|-- NEW types.ts
`-- NEW sources/
    |-- research.ts
    |-- prestige.ts
    |-- megaProjects.ts
    |-- events.ts
    `-- weather.ts
```

## `src/lib/game/production/engine/serverEngine.ts`

Current role: server production engine, tick runner, weather mutation, action validation, action mutation, corrected-state generation, and ID generation.

Problem: critical spaghetti risk. This is the largest mixed-responsibility file in `src/lib/game`. It combines pure production math, server-authoritative action rules, mutation logic, random runtime events, and response shaping.

Required standard fix:

```text
src/lib/game/production/engine/
|-- serverEngine.ts
|-- NEW tick/
|   |-- runServerTicks.ts
|   |-- productionSnapshot.ts
|   `-- weatherTick.ts
|-- NEW math/
|   |-- multipliers.server.ts
|   |-- power.server.ts
|   |-- production.server.ts
|   |-- sell.server.ts
|   |-- payout.server.ts
|   `-- endgame.server.ts
|-- NEW validators/
|   |-- build.ts
|   |-- trade.ts
|   |-- research.ts
|   |-- upgrade.ts
|   |-- workers.ts
|   |-- transport.ts
|   |-- prestige.ts
|   |-- quests.ts
|   |-- rewards.ts
|   |-- contracts.ts
|   |-- storage.ts
|   `-- drones.ts
|-- NEW mutators/
|   |-- build.ts
|   |-- trade.ts
|   |-- research.ts
|   |-- workers.ts
|   |-- transport.ts
|   |-- prestige.ts
|   |-- quests.ts
|   |-- rewards.ts
|   |-- contracts.ts
|   |-- storage.ts
|   `-- drones.ts
`-- NEW ids.ts
```

## `src/lib/game/production/productionCalculator.ts`

Current role: client/shared production math, power grid, payout, endgame income, and snapshot types.

Problem: high spaghetti risk. It claims single source of truth, but server-specific engine logic also exists. Shared pure math and client fallback behavior need clearer boundaries.

Required standard fix:

```text
src/lib/game/production/
|-- productionCalculator.ts
|-- NEW math/
|   |-- multipliers.ts
|   |-- power.ts
|   |-- production.ts
|   |-- sell.ts
|   |-- payout.ts
|   `-- endgame.ts
|-- NEW snapshot/
|   |-- productionSnapshot.ts
|   `-- emptyProductionSnapshot.ts
`-- NEW definitions.ts
```

## `src/lib/game/progression/tiers.ts`

Current role: tier constants and tier helpers.

Problem: low spaghetti risk. File is focused and acts as SSOT.

Required standard fix:

```text
src/lib/game/progression/
`-- tiers.ts
```

## `src/lib/game/server-time/serverTickValidator.ts`

Current role: server-time validation of elapsed production bounds.

Problem: medium spaghetti risk. Validation policy depends directly on production calculator and server multiplier builder.

Required standard fix:

```text
src/lib/game/server-time/
|-- serverTickValidator.ts
|-- NEW tickBounds.ts
`-- NEW tickValidationPolicy.ts
```

## `src/lib/game/settings/settingsStore.ts`

Current role: client settings Zustand store persisted to local storage.

Problem: low to medium spaghetti risk. Store shape, defaults, persistence options, and actions are together but still acceptable for settings.

Required standard fix:

```text
src/lib/game/settings/
|-- settingsStore.ts
|-- NEW settingsDefaults.ts
|-- NEW settingsTypes.ts
`-- NEW settingsPersistence.ts
```

## `src/lib/game/shared/constants/saveVersion.ts`

Current role: save version constant.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/constants/
`-- saveVersion.ts
```

## `src/lib/game/shared/icons/index.ts`

Current role: icon exports.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/icons/
`-- index.ts
```

## `src/lib/game/shared/icons/mappings.ts`

Current role: icon mapping catalog.

Problem: medium spaghetti risk. Many unrelated icon mappings live in one file.

Required standard fix:

```text
src/lib/game/shared/icons/
|-- mappings.ts
|-- NEW resourceIcons.ts
|-- NEW buildingIcons.ts
|-- NEW researchIcons.ts
|-- NEW uiIcons.ts
`-- NEW effectIcons.ts
```

## `src/lib/game/shared/icons/tiers.ts`

Current role: tier icon helpers.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/icons/
`-- tiers.ts
```

## `src/lib/game/shared/types/types.ts`

Current role: central game types for state, config, domain objects, UI, and server data.

Problem: high spaghetti risk. Many domain types live in one shared file, making ownership unclear and imports too broad.

Required standard fix:

```text
src/lib/game/shared/types/
|-- types.ts
|-- NEW state.ts
|-- NEW buildings.ts
|-- NEW resources.ts
|-- NEW market.ts
|-- NEW production.ts
|-- NEW research.ts
|-- NEW workers.ts
|-- NEW transport.ts
|-- NEW quests.ts
|-- NEW rewards.ts
|-- NEW prestige.ts
|-- NEW notifications.ts
`-- NEW server.ts
```

## `src/lib/game/shared/utils/costCalculator.ts`

Current role: cost calculation helper.

Problem: low spaghetti risk. File is focused, but depends on config cache and production multipliers.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- costCalculator.ts
```

## `src/lib/game/shared/utils/formatNumber.ts`

Current role: number formatting helper.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- formatNumber.ts
```

## `src/lib/game/shared/utils/gameMath.ts`

Current role: generic game math helper.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- gameMath.ts
```

## `src/lib/game/shared/utils/generateId.ts`

Current role: ID generation helper.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- generateId.ts
```

## `src/lib/game/shared/utils/hasUnlimitedStorage.ts`

Current role: storage capacity helper.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- hasUnlimitedStorage.ts
```

## `src/lib/game/shared/utils/saveMigration.ts`

Current role: legacy save migration pipeline and save-shape repair.

Problem: high spaghetti risk. Many historical migrations, generated defaults, production snapshot coupling, and version transitions are in one long file.

Required standard fix:

```text
src/lib/game/shared/utils/
|-- saveMigration.ts
`-- NEW save-migrations/
    |-- index.ts
    |-- v1-to-v2.ts
    |-- v2-to-v3.ts
    |-- v3-to-v4.ts
    |-- v4-to-v5.ts
    |-- v5-to-v6.ts
    |-- v6-to-v7.ts
    |-- v7-to-v8.ts
    |-- v8-to-v9.ts
    |-- v9-to-v10.ts
    |-- v10-to-v11.ts
    |-- v11-to-v12.ts
    |-- v12-to-v13.ts
    |-- v13-to-v14.ts
    |-- v14-to-v15.ts
    |-- v15-to-v16.ts
    |-- v16-to-v17.ts
    |-- v17-to-v18.ts
    `-- v18-to-v19.ts
```

## `src/lib/game/shared/utils/streakMultiplier.ts`

Current role: streak multiplier helper.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/shared/utils/
`-- streakMultiplier.ts
```

## `src/lib/game/state/store.ts`

Current role: Zustand store assembly.

Problem: low to medium spaghetti risk. It is mostly a composed store root, but should stay assembly-only.

Required standard fix:

```text
src/lib/game/state/
`-- store.ts
```

## `src/lib/game/state/store-actions/_actionTypes.ts`

Current role: store action type helpers.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/state/store-actions/
`-- _actionTypes.ts
```

## `src/lib/game/state/store-actions/automation.ts`

Current role: client automation state action.

Problem: medium spaghetti risk. It performs local unlock checks, mutation, sound, and notifications in one action.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- automation.ts
`-- NEW automation/
    |-- automationClientAction.ts
    `-- automationUiEffects.ts
```

## `src/lib/game/state/store-actions/blueprints.ts`

Current role: blueprint save/load/import/export client actions.

Problem: medium spaghetti risk. Serialization, validation, mutation, and notifications are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- blueprints.ts
`-- NEW blueprints/
    |-- blueprintSerialization.ts
    |-- blueprintValidation.ts
    |-- blueprintMutation.ts
    `-- blueprintUiEffects.ts
```

## `src/lib/game/state/store-actions/buildings.ts`

Current role: client building actions, server validation calls, corrected-state application, power snapshot recalculation, sound, and notifications.

Problem: high spaghetti risk. Client orchestration, UI effects, and authoritative state application are coupled.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- buildings.ts
`-- NEW buildings/
    |-- buildBuilding.client.ts
    |-- upgradeBuilding.client.ts
    |-- toggleBuilding.client.ts
    |-- applyBuildingCorrectedState.ts
    `-- buildingUiEffects.ts
```

## `src/lib/game/state/store-actions/contracts.ts`

Current role: client contract accept/fulfill actions with server validation, sound, and notifications.

Problem: medium spaghetti risk. Local action orchestration and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- contracts.ts
`-- NEW contracts/
    |-- contractClientActions.ts
    |-- applyContractCorrectedState.ts
    `-- contractUiEffects.ts
```

## `src/lib/game/state/store-actions/core.ts`

Current role: core client game state actions.

Problem: low spaghetti risk. Keep small.

Required standard fix:

```text
src/lib/game/state/store-actions/
`-- core.ts
```

## `src/lib/game/state/store-actions/dailyRewards.ts`

Current role: daily reward claim action with server validation, state application, sound, and notifications.

Problem: medium spaghetti risk. Server result handling and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- dailyRewards.ts
`-- NEW dailyRewards/
    |-- claimDailyReward.client.ts
    |-- applyDailyRewardCorrectedState.ts
    `-- dailyRewardUiEffects.ts
```

## `src/lib/game/state/store-actions/drones.ts`

Current role: drone mission client actions with server validation and UI effects.

Problem: medium spaghetti risk. Mission orchestration, corrected state, sounds, and notifications are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- drones.ts
`-- NEW drones/
    |-- droneMissionActions.client.ts
    |-- applyDroneCorrectedState.ts
    `-- droneUiEffects.ts
```

## `src/lib/game/state/store-actions/leaderboard.ts`

Current role: leaderboard state action.

Problem: low spaghetti risk. File is small.

Required standard fix:

```text
src/lib/game/state/store-actions/
`-- leaderboard.ts
```

## `src/lib/game/state/store-actions/market.ts`

Current role: market state fetch, buy/sell client actions, trade server calls, market pressure fire-and-forget calls, sound, and notifications.

Problem: high spaghetti risk. Network fetching, server-authoritative trade actions, storage prechecks, pressure reporting, UI effects, and corrected-state application are coupled.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- market.ts
`-- NEW market/
    |-- loadMarket.client.ts
    |-- buyResource.client.ts
    |-- sellResource.client.ts
    |-- marketPressure.client.ts
    |-- applyMarketCorrectedState.ts
    `-- marketUiEffects.ts
```

## `src/lib/game/state/store-actions/megaProjects.ts`

Current role: mega project start and progress client actions.

Problem: medium spaghetti risk. Local eligibility checks, construction progress, and notifications are mixed; server-authoritative boundary should be reviewed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- megaProjects.ts
`-- NEW megaProjects/
    |-- megaProjectClientActions.ts
    |-- megaProjectEligibility.ts
    `-- megaProjectUiEffects.ts
```

## `src/lib/game/state/store-actions/news.ts`

Current role: market/game news state action.

Problem: low spaghetti risk. File is small.

Required standard fix:

```text
src/lib/game/state/store-actions/
`-- news.ts
```

## `src/lib/game/state/store-actions/notifications.ts`

Current role: notification state action.

Problem: low spaghetti risk. File is focused.

Required standard fix:

```text
src/lib/game/state/store-actions/
`-- notifications.ts
```

## `src/lib/game/state/store-actions/payouts.ts`

Current role: payout collection client action with server validation, state application, sound, and notifications.

Problem: medium spaghetti risk. Server result handling and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- payouts.ts
`-- NEW payouts/
    |-- collectPayout.client.ts
    |-- applyPayoutCorrectedState.ts
    `-- payoutUiEffects.ts
```

## `src/lib/game/state/store-actions/prestige.ts`

Current role: prestige client actions, leaderboard submit, random corporation name generation, sound, and notifications.

Problem: high spaghetti risk. Server-authoritative prestige orchestration, client-only naming, leaderboard side effect, local bonus purchasing, sound, and notifications are coupled.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- prestige.ts
`-- NEW prestige/
    |-- prestige.client.ts
    |-- corporationName.client.ts
    |-- prestigeLeaderboard.client.ts
    |-- prestigeBonus.client.ts
    |-- applyPrestigeCorrectedState.ts
    `-- prestigeUiEffects.ts
```

## `src/lib/game/state/store-actions/quests.ts`

Current role: quest claim client action with server validation, corrected state, sound, and notifications.

Problem: medium spaghetti risk. Server result handling and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- quests.ts
`-- NEW quests/
    |-- claimQuest.client.ts
    |-- applyQuestCorrectedState.ts
    `-- questUiEffects.ts
```

## `src/lib/game/state/store-actions/rank.ts`

Current role: rank calculation/update client action.

Problem: medium spaghetti risk. Ranking formula and state mutation are together; formula may belong in pure progression logic.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- rank.ts
`-- NEW rank/
    |-- rankFormula.ts
    `-- rankClientAction.ts
```

## `src/lib/game/state/store-actions/research.ts`

Current role: research start client action with server validation, corrected state, sound, and notifications.

Problem: medium spaghetti risk. Server result handling and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- research.ts
`-- NEW research/
    |-- startResearch.client.ts
    |-- applyResearchCorrectedState.ts
    `-- researchUiEffects.ts
```

## `src/lib/game/state/store-actions/storage.ts`

Current role: storage upgrade client action with server validation, corrected state, sound, and notifications.

Problem: medium spaghetti risk. Server result handling and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- storage.ts
`-- NEW storage/
    |-- upgradeStorage.client.ts
    |-- applyStorageCorrectedState.ts
    `-- storageUiEffects.ts
```

## `src/lib/game/state/store-actions/transport.ts`

Current role: transport build/upgrade client actions with server validation, corrected state, sound, and notifications.

Problem: high spaghetti risk. Transport business orchestration, server result handling, and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- transport.ts
`-- NEW transport/
    |-- buildTransport.client.ts
    |-- upgradeTransport.client.ts
    |-- applyTransportCorrectedState.ts
    `-- transportUiEffects.ts
```

## `src/lib/game/state/store-actions/workers.ts`

Current role: worker hire/assign/upgrade client actions with server validation, corrected state, sound, and notifications.

Problem: high spaghetti risk. Worker business orchestration, server result handling, and UI effects are mixed.

Required standard fix:

```text
src/lib/game/state/store-actions/
|-- workers.ts
`-- NEW workers/
    |-- hireWorker.client.ts
    |-- assignWorker.client.ts
    |-- upgradeWorker.client.ts
    |-- applyWorkerCorrectedState.ts
    `-- workerUiEffects.ts
```

## `src/lib/game/state/store-bootstrap.ts`

Current role: initial client store state and initial server state loading.

Problem: medium spaghetti risk. Stub state construction, production snapshot defaults, server initial-state fetch, and bootstrap behavior are coupled.

Required standard fix:

```text
src/lib/game/state/
|-- store-bootstrap.ts
|-- NEW initialClientState.ts
|-- NEW initialServerStateLoader.client.ts
`-- NEW stubProductionSnapshot.ts
```

## `src/lib/game/state/store-types.ts`

Current role: Zustand store type composition.

Problem: low to medium spaghetti risk. It is acceptable as a store type root, but should not accumulate domain types.

Required standard fix:

```text
src/lib/game/state/
`-- store-types.ts
```

## Before And After File Structure

### Before Current First-Pass Structure

```text
src/lib/game/
|-- LIB_GAME_STRUCTURE_PLAN.md
|-- actions/
|   |-- client/
|   |   |-- actionValidator.ts
|   |   `-- serverActions.ts
|   |-- server/
|   |   |-- actionCommandRunner.ts
|   |   |-- handlers/
|   |   |   `-- actionHandlers.ts
|   |   `-- shared/
|   |       |-- actionConfig.ts
|   |       |-- actionContext.ts
|   |       |-- actionPersistence.ts
|   |       |-- actionTiming.ts
|   |       `-- actionTypes.ts
|-- audio/
|   `-- soundEngine.ts
|-- buildings/
|   `-- buildingDiscovery.ts
|-- catalog/
|   `-- ui/
|       `-- uiCatalog.ts
|-- config/
|   |-- balance/
|   |   `-- balanceConfig.ts
|   |-- server/
|   |   `-- configLoader.server.ts
|   |-- config.ts
|   `-- configCache.ts
|-- events/
|   `-- eventArchetypes.ts
|-- market/
|   |-- engine/
|   |   |-- correlations.ts
|   |   |-- index.ts
|   |   |-- sectors.ts
|   |   `-- types.ts
|   |-- news/
|   |   |-- newsBuilder.ts
|   |   `-- newsLLM.ts
|   |-- trade/
|   |   `-- tradeConstants.ts
|   `-- marketSimulator.ts
|-- migration/
|   `-- idMigration.ts
|-- modifiers/
|   `-- modifierEngine.ts
|-- production/
|   |-- engine/
|   |   `-- serverEngine.ts
|   `-- productionCalculator.ts
|-- progression/
|   `-- tiers.ts
|-- server-time/
|   `-- serverTickValidator.ts
|-- settings/
|   `-- settingsStore.ts
|-- shared/
|   |-- constants/
|   |   `-- saveVersion.ts
|   |-- icons/
|   |   |-- index.ts
|   |   |-- mappings.ts
|   |   `-- tiers.ts
|   |-- types/
|   |   `-- types.ts
|   `-- utils/
|       |-- costCalculator.ts
|       |-- formatNumber.ts
|       |-- gameMath.ts
|       |-- generateId.ts
|       |-- hasUnlimitedStorage.ts
|       |-- saveMigration.ts
|       `-- streakMultiplier.ts
`-- state/
    |-- store-actions/
    |   |-- _actionTypes.ts
    |   |-- automation.ts
    |   |-- blueprints.ts
    |   |-- buildings.ts
    |   |-- contracts.ts
    |   |-- core.ts
    |   |-- dailyRewards.ts
    |   |-- drones.ts
    |   |-- leaderboard.ts
    |   |-- market.ts
    |   |-- megaProjects.ts
    |   |-- news.ts
    |   |-- notifications.ts
    |   |-- payouts.ts
    |   |-- prestige.ts
    |   |-- quests.ts
    |   |-- rank.ts
    |   |-- research.ts
    |   |-- storage.ts
    |   |-- transport.ts
    |   `-- workers.ts
    |-- store.ts
    |-- store-bootstrap.ts
    `-- store-types.ts
```

### After Proposed Second-Pass Structure

```text
src/lib/game/
|-- LIB_GAME_STRUCTURE_PLAN.md
|-- SPAGHETTI_CODE_REFACTOR_PLAN.md
|-- actions/
|   |-- client/
|   |   |-- actionValidator.ts
|   |   |-- serverActions.ts
|   |   |-- NEW endpoints.ts
|   |   |-- NEW errorMapper.ts
|   |   |-- NEW requestBuilder.ts
|   |   |-- NEW responseParser.ts
|   |   |-- NEW resultMapper.ts
|   |   `-- NEW validationTypes.ts
|   `-- server/
|       |-- actionCommandRunner.ts
|       |-- NEW commandDispatcher.ts
|       |-- NEW correctedStateResponse.ts
|       |-- handlers/
|       |   |-- actionHandlers.ts
|       |   |-- NEW buildings.ts
|       |   |-- NEW contracts.ts
|       |   |-- NEW drones.ts
|       |   |-- NEW market.ts
|       |   |-- NEW payouts.ts
|       |   |-- NEW prestige.ts
|       |   |-- NEW quests.ts
|       |   |-- NEW research.ts
|       |   |-- NEW rewards.ts
|       |   |-- NEW speed.ts
|       |   |-- NEW storage.ts
|       |   |-- NEW transport.ts
|       |   `-- NEW workers.ts
|       `-- shared/
|           |-- actionConfig.ts
|           |-- actionContext.ts
|           |-- actionPersistence.ts
|           |-- actionTiming.ts
|           |-- actionTypes.ts
|           |-- NEW actionConfigLoader.ts
|           |-- NEW actionConfigTransformers.ts
|           |-- NEW actionConfigTypes.ts
|           |-- NEW actionPersistenceResult.ts
|           |-- NEW actionRequestContext.ts
|           |-- NEW actionStateLoader.ts
|           |-- NEW actionTimingContext.ts
|           |-- NEW correctedStatePersistence.ts
|           |-- NEW denormalizedStateColumns.ts
|           `-- NEW stateMergePolicy.ts
|-- audio/
|   |-- soundEngine.ts
|   |-- NEW audioSettings.ts
|   |-- NEW browserAudio.ts
|   `-- NEW soundCatalog.ts
|-- buildings/
|   `-- buildingDiscovery.ts
|-- catalog/
|   `-- ui/
|       |-- uiCatalog.ts
|       |-- NEW buildings.ts
|       |-- NEW contracts.ts
|       |-- NEW drones.ts
|       |-- NEW events.ts
|       |-- NEW index.ts
|       |-- NEW market.ts
|       |-- NEW prestige.ts
|       |-- NEW quests.ts
|       |-- NEW research.ts
|       |-- NEW resources.ts
|       |-- NEW transport.ts
|       `-- NEW workers.ts
|-- config/
|   |-- config.ts
|   |-- configCache.ts
|   |-- balance/
|   |   |-- balanceConfig.ts
|   |   |-- NEW balanceDefaults.ts
|   |   |-- NEW balanceErrors.ts
|   |   |-- NEW balanceRuntime.ts
|   |   |-- NEW balanceTypes.ts
|   |   `-- NEW balanceValidator.ts
|   |-- client/
|   |   `-- NEW configLoader.client.ts
|   |-- derived/
|   |   |-- NEW contractTemplates.ts
|   |   |-- NEW productionChains.ts
|   |   `-- NEW resourceDisplay.ts
|   |-- server/
|   |   |-- configLoader.server.ts
|   |   |-- NEW serverBalanceLoader.ts
|   |   |-- NEW serverConfigFallbackPolicy.ts
|   |   |-- NEW serverConfigQueries.ts
|   |   `-- NEW serverConfigTransformers.ts
|   |-- transformers/
|   |   |-- NEW buildings.ts
|   |   |-- NEW index.ts
|   |   |-- NEW market.ts
|   |   |-- NEW research.ts
|   |   `-- NEW resources.ts
|   |-- types/
|   |   |-- NEW gameConfig.ts
|   |   `-- NEW supabaseRows.ts
|   |-- NEW buildingIdMigration.ts
|   |-- NEW cacheUpdate.ts
|   `-- NEW runtimeCache.ts
|-- events/
|   |-- eventArchetypes.ts
|   |-- NEW archetypeDefinitions.ts
|   |-- NEW eventRandom.ts
|   `-- NEW eventSelection.ts
|-- market/
|   |-- marketSimulator.ts
|   |-- engine/
|   |   |-- correlations.ts
|   |   |-- index.ts
|   |   |-- sectors.ts
|   |   |-- types.ts
|   |   |-- NEW sectorDefinitions.ts
|   |   `-- NEW sectorHelpers.ts
|   |-- news/
|   |   |-- newsBuilder.ts
|   |   |-- newsLLM.ts
|   |   |-- NEW eventPackets.ts
|   |   |-- NEW fallbackText.ts
|   |   |-- NEW llmClient.ts
|   |   |-- NEW llmFallback.ts
|   |   |-- NEW llmPrompt.ts
|   |   |-- NEW llmResponseParser.ts
|   |   |-- NEW newsIds.ts
|   |   |-- NEW templateSelector.ts
|   |   `-- templates/
|   |       |-- NEW priceMove.ts
|   |       |-- NEW sector.ts
|   |       |-- NEW trade.ts
|   |       `-- NEW volatility.ts
|   `-- trade/
|       `-- tradeConstants.ts
|-- migration/
|   `-- idMigration.ts
|-- modifiers/
|   |-- modifierEngine.ts
|   |-- NEW engine.ts
|   |-- NEW registry.ts
|   |-- NEW types.ts
|   `-- sources/
|       |-- NEW events.ts
|       |-- NEW megaProjects.ts
|       |-- NEW prestige.ts
|       |-- NEW research.ts
|       `-- NEW weather.ts
|-- production/
|   |-- productionCalculator.ts
|   |-- engine/
|   |   |-- serverEngine.ts
|   |   |-- NEW ids.ts
|   |   |-- math/
|   |   |   |-- NEW endgame.server.ts
|   |   |   |-- NEW multipliers.server.ts
|   |   |   |-- NEW payout.server.ts
|   |   |   |-- NEW power.server.ts
|   |   |   |-- NEW production.server.ts
|   |   |   `-- NEW sell.server.ts
|   |   |-- mutators/
|   |   |   |-- NEW build.ts
|   |   |   |-- NEW contracts.ts
|   |   |   |-- NEW drones.ts
|   |   |   |-- NEW prestige.ts
|   |   |   |-- NEW quests.ts
|   |   |   |-- NEW research.ts
|   |   |   |-- NEW rewards.ts
|   |   |   |-- NEW storage.ts
|   |   |   |-- NEW trade.ts
|   |   |   |-- NEW transport.ts
|   |   |   `-- NEW workers.ts
|   |   |-- tick/
|   |   |   |-- NEW productionSnapshot.ts
|   |   |   |-- NEW runServerTicks.ts
|   |   |   `-- NEW weatherTick.ts
|   |   `-- validators/
|   |       |-- NEW build.ts
|   |       |-- NEW contracts.ts
|   |       |-- NEW drones.ts
|   |       |-- NEW prestige.ts
|   |       |-- NEW quests.ts
|   |       |-- NEW research.ts
|   |       |-- NEW rewards.ts
|   |       |-- NEW storage.ts
|   |       |-- NEW trade.ts
|   |       |-- NEW transport.ts
|   |       |-- NEW upgrade.ts
|   |       `-- NEW workers.ts
|   |-- math/
|   |   |-- NEW endgame.ts
|   |   |-- NEW multipliers.ts
|   |   |-- NEW payout.ts
|   |   |-- NEW power.ts
|   |   |-- NEW production.ts
|   |   `-- NEW sell.ts
|   |-- snapshot/
|   |   |-- NEW emptyProductionSnapshot.ts
|   |   `-- NEW productionSnapshot.ts
|   `-- NEW definitions.ts
|-- progression/
|   `-- tiers.ts
|-- server-time/
|   |-- serverTickValidator.ts
|   |-- NEW tickBounds.ts
|   `-- NEW tickValidationPolicy.ts
|-- settings/
|   |-- settingsStore.ts
|   |-- NEW settingsDefaults.ts
|   |-- NEW settingsPersistence.ts
|   `-- NEW settingsTypes.ts
|-- shared/
|   |-- constants/
|   |   `-- saveVersion.ts
|   |-- icons/
|   |   |-- index.ts
|   |   |-- mappings.ts
|   |   |-- tiers.ts
|   |   |-- NEW buildingIcons.ts
|   |   |-- NEW effectIcons.ts
|   |   |-- NEW researchIcons.ts
|   |   |-- NEW resourceIcons.ts
|   |   `-- NEW uiIcons.ts
|   |-- types/
|   |   |-- types.ts
|   |   |-- NEW buildings.ts
|   |   |-- NEW market.ts
|   |   |-- NEW notifications.ts
|   |   |-- NEW prestige.ts
|   |   |-- NEW production.ts
|   |   |-- NEW quests.ts
|   |   |-- NEW research.ts
|   |   |-- NEW resources.ts
|   |   |-- NEW rewards.ts
|   |   |-- NEW server.ts
|   |   |-- NEW state.ts
|   |   |-- NEW transport.ts
|   |   `-- NEW workers.ts
|   `-- utils/
|       |-- costCalculator.ts
|       |-- formatNumber.ts
|       |-- gameMath.ts
|       |-- generateId.ts
|       |-- hasUnlimitedStorage.ts
|       |-- saveMigration.ts
|       |-- streakMultiplier.ts
|       `-- save-migrations/
|           |-- NEW index.ts
|           |-- NEW v1-to-v2.ts
|           |-- NEW v2-to-v3.ts
|           |-- NEW v3-to-v4.ts
|           |-- NEW v4-to-v5.ts
|           |-- NEW v5-to-v6.ts
|           |-- NEW v6-to-v7.ts
|           |-- NEW v7-to-v8.ts
|           |-- NEW v8-to-v9.ts
|           |-- NEW v9-to-v10.ts
|           |-- NEW v10-to-v11.ts
|           |-- NEW v11-to-v12.ts
|           |-- NEW v12-to-v13.ts
|           |-- NEW v13-to-v14.ts
|           |-- NEW v14-to-v15.ts
|           |-- NEW v15-to-v16.ts
|           |-- NEW v16-to-v17.ts
|           |-- NEW v17-to-v18.ts
|           `-- NEW v18-to-v19.ts
`-- state/
    |-- store.ts
    |-- store-bootstrap.ts
    |-- store-types.ts
    |-- NEW initialClientState.ts
    |-- NEW initialServerStateLoader.client.ts
    |-- NEW stubProductionSnapshot.ts
    `-- store-actions/
        |-- _actionTypes.ts
        |-- automation.ts
        |-- blueprints.ts
        |-- buildings.ts
        |-- contracts.ts
        |-- core.ts
        |-- dailyRewards.ts
        |-- drones.ts
        |-- leaderboard.ts
        |-- market.ts
        |-- megaProjects.ts
        |-- news.ts
        |-- notifications.ts
        |-- payouts.ts
        |-- prestige.ts
        |-- quests.ts
        |-- rank.ts
        |-- research.ts
        |-- storage.ts
        |-- transport.ts
        |-- workers.ts
        |-- automation/
        |   |-- NEW automationClientAction.ts
        |   `-- NEW automationUiEffects.ts
        |-- blueprints/
        |   |-- NEW blueprintMutation.ts
        |   |-- NEW blueprintSerialization.ts
        |   |-- NEW blueprintUiEffects.ts
        |   `-- NEW blueprintValidation.ts
        |-- buildings/
        |   |-- NEW applyBuildingCorrectedState.ts
        |   |-- NEW buildBuilding.client.ts
        |   |-- NEW buildingUiEffects.ts
        |   |-- NEW toggleBuilding.client.ts
        |   `-- NEW upgradeBuilding.client.ts
        |-- contracts/
        |   |-- NEW applyContractCorrectedState.ts
        |   |-- NEW contractClientActions.ts
        |   `-- NEW contractUiEffects.ts
        |-- dailyRewards/
        |   |-- NEW applyDailyRewardCorrectedState.ts
        |   |-- NEW claimDailyReward.client.ts
        |   `-- NEW dailyRewardUiEffects.ts
        |-- drones/
        |   |-- NEW applyDroneCorrectedState.ts
        |   |-- NEW droneMissionActions.client.ts
        |   `-- NEW droneUiEffects.ts
        |-- market/
        |   |-- NEW applyMarketCorrectedState.ts
        |   |-- NEW buyResource.client.ts
        |   |-- NEW loadMarket.client.ts
        |   |-- NEW marketPressure.client.ts
        |   |-- NEW marketUiEffects.ts
        |   `-- NEW sellResource.client.ts
        |-- megaProjects/
        |   |-- NEW megaProjectClientActions.ts
        |   |-- NEW megaProjectEligibility.ts
        |   `-- NEW megaProjectUiEffects.ts
        |-- payouts/
        |   |-- NEW applyPayoutCorrectedState.ts
        |   |-- NEW collectPayout.client.ts
        |   `-- NEW payoutUiEffects.ts
        |-- prestige/
        |   |-- NEW applyPrestigeCorrectedState.ts
        |   |-- NEW corporationName.client.ts
        |   |-- NEW prestige.client.ts
        |   |-- NEW prestigeBonus.client.ts
        |   |-- NEW prestigeLeaderboard.client.ts
        |   `-- NEW prestigeUiEffects.ts
        |-- quests/
        |   |-- NEW applyQuestCorrectedState.ts
        |   |-- NEW claimQuest.client.ts
        |   `-- NEW questUiEffects.ts
        |-- rank/
        |   |-- NEW rankClientAction.ts
        |   `-- NEW rankFormula.ts
        |-- research/
        |   |-- NEW applyResearchCorrectedState.ts
        |   |-- NEW researchUiEffects.ts
        |   `-- NEW startResearch.client.ts
        |-- storage/
        |   |-- NEW applyStorageCorrectedState.ts
        |   |-- NEW storageUiEffects.ts
        |   `-- NEW upgradeStorage.client.ts
        |-- transport/
        |   |-- NEW applyTransportCorrectedState.ts
        |   |-- NEW buildTransport.client.ts
        |   |-- NEW transportUiEffects.ts
        |   `-- NEW upgradeTransport.client.ts
        `-- workers/
            |-- NEW applyWorkerCorrectedState.ts
            |-- NEW assignWorker.client.ts
            |-- NEW hireWorker.client.ts
            |-- NEW upgradeWorker.client.ts
            `-- NEW workerUiEffects.ts
```
