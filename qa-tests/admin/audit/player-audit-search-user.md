---
title: "Search player actions by user ID"
description: "Verify that the player action log can be searched by user ID."
intent: "Admins need to search for actions by a specific user ID to investigate their gameplay history and identify potential anomalies."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the visible rows in the table contain the truncated user ID \"user-1\"."
---

**Setup**: Navigate to the /admin/actions/player page.

**Intent**: Admins need to search for actions by a specific user ID to investigate their gameplay history and identify potential anomalies.

**Steps**:
1. type: type "user-1" in the User ID input field
2. click: click the "Search" button in the filter bar

**Verification**:
1. assert: text "user-1" in the first row of the actions table

**Expected Result**: The table only displays actions for the specified user ID.
