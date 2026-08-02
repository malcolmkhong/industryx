---
title: "View bootstrap audit metrics"
description: "Verify that the bootstrap audit page displays the correct telemetry metrics."
intent: "Admins must be able to see high-level metrics for bootstrap outcomes to identify systemic issues with device binding or account merging."
criticality: high
scenario: standard
flow: "Admin - System Monitoring"
verification: "Assert that the \"Total bootstraps (24h)\" metric card is visible with a value."
---

**Setup**: Navigate to the /admin/bootstrap-audit page.

**Intent**: Admins must be able to see high-level metrics for bootstrap outcomes to identify systemic issues with device binding or account merging.

**Steps**:
1. click: click the "Refresh" button in the page header next to the title
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Total bootstraps (24h)" in a metric card label

**Expected Result**: The page displays metrics for total bootstraps, conflict rate, and recovery rate.
