---
model_count: 58
factory_count: 55
models:
  - name: game_config_market_history
    independently_created: true
    creation_file: src/app/api/market/trades/execute/route.ts
    creation_function: POST (trade execution)
    side_effects:
      - Records trade history in trade_history (via recordTrade)
      - Updates player_progress resources
      - Increments state_version in server_game_state
      - Records market pressure via upsert_market_pressure RPC
    created_by: []
  - name: rate_limits
    independently_created: true
    creation_file: supabase/migrations/20260611201747_016_rate_limits.sql
    creation_function: check_rate_limit (RPC)
    side_effects:
      - Uses upsert pattern via check_rate_limit RPC called from checkRateLimit middleware helper
      - Automatic cleanup via pg_cron (cleanup_rate_limits function)
    created_by: []
  - name: pending_link_operations
    independently_created: true
    creation_file: src/lib/db/shared/linkOps.ts
    creation_function: insertLinkOperation
    side_effects:
      - Orchestrates guest-to-OAuth merges
      - Holds merge previews that expire after 24h
    created_by: []
  - name: merge_receipts
    independently_created: true
    creation_file: src/lib/db/shared/merge.ts
    creation_function: insertMergeReceipt
    side_effects:
      - Records the outcome of a guest-to-OAuth merge
      - Often accompanied by a merge_audit_log entry
    created_by: []
  - name: merge_audit_log
    independently_created: true
    creation_file: src/lib/db/shared/merge.ts
    creation_function: insertMergeAuditLog
    side_effects:
      - Provides a detailed append-only record of a merge transaction for support/investigation.
    created_by:
      - owner: merge_receipts
        via: confirm-link (route)
        why: "A merge_audit_log entry is created as part of the same merge confirmation flow that creates a merge_receipt."
  - name: app_config
    independently_created: true
    creation_file: supabase/migrations/20260617194747_040_capacity_and_waitlist.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Sets global capacity limits and app-wide feature flags.
    created_by: []
  - name: waitlist_entries
    independently_created: true
    creation_file: supabase/migrations/20260617194747_040_capacity_and_waitlist.sql
    creation_function: submit_waitlist (RPC)
    side_effects:
      - Creates support_tickets row
      - Creates support_messages row
      - Sets status to 'pending'
    created_by: []
  - name: profiles
    independently_created: true
    creation_file: supabase/migrations/20260615041724_020_profiles_and_guest_identities.sql
    creation_function: handle_new_user (trigger)
    side_effects:
      - Syncs user records between auth.users and public.profiles
      - Sets initial is_guest flag based on auth metadata
    created_by: []
  - name: guest_identities
    independently_created: true
    creation_file: src/lib/db/player/guestIdentities.ts
    creation_function: insertGuestIdentity
    side_effects:
      - Maps device_id and fingerprint to a user_id for guest recovery.
      - Provides a target for superseded markers during link-to-OAuth flows.
    created_by: []
  - name: request_ip_log
    independently_created: true
    creation_file: src/app/api/auth/_shared/request-ip-log-helper.ts
    creation_function: logRequestIp
    side_effects:
      - Asynchronously logs SHA-256 hashed IP for specific endpoints like identity linking.
    created_by: []
  - name: player_progress
    independently_created: true
    creation_file: src/lib/game/state/persistence/serverGameStatePersistence.server.ts
    creation_function: syncLegacyPlayerProgressProjection
    side_effects:
      - Maintains a thin legacy version of the player's game state for older UI/API paths.
    created_by:
      - owner: server_game_state
        via: syncLegacyPlayerProgressProjection
        why: "player_progress is a backwards-compatibility mirror of server_game_state and is updated whenever state is persisted."
  - name: player_actions
    independently_created: true
    creation_file: src/lib/auth/gameStateValidator.ts
    creation_function: logActionAsync (exported via index.ts)
    side_effects:
      - Asynchronously logs player actions for auditing and anti-cheat purposes.
    created_by: []
  - name: game_config_buildings
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Static game configuration data defining building tiers, costs, and production rates.
    created_by: []
  - name: game_config_resources
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines static resource properties like base value and weight.
    created_by: []
  - name: game_config_production_recipes
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines the inputs and outputs for each building.
    created_by: []
  - name: game_config_production_chains
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines the sequence of buildings in a production chain.
    created_by: []
  - name: game_config_research
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines research nodes, their costs, and unlocks.
    created_by: []
  - name: game_config_automation
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines automation unlocks for industrial processes.
    created_by: []
  - name: game_config_workers
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines worker types, costs, and efficiency bonuses.
    created_by: []
  - name: game_config_transport
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines transport tiers, capacities, and costs.
    created_by: []
  - name: game_config_market
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines market-wide settings like commission rates and trade cooldowns.
    created_by: []
  - name: game_config_prestige_bonuses
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines prestige-related multipliers and bonuses.
    created_by: []
  - name: game_config_rank_thresholds
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines score/money thresholds for player ranks.
    created_by: []
  - name: game_config_quest_definitions
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines quest objectives and rewards.
    created_by: []
  - name: game_config_daily_rewards
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines daily login reward pools and tiers.
    created_by: []
  - name: game_config_event_templates
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines templates for factory/market events.
    created_by: []
  - name: game_config_seasonal_events
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines start/end dates for seasonal industrial events.
    created_by: []
  - name: game_config_mega_projects
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines end-game mega-projects, costs, and permanent bonuses.
    created_by: []
  - name: game_config_game
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines general game constants like tick rates and save versions.
    created_by: []
  - name: game_config_weather
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines global weather states and their production/transport multipliers.
    created_by: []
  - name: game_config_balancing_rules
    independently_created: true
    creation_file: supabase/migrations/20260622141113_009_game_config_tables.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines global balancing rules and coefficients.
    created_by: []
  - name: trade_history
    independently_created: true
    creation_file: src/lib/db/game/trades.ts
    creation_function: recordTrade
    side_effects:
      - Records a player trade operation for auditing and UI history.
    created_by: []
  - name: admin_actions
    independently_created: true
    creation_file: src/lib/db/admin/adminActions.ts
    creation_function: logAdminAction
    side_effects:
      - Records an immutable audit trail for administrative operations.
    created_by: []
  - name: leaderboard
    independently_created: true
    creation_file: src/lib/db/game/leaderboard.ts
    creation_function: submitScore
    side_effects:
      - Records a player's score upon prestige reset for global ranking.
    created_by: []
  - name: player_sessions
    independently_created: true
    creation_file: src/app/api/game/session/heartbeat/route.ts
    creation_function: POST (heartbeat)
    side_effects:
      - Upserts a session row for the user to track online presence.
      - Updates profiles.last_active timestamp.
    created_by: []
  - name: validated_actions
    independently_created: false
    creation_file: supabase/migrations/20260622141109_005_lean_mvp_cleanup.sql
    creation_function: N/A (DROPPED)
    side_effects:
      - This table was dropped in migration 005. It was a redundancy for player_actions.
    created_by: []
  - name: server_game_state
    independently_created: true
    creation_file: src/lib/db/game/serverGameState.ts
    creation_function: initializeGuestGameState (also upsertServerGameState)
    side_effects:
      - Authoritative source of truth for a player's game progress.
      - Denormalized columns synced with full_state JSONB blob.
      - Supports optimistic locking via state_version.
      - Trigger bootstrap_placeholder_canonical_defaults ensures canonical defaults on placeholder inserts.
    created_by: []
  - name: research_prerequisites
    independently_created: false
    creation_file: supabase/migrations/20260622141114_010_cleanup_dead_orphan_tables.sql
    creation_function: N/A (DROPPED)
    side_effects:
      - This table was dropped in migration 010. It was intended for server-side research checks but never used.
    created_by: []
  - name: cheat_investigations
    independently_created: true
    creation_file: src/lib/db/admin/cheatInvestigations.ts
    creation_function: createInvestigation (also via DB triggers/RPCs)
    side_effects:
      - Records detailed incidents for anti-cheat monitoring and moderation.
    created_by: []
  - name: admin_users
    independently_created: true
    creation_file: src/lib/db/admin/admins.ts
    creation_function: grantAdminRole (also Migration seed)
    side_effects:
      - Grants administrative access and roles to specific users.
    created_by: []
  - name: daily_rewards
    independently_created: true
    creation_file: src/lib/db/game/dailyRewards.ts
    creation_function: claimDailyReward
    side_effects:
      - Records a specific daily reward claim.
      - Updates the user's streak in user_streaks.
    created_by: []
  - name: user_streaks
    independently_created: true
    creation_file: src/lib/db/game/dailyRewards.ts
    creation_function: upsert_user_streak (RPC via claimDailyReward)
    side_effects:
      - Tracks the cumulative login streak and total logins for a user.
    created_by:
      - owner: daily_rewards
        via: claimDailyReward
        why: "user_streaks is updated (upserted) every time a daily_rewards entry is created."
  - name: market_supply_demand
    independently_created: true
    creation_file: src/app/api/market/supply/aggregate/route.ts
    creation_function: upsert_supply_demand (RPC via POST)
    side_effects:
      - Aggregates production and consumption from all players into a global market view.
    created_by: []
  - name: server_market_state
    independently_created: true
    creation_file: supabase/migrations/20260622141122_029_server_market.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Singleton row (id=1) representing the global state of the market.
      - Updated by apply_market_tick RPC called by Cloudflare markettick worker.
    created_by: []
  - name: market_player_pressure
    independently_created: true
    creation_file: supabase/migrations/20260622141122_029_server_market.sql
    creation_function: upsert_market_pressure (RPC via Trade API)
    side_effects:
      - Tracks buy/sell pressure per player to influence global market prices.
      - Cleared automatically after each global market tick.
    created_by: []
  - name: admin_permissions
    independently_created: true
    creation_file: src/lib/db/admin/adminPermissions.ts
    creation_function: grantAdminPermission
    side_effects:
      - Grants specific granular permissions (e.g. config_edit, support_manage) to admins.
    created_by: []
  - name: support_tickets
    independently_created: true
    creation_file: src/lib/db/shared/supportTickets.ts
    creation_function: createSupportTicket
    side_effects:
      - Allows players to submit inquiries and waitlist applications.
    created_by:
      - owner: waitlist_entries
        via: submit_waitlist (RPC)
        why: "A support ticket is automatically created for every new waitlist entry."
  - name: support_messages
    independently_created: true
    creation_file: src/lib/db/shared/supportTickets.ts
    creation_function: createSupportMessage
    side_effects:
      - Stores the conversation thread for a support ticket.
    created_by:
      - owner: support_tickets
        via: createSupportTicket (or initial message)
        why: "Every support ticket is typically initialized with a message, and follow-ups are created relative to a ticket."
  - name: fingerprint_events
    independently_created: true
    creation_file: src/lib/db/game/fingerprint-events.ts
    creation_function: recordFingerprintEvent
    side_effects:
      - Records security events related to device fingerprints for audit/investigation.
    created_by: []
  - name: game_config_balance
    independently_created: true
    creation_file: supabase/migrations/20260706120000_067_game_config_balance.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Consolidated table for game balancing constants.
    created_by: []
  - name: guest_state_archive
    independently_created: true
    creation_file: supabase/migrations/20260715100000_079_auth_merge_policy_and_archive.sql
    creation_function: upgrade_guest_to_auth (RPC)
    side_effects:
      - Stores a recoverable snapshot of guest progress during a merge.
    created_by: []
  - name: global_weather_schedule
    independently_created: true
    creation_file: supabase/migrations/20260718211641_add_global_weather_runtime.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines the scheduled weather patterns for the game.
    created_by: []
  - name: server_weather_state
    independently_created: true
    creation_file: supabase/migrations/20260718211641_add_global_weather_runtime.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Singleton row tracking current global weather.
      - Updated by pg_cron or market tick.
    created_by: []
  - name: bootstrap_telemetry
    independently_created: true
    creation_file: src/app/api/telemetry/bootstrap/route.ts
    creation_function: POST (telemetry)
    side_effects:
      - Records anonymized client-side bootstrap outcomes for monitoring.
    created_by: []
  - name: global_market_event_schedule
    independently_created: true
    creation_file: supabase/migrations/20260718202318_add_global_market_event_runtime.sql
    creation_function: Migration SQL (seed)
    side_effects:
      - Defines the scheduled global market events.
    created_by: []
  - name: device_bindings
    independently_created: true
    creation_file: supabase/migrations/20260714120200_074_bootstrap_rpcs.sql
    creation_function: bootstrap_guest (RPC)
    side_effects:
      - Unifies device-to-user mappings for both guests and authenticated users.
      - Supports binding types active_guest and authenticated_association.
    created_by: []
  - name: game_state_recovery_cases
    independently_created: true
    creation_file: src/lib/db/game/stateRecovery.ts
    creation_function: createRecoveryCase
    side_effects:
      - Tracks state recovery requests for users with corrupted or missing game state.
    created_by: []
  - name: game_state_recovery_receipts
    independently_created: false
    creation_file: supabase/migrations/20260717104157_legacy_state_recovery_ledger.sql
    creation_function: approve_state_recovery (RPC)
    side_effects:
      - Provides an immutable record of a successful state recovery operation.
    created_by:
      - owner: game_state_recovery_cases
        via: approve_state_recovery (RPC)
        why: "A immutable receipt is created when a recovery case is approved and applied."
