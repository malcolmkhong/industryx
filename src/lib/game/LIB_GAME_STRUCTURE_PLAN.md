# lib/game File Migration Plan

Purpose: exact manual migration checklist for `src/lib/game`.

Current scan result:

- Total files scanned under `src/lib/game`: 62
- This plan file is included in that count.
- Existing project files to migrate: 61
- First migration pass should keep file count the same: 62 files before, 62 files after.
- New folders can be created freely. Empty folders do not affect file count.
- Do not split large files in first pass.
- Do not delete files in first pass.

## Migration Rule

First pass is a path migration only.

Meaning:

- Move whole file from old path to new path.
- Keep same file name unless `Rename` column says otherwise.
- Let VS Code update imports on move.
- Do not create barrel `index.ts` files yet unless we decide later.
- Do not split `uiCatalog.ts`, `serverEngine.ts`, `types.ts`, `modifierEngine.ts`, `balanceConfig.ts`, or `productionCalculator.ts` yet.

## New Folders To Create

Marked `[NEW FOLDER]` because these folders do not currently exist in this target shape.

```text
src/lib/game/
|-- actions/                         [EXISTING, but repurposed]
|   `-- client/                      [NEW FOLDER]
|-- audio/                           [NEW FOLDER]
|-- buildings/                       [NEW FOLDER]
|-- catalog/                         [NEW FOLDER]
|   `-- ui/                          [NEW FOLDER]
|-- config/                          [NEW FOLDER]
|   |-- balance/                     [NEW FOLDER]
|   `-- server/                      [NEW FOLDER]
|-- events/                          [NEW FOLDER]
|-- market/                          [NEW FOLDER]
|   |-- engine/                      [NEW FOLDER]
|   |-- news/                        [NEW FOLDER]
|   `-- trade/                       [NEW FOLDER]
|-- migration/                       [NEW FOLDER]
|-- modifiers/                       [NEW FOLDER]
|-- production/                      [NEW FOLDER]
|   `-- engine/                      [NEW FOLDER]
|-- progression/                     [NEW FOLDER]
|-- server-time/                     [NEW FOLDER]
|-- settings/                        [NEW FOLDER]
|-- shared/                          [NEW FOLDER]
|   |-- constants/                   [NEW FOLDER]
|   |-- icons/                       [NEW FOLDER]
|   |-- types/                       [NEW FOLDER]
|   `-- utils/                       [NEW FOLDER]
`-- state/                           [NEW FOLDER]
    `-- store-actions/               [NEW FOLDER]
```

Reserved folders for later, not needed in first manual move unless you want them ready:

```text
src/lib/game/contracts/              [NEW FOLDER, RESERVED]
src/lib/game/drones/                 [NEW FOLDER, RESERVED]
src/lib/game/prestige/               [NEW FOLDER, RESERVED]
src/lib/game/quests/                 [NEW FOLDER, RESERVED]
src/lib/game/research/               [NEW FOLDER, RESERVED]
src/lib/game/storage/                [NEW FOLDER, RESERVED]
src/lib/game/transport/              [NEW FOLDER, RESERVED]
src/lib/game/workers/                [NEW FOLDER, RESERVED]
```

Optional later files, not part of first pass:

```text
src/lib/game/index.ts                [NEW FILE, LATER]
src/lib/game/*/index.ts              [NEW FILES, LATER]
```

## Before And After File Map

Exact 62-file map. Every scanned file is listed.

