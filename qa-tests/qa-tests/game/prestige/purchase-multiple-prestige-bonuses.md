---
title: "Purchase multiple prestige bonuses"
description: "Purchase two different permanent prestige bonuses and verify both are active."
intent: "Players can accumulate multiple permanent bonuses to significantly boost their production and progression speed across all future expansions."
criticality: high
scenario: standard
flow: "Prestige & Expansion"
verification: "Verify the Active Bonuses summary shows both purchased bonuses."
---

**Setup**: Navigate to the Prestige page. Ensure you have sufficient CP for at least two bonuses.

**Intent**: Players can accumulate multiple permanent bonuses to significantly boost their production and progression speed across all future expansions.

**Steps**:
1. click: the "1000 CP" button on the first available bonus card
2. click: the "2500 CP" button (or similar) on the second available bonus card

**Verification**:
1. assert: text "2/8" (or similar) as the count of bonuses purchased in the Permanent Bonuses header badge
2. assert: text "Active" as the status for both purchased bonus cards in the Permanent Bonuses list

**Expected Result**: Both bonuses are purchased and their effects are summarized in the sidebar.