---

# Entity Audit

Framework: unknown

## Roots (independently_created: true)

- **game_config_market_history** - POST (trade execution)
- **rate_limits** - check_rate_limit (RPC)
- **pending_link_operations** - insertLinkOperation
- **merge_receipts** - insertMergeReceipt
- **merge_audit_log** - insertMergeAuditLog
- **app_config** - Migration SQL (seed)
- **waitlist_entries** - submit_waitlist (RPC)
- **profiles** - handle_new_user (trigger)
- **guest_identities** - insertGuestIdentity
- **request_ip_log** - logRequestIp
- **player_progress** - syncLegacyPlayerProgressProjection
- **player_actions** - logActionAsync (exported via index.ts)
- **game_config_buildings** - Migration SQL (seed)
- **game_config_resources** - Migration SQL (seed)
- **game_config_production_recipes** - Migration SQL (seed)
- **game_config_production_chains** - Migration SQL (seed)
- **game_config_research** - Migration SQL (seed)
- **game_config_automation** - Migration SQL (seed)
- **game_config_workers** - Migration SQL (seed)
- **game_config_transport** - Migration SQL (seed)
- **game_config_market** - Migration SQL (seed)
- **game_config_prestige_bonuses** - Migration SQL (seed)
- **game_config_rank_thresholds** - Migration SQL (seed)
- **game_config_quest_definitions** - Migration SQL (seed)
- **game_config_daily_rewards** - Migration SQL (seed)
- **game_config_event_templates** - Migration SQL (seed)
- **game_config_seasonal_events** - Migration SQL (seed)
- **game_config_mega_projects** - Migration SQL (seed)
- **game_config_game** - Migration SQL (seed)
- **game_config_weather** - Migration SQL (seed)
- **game_config_balancing_rules** - Migration SQL (seed)
- **trade_history** - recordTrade
- **admin_actions** - logAdminAction
- **leaderboard** - submitScore
- **player_sessions** - POST (heartbeat)
- **server_game_state** - initializeGuestGameState (also upsertServerGameState)
- **cheat_investigations** - createInvestigation (also via DB triggers/RPCs)
- **admin_users** - grantAdminRole (also Migration seed)
- **daily_rewards** - claimDailyReward
- **user_streaks** - upsert_user_streak (RPC via claimDailyReward)
- **market_supply_demand** - upsert_supply_demand (RPC via POST)
- **server_market_state** - Migration SQL (seed)
- **market_player_pressure** - upsert_market_pressure (RPC via Trade API)
- **admin_permissions** - grantAdminPermission
- **support_tickets** - createSupportTicket
- **support_messages** - createSupportMessage
- **fingerprint_events** - recordFingerprintEvent
- **game_config_balance** - Migration SQL (seed)
- **guest_state_archive** - upgrade_guest_to_auth (RPC)
- **global_weather_schedule** - Migration SQL (seed)
- **server_weather_state** - Migration SQL (seed)
- **bootstrap_telemetry** - POST (telemetry)
- **global_market_event_schedule** - Migration SQL (seed)
- **device_bindings** - bootstrap_guest (RPC)
- **game_state_recovery_cases** - createRecoveryCase

## Dependents (independently_created: false)

- **validated_actions** - created by: unknown
- **research_prerequisites** - created by: unknown
- **game_state_recovery_receipts** - created by: game_state_recovery_cases via approve_state_recovery (RPC)

## Dual-creation models (independently_created AND created_by)

- **merge_audit_log** - standalone: insertMergeAuditLog, also created by: merge_receipts
- **player_progress** - standalone: syncLegacyPlayerProgressProjection, also created by: server_game_state
- **user_streaks** - standalone: upsert_user_streak (RPC via claimDailyReward), also created by: daily_rewards
- **support_tickets** - standalone: createSupportTicket, also created by: waitlist_entries
- **support_messages** - standalone: createSupportMessage, also created by: support_tickets