| # | Before | After | Rename |
|---:|---|---|---|
| 1 | `src/lib/game/LIB_GAME_STRUCTURE_PLAN.md` | `src/lib/game/LIB_GAME_STRUCTURE_PLAN.md` | No |
| 2 | `src/lib/game/actionValidator.ts` | `src/lib/game/actions/client/actionValidator.ts` | No |
| 3 | `src/lib/game/serverActions.ts` | `src/lib/game/actions/client/serverActions.ts` | No |
| 4 | `src/lib/game/actions/_actionTypes.ts` | `src/lib/game/state/store-actions/_actionTypes.ts` | No |
| 5 | `src/lib/game/actions/automation.ts` | `src/lib/game/state/store-actions/automation.ts` | No |
| 6 | `src/lib/game/actions/blueprints.ts` | `src/lib/game/state/store-actions/blueprints.ts` | No |
| 7 | `src/lib/game/actions/buildings.ts` | `src/lib/game/state/store-actions/buildings.ts` | No |
| 8 | `src/lib/game/actions/contracts.ts` | `src/lib/game/state/store-actions/contracts.ts` | No |
| 9 | `src/lib/game/actions/core.ts` | `src/lib/game/state/store-actions/core.ts` | No |
| 10 | `src/lib/game/actions/dailyRewards.ts` | `src/lib/game/state/store-actions/dailyRewards.ts` | No |
| 11 | `src/lib/game/actions/drones.ts` | `src/lib/game/state/store-actions/drones.ts` | No |
| 12 | `src/lib/game/actions/leaderboard.ts` | `src/lib/game/state/store-actions/leaderboard.ts` | No |
| 13 | `src/lib/game/actions/market.ts` | `src/lib/game/state/store-actions/market.ts` | No |
| 14 | `src/lib/game/actions/megaProjects.ts` | `src/lib/game/state/store-actions/megaProjects.ts` | No |
| 15 | `src/lib/game/actions/news.ts` | `src/lib/game/state/store-actions/news.ts` | No |
| 16 | `src/lib/game/actions/notifications.ts` | `src/lib/game/state/store-actions/notifications.ts` | No |
| 17 | `src/lib/game/actions/payouts.ts` | `src/lib/game/state/store-actions/payouts.ts` | No |
| 18 | `src/lib/game/actions/prestige.ts` | `src/lib/game/state/store-actions/prestige.ts` | No |
| 19 | `src/lib/game/actions/quests.ts` | `src/lib/game/state/store-actions/quests.ts` | No |
| 20 | `src/lib/game/actions/rank.ts` | `src/lib/game/state/store-actions/rank.ts` | No |
| 21 | `src/lib/game/actions/research.ts` | `src/lib/game/state/store-actions/research.ts` | No |
| 22 | `src/lib/game/actions/storage.ts` | `src/lib/game/state/store-actions/storage.ts` | No |
| 23 | `src/lib/game/actions/transport.ts` | `src/lib/game/state/store-actions/transport.ts` | No |
| 24 | `src/lib/game/actions/workers.ts` | `src/lib/game/state/store-actions/workers.ts` | No |
| 25 | `src/lib/game/store.ts` | `src/lib/game/state/store.ts` | No |
| 26 | `src/lib/game/store-bootstrap.ts` | `src/lib/game/state/store-bootstrap.ts` | No |
| 27 | `src/lib/game/store-types.ts` | `src/lib/game/state/store-types.ts` | No |
| 28 | `src/lib/game/settingsStore.ts` | `src/lib/game/settings/settingsStore.ts` | No |
| 29 | `src/lib/game/balanceConfig.ts` | `src/lib/game/config/balance/balanceConfig.ts` | No |
| 30 | `src/lib/game/config.ts` | `src/lib/game/config/config.ts` | No |
| 31 | `src/lib/game/configCache.ts` | `src/lib/game/config/configCache.ts` | No |
| 32 | `src/lib/game/configLoader.server.ts` | `src/lib/game/config/server/configLoader.server.ts` | No |
| 33 | `src/lib/game/productionCalculator.ts` | `src/lib/game/production/productionCalculator.ts` | No |
| 34 | `src/lib/game/serverEngine.ts` | `src/lib/game/production/engine/serverEngine.ts` | No |
| 35 | `src/lib/game/serverTickValidator.ts` | `src/lib/game/server-time/serverTickValidator.ts` | No |
| 36 | `src/lib/game/modifierEngine.ts` | `src/lib/game/modifiers/modifierEngine.ts` | No |
| 37 | `src/lib/game/marketSimulator.ts` | `src/lib/game/market/marketSimulator.ts` | No |
| 38 | `src/lib/game/newsBuilder.ts` | `src/lib/game/market/news/newsBuilder.ts` | No |
| 39 | `src/lib/game/newsLLM.ts` | `src/lib/game/market/news/newsLLM.ts` | No |
| 40 | `src/lib/game/tradeConstants.ts` | `src/lib/game/market/trade/tradeConstants.ts` | No |
| 41 | `src/lib/game/engine/correlations.ts` | `src/lib/game/market/engine/correlations.ts` | No |
| 42 | `src/lib/game/engine/index.ts` | `src/lib/game/market/engine/index.ts` | No |
| 43 | `src/lib/game/engine/sectors.ts` | `src/lib/game/market/engine/sectors.ts` | No |
| 44 | `src/lib/game/engine/types.ts` | `src/lib/game/market/engine/types.ts` | No |
| 45 | `src/lib/game/uiCatalog.ts` | `src/lib/game/catalog/ui/uiCatalog.ts` | No |
| 46 | `src/lib/game/soundEngine.ts` | `src/lib/game/audio/soundEngine.ts` | No |
| 47 | `src/lib/game/buildingDiscovery.ts` | `src/lib/game/buildings/buildingDiscovery.ts` | No |
| 48 | `src/lib/game/eventArchetypes.ts` | `src/lib/game/events/eventArchetypes.ts` | No |
| 49 | `src/lib/game/idMigration.ts` | `src/lib/game/migration/idMigration.ts` | No |
| 50 | `src/lib/game/tiers.ts` | `src/lib/game/progression/tiers.ts` | No |
| 51 | `src/lib/game/types.ts` | `src/lib/game/shared/types/types.ts` | No |
| 52 | `src/lib/game/constants/saveVersion.ts` | `src/lib/game/shared/constants/saveVersion.ts` | No |
| 53 | `src/lib/game/icons/index.ts` | `src/lib/game/shared/icons/index.ts` | No |
| 54 | `src/lib/game/icons/mappings.ts` | `src/lib/game/shared/icons/mappings.ts` | No |
| 55 | `src/lib/game/icons/tiers.ts` | `src/lib/game/shared/icons/tiers.ts` | No |
| 56 | `src/lib/game/utils/costCalculator.ts` | `src/lib/game/shared/utils/costCalculator.ts` | No |
| 57 | `src/lib/game/utils/formatNumber.ts` | `src/lib/game/shared/utils/formatNumber.ts` | No |
| 58 | `src/lib/game/utils/gameMath.ts` | `src/lib/game/shared/utils/gameMath.ts` | No |
| 59 | `src/lib/game/utils/generateId.ts` | `src/lib/game/shared/utils/generateId.ts` | No |
| 60 | `src/lib/game/utils/hasUnlimitedStorage.ts` | `src/lib/game/shared/utils/hasUnlimitedStorage.ts` | No |
| 61 | `src/lib/game/utils/saveMigration.ts` | `src/lib/game/shared/utils/saveMigration.ts` | No |
| 62 | `src/lib/game/utils/streakMultiplier.ts` | `src/lib/game/shared/utils/streakMultiplier.ts` | No |

