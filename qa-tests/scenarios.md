---
scenario_count: 1
scenarios:
  - name: standard
    description: "Realistic working state with a mix of active players, guest accounts, and pending administrative tasks. Global market and weather are active."
entity_types:
  - name: Organization
    count: 0
  - name: User
    count: 10
  - name: profiles
    count: 10
  - name: server_game_state
    count: 10
  - name: game_config_buildings
    count: 5
  - name: game_config_resources
    count: 8
  - name: game_config_production_recipes
    count: 5
  - name: game_config_production_chains
    count: 3
  - name: game_config_research
    count: 10
  - name: game_config_automation
    count: 3
  - name: game_config_workers
    count: 3
  - name: game_config_transport
    count: 3
  - name: game_config_market
    count: 1
  - name: game_config_prestige_bonuses
    count: 5
  - name: game_config_rank_thresholds
    count: 5
  - name: game_config_quest_definitions
    count: 5
  - name: game_config_daily_rewards
    count: 7
  - name: game_config_event_templates
    count: 3
  - name: game_config_seasonal_events
    count: 1
  - name: game_config_mega_projects
    count: 2
  - name: game_config_game
    count: 1
  - name: game_config_weather
    count: 4
  - name: game_config_balancing_rules
    count: 1
  - name: game_config_balance
    count: 1
  - name: server_market_state
    count: 1
  - name: server_weather_state
    count: 1
  - name: global_weather_schedule
    count: 5
  - name: global_market_event_schedule
    count: 5
  - name: app_config
    count: 1
  - name: rate_limits
    count: 2
  - name: request_ip_log
    count: 5
  - name: fingerprint_events
    count: 5
  - name: admin_users
    count: 2
  - name: admin_permissions
    count: 4
  - name: admin_actions
    count: 5
  - name: player_sessions
    count: 3
  - name: player_actions
    count: 10
  - name: trade_history
    count: 5
  - name: market_supply_demand
    count: 8
  - name: market_player_pressure
    count: 5
  - name: leaderboard
    count: 5
  - name: daily_rewards
    count: 5
  - name: user_streaks
    count: 5
  - name: cheat_investigations
    count: 3
  - name: support_tickets
    count: 4
  - name: support_messages
    count: 6
  - name: waitlist_entries
    count: 2
  - name: pending_link_operations
    count: 2
  - name: merge_receipts
    count: 2
  - name: merge_audit_log
    count: 2
  - name: guest_identities
    count: 3
  - name: device_bindings
    count: 5
  - name: guest_state_archive
    count: 1
  - name: player_progress
    count: 10
  - name: game_config_market_history
    count: 5
  - name: game_state_recovery_cases
    count: 2
  - name: game_state_recovery_receipts
    count: 1
  - name: validated_actions
    count: 1
  - name: research_prerequisites
    count: 1
---

## profiles & Authentication
Ten users: 2 Admins, 4 Authenticated Players, 4 Guests.

| id | email | is_guest | display_name | fingerprint | is_test | last_active |
|:---|:---|:---|:---|:---|:---|:---|
| admin-1 | admin-{{testRunShortId}}@industryx.test | false | Admin Prime | fp-admin-1 | false | 2024-01-01T12:00:00Z |
| admin-2 | mod-{{testRunShortId}}@industryx.test | false | Moderator 7 | fp-admin-2 | false | 2024-01-01T12:05:00Z |
| user-1 | player1-{{testRunShortId}}@gmail.test | false | SteelTycoon | fp-user-1 | false | 2024-01-01T12:10:00Z |
| user-2 | player2-{{testRunShortId}}@gmail.test | false | OilBaron | fp-user-2 | false | 2024-01-01T12:15:00Z |
| user-3 | player3-{{testRunShortId}}@gmail.test | false | TechWhiz | fp-user-3 | false | 2024-01-01T12:20:00Z |
| user-4 | player4-{{testRunShortId}}@gmail.test | false | IdleMaster | fp-user-4 | false | 2024-01-01T12:25:00Z |
| guest-1 | null | true | Guest_4821 | fp-guest-1 | false | 2024-01-01T12:30:00Z |
| guest-2 | null | true | Guest_9932 | fp-guest-2 | false | 2024-01-01T12:35:00Z |
| guest-3 | null | true | Guest_1105 | fp-guest-3 | false | 2024-01-01T12:40:00Z |
| guest-4 | null | true | Guest_7761 | fp-guest-4 | false | 2024-01-01T12:45:00Z |

