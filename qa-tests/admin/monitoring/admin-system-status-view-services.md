---
title: "View system service statuses"
description: "Verify that the system status page displays the correct service statuses."
intent: "Admins must be able to see the health of individual services (e.g., \"Database\", \"Auth\") to quickly identify and troubleshoot infrastructure issues."
criticality: high
scenario: standard
flow: "Admin - System Monitoring"
verification: "Assert that the \"Services\" section is visible."
---

**Setup**: Navigate to the /admin/system-status page.

**Intent**: Admins must be able to see the health of individual services (e.g., "Database", "Auth") to quickly identify and troubleshoot infrastructure issues.

**Steps**:
1. click: click the "Refresh" button in the page header next to the title
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Services" as a section heading

**Expected Result**: The page displays a grid of services with their health indicators.
