---
title: "Perform Global Expansion reset"
description: "Perform a Global Expansion reset and verify CP is earned and progress is reset."
intent: "Performing a Global Expansion should reset the player's buildings and resources while awarding Corporation Points based on their progress, which can then be used for permanent upgrades."
criticality: critical
scenario: standard
flow: "Prestige & Expansion"
verification: "Verify the expansion count increases and buildings are reset."
---

**Setup**: Navigate to the Prestige page by clicking "Expand" in the "Progression" section of the sidebar. Ensure you have at least 5 buildings to enable the expansion.

**Intent**: Performing a Global Expansion should reset the player's buildings and resources while awarding Corporation Points based on their progress, which can then be used for permanent upgrades.

**Steps**:
1. assert: text "Global Expansion" as a page heading
2. click: the "Global Expand (+1 CP)" button (or similar CP amount) in the main prestige card
3. click: the "Continue" button in the prestige confirmation dialog
4. click: the "Confirm Expansion" button in the prestige confirmation dialog final warning step

**Verification**:
1. assert: text "1 expansions" (or similar increment) in the Global Expansion header badge
2. assert: text "0" in the Current Buildings stat row

**Expected Result**: The player's progress is reset, buildings are gone, and CP is added to their total.
