---
title: "Filter player action audit log"
description: "Filter player actions by type and validity and verify the table updates."
intent: "Admins must be able to filter the player action audit log to investigate specific types of activity or identify invalid actions that may indicate bugs or cheating."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the table shows only 'Build' actions with an 'Invalid' status."
---

**Setup**: Navigate to the Player Action Audit Log page at /admin/actions/player.

**Intent**: Admins must be able to filter the player action audit log to investigate specific types of activity or identify invalid actions that may indicate bugs or cheating.

**Steps**:
1. assert: text "Action Audit Log" as a page heading
2. click: the "Action Type" dropdown trigger in the filter bar
3. click: the "Build" option in the Action Type dropdown menu
4. click: the "Valid" dropdown trigger in the filter bar
5. click: the "Invalid Only" option in the Valid dropdown menu
6. click: the "Search" button in the filter bar

**Verification**:
1. assert: text "Build" in the Action Type column of the table
2. assert: text "Invalid" in the Valid column of the table

**Expected Result**: The audit log table correctly filters actions based on the selected criteria.
