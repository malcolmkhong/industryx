---
title: "Resolve a cheat investigation"
description: "Verify that an admin can resolve an open investigation with a note."
intent: "Admins must be able to resolve cheat investigations after reviewing the evidence, providing a justification for the resolution."
criticality: high
scenario: standard
flow: "Admin - Investigations"
verification: "Assert that the success message \"Investigation resolved successfully\" is visible and the status for user-4 is \"Resolved\"."
---

**Setup**: Navigate to the /admin/investigations page.

**Intent**: Admins must be able to resolve cheat investigations after reviewing the evidence, providing a justification for the resolution.

**Steps**:
1. click: click the "Resolve" button for the investigation on "user-4" in the investigations table row for user-4
2. type: type "Verified tick rate anomaly, user warned." in the resolution note input field for user-4
3. click: click the "Confirm" button in the inline action area for user-4

**Verification**:
1. assert: text "Investigation resolved successfully" in the success notification area
2. click: click the "Status" dropdown in the filter bar
3. click: click the "Resolved" option in the Status dropdown
4. click: click the "Refresh" button in the filter bar
5. assert: text "Resolved" in the status column for user-4 row

**Expected Result**: The investigation status changes to "Resolved" and the resolution note is saved.
