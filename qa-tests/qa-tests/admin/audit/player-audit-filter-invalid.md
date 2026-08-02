---
title: "Filter player actions by invalidity"
description: "Verify that the player action log can be filtered to show only invalid actions."
intent: "Admins need to quickly identify invalid player actions, which are primary indicators of potential cheating or system bugs."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that all visible rows in the table have the \"Invalid\" badge."
---

**Setup**: Navigate to the /admin/actions/player page.

**Intent**: Admins need to quickly identify invalid player actions, which are primary indicators of potential cheating or system bugs.

**Steps**:
1. click: click the "Valid" dropdown in the filter bar
2. click: click the "Invalid Only" option in the Valid dropdown
3. click: click the "Search" button in the filter bar

**Verification**:
1. assert: text "Invalid" in the first row of the actions table

**Expected Result**: The table only displays actions that are marked as invalid.
