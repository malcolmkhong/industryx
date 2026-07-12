# lib/db File Migration Plan

Purpose: exact manual migration checklist for `src/lib/db`.

Current scan result:

- Total files scanned under `src/lib/db`: 30
- This plan file is included in that count.
- Existing project files to migrate: 29
- First migration pass should keep file count the same: 30 files before, 30 files after.
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
- Do not split `types.ts` or any other file yet.

## New Folders To Create

Marked `[NEW FOLDER]` because these folders do not currently exist in this target shape.

```text
src/lib/db/
|-- admin/                         [NEW FOLDER]
|   |-- admins.ts
|   |-- adminActions.ts
|   |-- adminPermissions.ts
|   |-- adminUsers.ts
|   `-- cheatInvestigations.ts
|-- config/                        [NEW FOLDER]
|   |-- configGame.ts
|   |-- configMarket.ts
|   `-- serverConfigFetcher.ts
|-- game/                          [NEW FOLDER]
|   |-- dailyRewards.ts
|   |-- fingerprint-events.ts
|   |-- leaderboard.ts
|   |-- market.ts
|   |-- playerActions.ts
|   |-- playerProgress.ts
|   |-- serverGameState.ts
|   |-- serverGameStatePayload.ts
|   `-- trades.ts
|-- infra/                         [NEW FOLDER]
|   |-- capacity.ts
|   |-- infra.ts
|   `-- initialState.server.ts
|-- player/                        [NEW FOLDER]
|   |-- profiles.ts
|   `-- guestIdentities.ts
|-- shared/                        [NEW FOLDER]
|   |-- rateLimits.ts
|   |-- linkOps.ts
|   |-- merge.ts
|   `-- supportTickets.ts
`-- types.ts
```

## After Folder Tree With Files

This is the target tree after the manual move. It still contains exactly 30 files.

```text
src/lib/db/
|-- DB_STRUCTURE_PLAN.md
|-- admin/
|   |-- admins.ts
|   |-- adminActions.ts
|   |-- adminPermissions.ts
|   |-- adminUsers.ts
|   `-- cheatInvestigations.ts
|-- config/
|   |-- configGame.ts
|   |-- configMarket.ts
|   `-- serverConfigFetcher.ts
|-- game/
|   |-- dailyRewards.ts
|   |-- fingerprint-events.ts
|   |-- leaderboard.ts
|   |-- market.ts
|   |-- playerActions.ts
|   |-- playerProgress.ts
|   |-- serverGameState.ts
|   |-- serverGameStatePayload.ts
|   `-- trades.ts
|-- infra/
|   |-- capacity.ts
|   |-- infra.ts
|   `-- initialState.server.ts
|-- player/
|   |-- profiles.ts
|   `-- guestIdentities.ts
|-- shared/
|   |-- rateLimits.ts
|   |-- linkOps.ts
|   |-- merge.ts
|   `-- supportTickets.ts
`-- types.ts
```

## Manual Move Order

Use this order to keep mental load low.

1. Create all `[NEW FOLDER]` folders.
2. Move admin files: rows 5-9.
3. Move config files: rows 12-14.
4. Move game files: rows 17-25.
5. Move infra files: rows 28-30.
6. Move player files: rows 33-34.
7. Move shared files: rows 37-40.
8. Keep `types.ts` at the root of `src/lib/db/`.
9. Leave `DB_STRUCTURE_PLAN.md` where it is.

## After Manual Move, Codex Should Check

Codex should run these after you finish moving files:

```powershell
rg --files src/lib/db | Measure-Object -Line
rg "@/lib/db/" src -n
rg "from \"\\.\\.?/" src/lib/db -n
npm run typecheck
npx eslint src/lib/db --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish
```

Expected first command:

```text
30
```

Then Codex fixes broken imports in small batches.