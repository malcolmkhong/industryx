---
title: "Dismiss a cheat investigation"
description: "Verify that an admin can dismiss an open investigation with a note."
intent: "Admins must be able to dismiss false positive cheat detections, providing a justification for the dismissal."
criticality: high
scenario: standard
flow: "Admin - Investigations"
verification: "Assert that the success message \"Investigation dismissed successfully\" is visible and the status for user-4 is \"Dismissed\"."
---

**Setup**: Navigate to the /admin/investigations page.

**Intent**: Admins must be able to dismiss false positive cheat detections, providing a justification for the dismissal.

**Steps**:
1. click: click the "Dismiss" button for the investigation on "user-4" in the investigations table row for user-4
2. type: type "False positive due to network latency." in the dismissal note input field for user-4
3. click: click the "Confirm" button in the inline action area for user-4

**Verification**:
1. assert: text "Investigation dismissed successfully" in the success notification area
2. click: click the "Status" dropdown in the filter bar
3. click: click the "Dismissed" option in the Status dropdown
4. click: click the "Refresh" button in the filter bar
5. assert: text "Dismissed" in the status column for user-4 row

**Expected Result**: The investigation status changes to "Dismissed" and the dismissal note is saved.
