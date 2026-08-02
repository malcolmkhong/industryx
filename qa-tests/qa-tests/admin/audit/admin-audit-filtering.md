---
title: "Filter admin action log by type"
description: "Verify that the admin action log can be filtered by action type."
intent: "Admins need to filter the audit log to find specific types of moderation actions, such as account locks or state resets."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that all visible rows in the table have the \"Lock Account\" badge."
---

**Setup**: Navigate to the /admin/actions/admin page.

**Intent**: Admins need to filter the audit log to find specific types of moderation actions, such as account locks or state resets.

**Steps**:
1. click: click the "Action Type" dropdown in the filter bar
2. click: click the "Lock Account" option in the Action Type dropdown
3. click: click the "Refresh" button in the filter bar

**Verification**:
1. assert: text "Lock Account" in the first row of the actions table

**Expected Result**: The table only displays actions of the selected type.
