---
title: "Toggle factory active state"
description: "Verify that a player can toggle a factory on and off."
intent: "Players must be able to deactivate factories to manage power consumption or resource shortages without demolishing the building."
criticality: high
scenario: standard
flow: "Factories"
verification: "Assert that the Smelter shows an \"OFF\" badge and its efficiency bar is grayed out or shows 0%."
---

**Setup**: Navigate to the /game/factories page as user-2 (who has a Smelter).

**Intent**: Players must be able to deactivate factories to manage power consumption or resource shortages without demolishing the building.

**Steps**:
1. click: click the "T1 — Basic Processing" tab in the tier tab selector
2. click: click the "Power" toggle button for the Smelter in the active factories list row for user-2's Smelter

**Verification**:
1. assert: text "OFF" in the Smelter row in the active factories list
2. refresh: refresh the page
3. click: click the "T1 — Basic Processing" tab in the tier tab selector
4. assert: text "OFF" in the Smelter row in the active factories list

**Expected Result**: The factory's active state changes and its production stops/starts.
