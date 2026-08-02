---
title: "Upgrade factory level"
description: "Verify that a player can upgrade a factory's level."
intent: "Players must be able to upgrade existing factories to increase throughput and efficiency as their empire scales."
criticality: high
scenario: standard
flow: "Factories"
verification: "Assert that the Smelter's level badge updates (e.g., from Lv.5 to Lv.6)."
---

**Setup**: Navigate to the /game/factories page as user-2.

**Intent**: Players must be able to upgrade existing factories to increase throughput and efficiency as their empire scales.

**Steps**:
1. click: click the "T1 — Basic Processing" tab in the tier tab selector
2. click: click the "Upgrade" button for the Smelter in the active factories list row for user-2's Smelter

**Verification**:
1. assert: text "Lv.6" in the Smelter row in the active factories list

**Expected Result**: The factory's level increases and its production capacity improves.
