---
title: "Reset audit log filters"
description: "Apply filters to the audit log and then reset them to default."
intent: "Admins can easily clear all applied filters to return to the full view of the player action audit log."
criticality: low
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the Action Type filter returns to 'All Types'."
---

**Setup**: Navigate to the Player Action Audit Log page. Apply a filter (e.g., Action Type: Build).

**Intent**: Admins can easily clear all applied filters to return to the full view of the player action audit log.

**Steps**:
1. click: the "Action Type" dropdown trigger in the filter bar
2. click: the "Build" option in the Action Type dropdown menu
3. click: the "Search" button in the filter bar
4. click: the "Reset" button in the filter bar

**Verification**:
1. assert: text "All Types" in the Action Type dropdown trigger

**Expected Result**: The filters are cleared and the table returns to its default state.
