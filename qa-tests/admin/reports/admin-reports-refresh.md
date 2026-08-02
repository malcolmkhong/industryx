---
title: "Refresh admin reports data"
description: "Verify that the reports page can refresh its data."
intent: "Admins need to be able to manually refresh the reports list to see the latest investigations and detections."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the \"Reports\" heading remains visible."
---

**Setup**: Navigate to the /admin/reports page.

**Intent**: Admins need to be able to manually refresh the reports list to see the latest investigations and detections.

**Steps**:
1. click: click the "Refresh" button in the page header next to the title
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Reports" as a page heading

**Expected Result**: The report metrics and list are updated after clicking the refresh button.