## After Folder Tree With Files

This is the target tree after the manual move. It still contains exactly 62 files.

```text
src/lib/game/
|-- LIB_GAME_STRUCTURE_PLAN.md
|-- actions/
|   `-- client/
|       |-- actionValidator.ts
|       `-- serverActions.ts
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
    |-- store-bootstrap.ts
    |-- store-types.ts
    `-- store.ts
```

## Manual Move Order

Use this order to keep mental load low.

1. Create all `[NEW FOLDER]` folders.
2. Move config files: rows 29-32.
3. Move state store files: rows 25-27.
4. Move store action files: rows 4-24.
5. Move client action wrapper files: rows 2-3.
6. Move production/server-time/modifier files: rows 33-36.
7. Move market/news/trade/engine files: rows 37-44.
8. Move catalog/audio/building/event/migration/progression/settings files: rows 28 and 45-50.
9. Move shared type/constants/icons/utils files: rows 51-62.
10. Leave `LIB_GAME_STRUCTURE_PLAN.md` where it is.

## After Manual Move, Codex Should Check

Codex should run these after you finish moving files:

```powershell
rg --files src/lib/game | Measure-Object -Line
rg "@/lib/game/" src -n
rg "from \"\\.\\.?/" src/lib/game -n
npm run typecheck
npx eslint src/lib/game --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish
```

Expected first command:

```text
62
```

Then Codex fixes broken imports in small batches.
