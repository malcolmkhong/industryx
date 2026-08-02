---
title: "View admin capacity metrics"
description: "Verify that the admin monitoring page displays the correct capacity metrics."
intent: "Admins must be able to see high-level capacity metrics to ensure the system is not overloaded and to manage the waitlist effectively."
criticality: high
scenario: standard
flow: "Admin - System Monitoring"
verification: "Assert that the \"Capacity Limit\" metric card is visible."
---

**Setup**: Navigate to the /admin/monitoring page.

**Intent**: Admins must be able to see high-level capacity metrics to ensure the system is not overloaded and to manage the waitlist effectively.

**Steps**:
1. click: click the "Refresh" button in the page header next to the title
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Capacity Limit" in a metric card label

**Expected Result**: The page displays metrics for total players, registered users, and capacity limit.