### device_bindings
| user_id | device_id | binding_type | fingerprint_hash |
|:---|:---|:---|:---|
| admin-1 | dev-admin-1 | authenticated_association | fp-admin-1 |
| user-1 | dev-user-1 | authenticated_association | fp-user-1 |
| guest-1 | dev-guest-1 | active_guest | fp-guest-1 |
| guest-2 | dev-guest-2 | active_guest | fp-guest-2 |
| guest-3 | dev-guest-3 | active_guest | fp-guest-3 |

### guest_identities
| user_id | device_id | fingerprint | superseded_by |
|:---|:---|:---|:---|
| guest-1 | dev-guest-1 | fp-guest-1 | null |
| guest-2 | dev-guest-2 | fp-guest-2 | null |
| guest-4 | dev-guest-4 | fp-guest-4 | user-4 |

### player_sessions
| user_id | session_id | last_heartbeat | ip_address |
|:---|:---|:---|:---|
| admin-1 | sess-{{testRunShortId}}-1 | 2024-01-01T12:00:00Z | 127.0.0.1 |
| user-1 | sess-{{testRunShortId}}-2 | 2024-01-01T12:10:00Z | 192.168.1.1 |
| guest-1 | sess-{{testRunShortId}}-3 | 2024-01-01T12:30:00Z | 10.0.0.5 |

## Game Configuration (Static & Tuning)

### game_config_game & app_config
| id | tick_rate_ms | save_version | max_capacity | maintenance_mode |
|:---|:---|:---|:---|:---|
| 1 | 1000 | 2.4.0 | 5000 | false |

### game_config_resources
| id | name | base_value | weight |
|:---|:---|:---|:---|
| iron_ore | Iron Ore | 10 | 1.0 |
| coal | Coal | 8 | 0.8 |
| iron_ingot | Iron Ingot | 25 | 1.2 |
| steel_plate | Steel Plate | 65 | 1.5 |
| electronics | Electronics | 200 | 0.5 |

### game_config_buildings
| id | name | tier | base_cost | energy_consumption |
|:---|:---|:---|:---|:---|
| iron_mine | Iron Mine | 1 | {"money": 100} | 10 |
| smelter | Smelter | 1 | {"money": 250, "iron_ore": 50} | 25 |
| factory_t1 | Factory Tier 1 | 1 | {"money": 500, "iron_ingot": 100} | 50 |
| factory_t2 | Factory Tier 2 | 2 | {"money": 2500, "steel_plate": 200} | 150 |
| warehouse_t1 | Warehouse Tier 1 | 1 | {"money": 300} | 5 |

### game_config_production_recipes
| id | building_id | inputs | outputs | duration |
|:---|:---|:---|:---|:---|
| smelting_iron | smelter | {"iron_ore": 2, "coal": 1} | {"iron_ingot": 1} | 5 |
| basic_electronics | factory_t1 | {"copper": 5, "plastic": 2} | {"electronics": 1} | 15 |

### game_config_production_chains
| id | name | steps |
|:---|:---|:---|
| iron_line | Iron Production | ["iron_mine", "smelter", "factory_t1"] |

### game_config_research & research_prerequisites
| id | name | cost | unlocks |
|:---|:---|:---|:---|
| basic_mining | Basic Mining | 50 | ["iron_mine", "coal_mine"] |
| smelting_tech | Smelting | 150 | ["smelter"] |
| steel_production | Steel Mastery | 500 | ["factory_t2"] |

| research_id | prerequisite_id |
|:---|:---|
| smelting_tech | basic_mining |

### game_config_automation
| id | name | cost | target_type |
|:---|:---|:---|:---|
| auto_smelt | Auto Smelter Upgrades | 1000 | building_upgrade |

### game_config_workers & game_config_transport
| id | type | cost | capacity_bonus |
|:---|:---|:---|:---|
| novice_worker | Worker | 100 | 1.05 |
| basic_truck | Transport | 500 | 50 |

