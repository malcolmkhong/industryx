---
title: "Search factories in build grid"
description: "Verify that the factory search functionality works."
intent: "Players need to quickly find specific factories in the build grid using the search bar, especially as more tiers are unlocked."
criticality: mid
scenario: standard
flow: "Factories"
verification: "Assert that the Smelter build card is visible and other Tier 1 factories (like Assembler) are not."
---

**Setup**: Navigate to the /game/factories page.

**Intent**: Players need to quickly find specific factories in the build grid using the search bar, especially as more tiers are unlocked.

**Steps**:
1. click: click the "T1 — Basic Processing" tab in the tier tab selector
2. type: type "Smelter" in the search factories input field

**Verification**:
1. assert: text "Smelter" in the factory build grid area
2. assert: text "Assembler" is not visible in the factory build grid area

**Expected Result**: The factory build grid only displays factories that match the search query.
