# Task 2-a: Data Expansion Developer

## Summary
Updated /home/z/my-project/src/lib/game/data.ts with comprehensive new game data: resources, buildings, production chains, market prices, and contracts.

## Changes Made
- RESOURCE_META: Added 26 new resources (5 raw, 5 T1, 8 T2, 8 T3), moved steel from T2 to T1
- BUILDING_DEFS: Added 25 new buildings (5 extractors, 14 T1-T2 factories, 8 T3 factories), updated 6 existing buildings
- PRODUCTION_CHAINS: Replaced with 26-chain version
- INITIAL_MARKET: Added 25 new market price entries
- CONTRACT_TEMPLATES: Added 24 new contracts

## Verification
- ESLint: 0 errors
- Dev server: Compiles successfully
- All resource references match ResourceType union from types.ts