### game_config_market & market_resource_config
| id | commission_rate | base_volatility |
|:---|:---|:---|
| 1 | 0.05 | 0.12 |

### game_config_prestige_bonuses & game_config_rank_thresholds
| id | name | multiplier | threshold_money |
|:---|:---|:---|:---|
| efficiency_p | Efficiency Boost | 1.1 | 1000000 |

### game_config_quest_definitions
| id | title | objective | reward |
|:---|:---|:---|:---|
| first_mine | First Steps | {"type": "build", "target": "iron_mine", "count": 1} | {"money": 500} |

### game_config_daily_rewards
| day | reward_type | amount |
|:---|:---|:---|
| 1 | money | 1000 |
| 7 | research_points | 50 |

### game_config_event_templates & game_config_seasonal_events
| id | type | multiplier | start_date |
|:---|:---|:---|:---|
| market_boom | market_price | 1.5 | 2024-01-01T00:00:00Z |

### game_config_mega_projects
| id | name | cost | bonus |
|:---|:---|:---|:---|
| space_elevator | Space Elevator | {"money": 1000000000, "steel_plate": 1000000} | {"prestige_gain": 2.0} |

### game_config_weather
| id | name | transport_mult | production_mult |
|:---|:---|:---|:---|
| sunny | Sunny | 1.0 | 1.0 |
| storm | Storm | 0.5 | 0.8 |
| blizzard | Blizzard | 0.2 | 0.6 |
| heatwave | Heatwave | 1.1 | 0.9 |

### game_config_balancing_rules & game_config_balance
| key | value |
|:---|:---|
| global_tax_rate | 0.02 |
| decay_rate | 0.005 |

## Server State (Global)

### server_market_state
| id | tick_number | global_volatility | last_tick_at |
|:---|:---|:---|:---|
| 1 | 4520 | 0.15 | 2024-01-01T12:00:00Z |

### server_weather_state
| id | current_weather_id | intensity | expires_at |
|:---|:---|:---|:---|
| 1 | sunny | 0.0 | 2024-01-01T13:00:00Z |

### global_weather_schedule
| id | weather_id | scheduled_for | duration_seconds |
|:---|:---|:---|:---|
| 1 | storm | 2024-01-01T14:00:00Z | 3600 |
| 2 | blizzard | 2024-01-02T10:00:00Z | 7200 |

### global_market_event_schedule
| id | event_template_id | scheduled_for |
|:---|:---|:---|
| 1 | market_boom | 2024-01-01T18:00:00Z |

## Player Progress & Gameplay

### server_game_state & player_progress
| user_id | money | research_points | game_tick | state_version | buildings | completed_research |
|:---|:---|:---|:---|:---|:---|:---|
| user-1 | 15400 | 120 | 12500 | 45 | [{"id": "b1", "type": "iron_mine", "level": 3}] | ["basic_mining"] |
| user-2 | 890200 | 540 | 88000 | 112 | [{"id": "b2", "type": "smelter", "level": 5}] | ["smelting_tech"] |
| guest-1 | 500 | 0 | 150 | 2 | [] | [] |

### player_actions & validated_actions
| user_id | action_type | payload | created_at |
|:---|:---|:---|:---|
| user-1 | build_building | {"type": "iron_mine"} | 2024-01-01T12:10:00Z |
| user-2 | execute_trade | {"resource": "iron_ingot", "amount": 100} | 2024-01-01T12:15:00Z |

| action_id | user_id | validated_at |
|:---|:---|:---|
| act-{{testRunShortId}}-1 | user-1 | 2024-01-01T12:10:01Z |

### trade_history & game_config_market_history
| user_id | resource_id | amount | price_per_unit | total_cost | trade_type |
|:---|:---|:---|:---|:---|:---|
| user-2 | iron_ingot | 50 | 28.5 | 1425 | sell |
| user-1 | coal | 200 | 7.2 | 1440 | buy |

### market_supply_demand
| resource_id | total_supply | total_demand | tick_number |
|:---|:---|:---|:---|
| iron_ore | 15000 | 14500 | 4520 |
| coal | 8000 | 9200 | 4520 |

