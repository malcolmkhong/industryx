---
title: "Reset admin audit log filters"
description: "Verify that the \"Reset\" button clears all filters in the admin action log."
intent: "Admins should be able to quickly clear all active filters to see the full audit log again."
criticality: low
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the Action Type dropdown has returned to \"All Types\"."
---

**Setup**: Navigate to the /admin/actions/admin page.

**Intent**: Admins should be able to quickly clear all active filters to see the full audit log again.

**Steps**:
1. click: click the "Action Type" dropdown in the filter bar
2. click: click the "Lock Account" option in the Action Type dropdown
3. type: type "2024-01-01" in the Date From input field
4. click: click the "Reset" button in the filter bar

**Verification**:
1. assert: text "All Types" in the Action Type dropdown selection

**Expected Result**: The filters are cleared and the table returns to its default state.