### market_player_pressure
| user_id | resource_id | buy_pressure | sell_pressure |
|:---|:---|:---|:---|
| user-2 | iron_ingot | 0 | 50 |
| user-1 | coal | 200 | 0 |

### leaderboard
| user_id | score | rank_name | season_id |
|:---|:---|:---|:---|
| user-2 | 125000 | Tycoon | 2024-Q1 |
| user-3 | 98000 | Entrepreneur | 2024-Q1 |

### daily_rewards & user_streaks
| user_id | day_number | claim_date | streak_count | total_logins |
|:---|:---|:---|:---|:---|
| user-1 | 3 | 2024-01-01 | 5 | 12 |
| user-2 | 12 | 2024-01-01 | 15 | 45 |

## Administration & Support

### admin_users & admin_permissions
| user_id | role | permission_key |
|:---|:---|:---|
| admin-1 | super_admin | config_edit |
| admin-1 | super_admin | support_manage |
| admin-2 | moderator | support_manage |
| admin-2 | moderator | investigation_view |

### admin_actions
| admin_id | action_type | target_id | details |
|:---|:---|:---|:---|
| admin-1 | update_config | iron_mine | Changed base cost to 100 |
| admin-2 | resolve_ticket | ticket-1 | Issue resolved, user notified |

### cheat_investigations
| user_id | severity | status | detection_type |
|:---|:---|:---|:---|
| user-4 | high | open | speed_hack_detected |
| guest-3 | medium | resolved | multi_account_link |

### support_tickets & support_messages
| id | user_id | subject | status | priority |
|:---|:---|:---|:---|:---|
| ticket-1 | user-1 | Progress Reset Request | resolved | high |
| ticket-2 | guest-2 | Missing daily reward | open | medium |
| ticket-wait-1 | user-wait-1 | Waitlist App | open | low |

| ticket_id | sender_id | message |
|:---|:---|:---|
| ticket-1 | user-1 | I lost my progress after updating. |
| ticket-1 | admin-2 | We have restored your state from backup. |

### waitlist_entries
| user_id | email | status | position |
|:---|:---|:---|:---|
| user-wait-1 | wait-{{testRunShortId}}@wait.test | pending | 452 |
| user-wait-2 | wait2-{{testRunShortId}}@wait.test | pending | 453 |

## System Operations

### rate_limits
| key | points | expires_at |
|:---|:---|:---|
| login:127.0.0.1 | 2 | 2024-01-01T13:00:00Z |
| api:user-1 | 50 | 2024-01-01T12:05:00Z |

### request_ip_log & fingerprint_events
| ip_hash | endpoint | event_type | fingerprint_hash |
|:---|:---|:---|:---|
| hash-1 | /api/auth/login | login_success | fp-user-1 |
| hash-2 | /api/auth/link | identity_link_start | fp-guest-4 |

### pending_link_operations, merge_receipts, & merge_audit_log
| id | guest_id | auth_id | preference | idempotency_key |
|:---|:---|:---|:---|:---|
| link-1 | guest-4 | user-4 | auth_wins | idem-{{testRunShortId}}-1 |
| link-2 | guest-archive | user-5 | auth_wins | idem-{{testRunShortId}}-2 |

| id | merge_receipt_id | decision | status |
|:---|:---|:---|:---|
| rect-1 | link-1 | auth_wins | success |
| rect-2 | link-2 | auth_wins | success |

### guest_state_archive
| archive_id | user_id | snapshot | archived_at |
|:---|:---|:---|:---|
| arch-1 | guest-archive | {"money": 5000, "level": 10} | 2024-01-01T10:00:00Z |

### bootstrap_telemetry
| session_id | duration_ms | success | step_results |
|:---|:---|:---|:---|
| sess-{{testRunShortId}}-1 | 450 | true | {"auth": "ok", "state": "ok"} |

### game_state_recovery_cases & game_state_recovery_receipts
| id | user_id | recovery_status | approved_at | recovery_data |
|:---|:---|:---|:---|:---|
| recov-1 | user-1 | approved | 2024-01-01T12:00:00Z | {"money": 10000} |
| recov-2 | user-3 | pending | null | null |

| case_id | receipt_token | applied_at |
|:---|:---|:---|
| recov-1 | token-{{testRunShortId}} | 2024-01-01T12:01:00Z |
