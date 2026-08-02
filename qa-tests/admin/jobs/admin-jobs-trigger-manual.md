---
title: "Trigger a background job manually"
description: "Verify that an admin can manually trigger a background job."
intent: "Admins must be able to manually trigger background jobs (e.g., \"Market Tick\") to resolve issues or force updates outside of the normal schedule."
criticality: high
scenario: standard
flow: "Admin - System Monitoring"
verification: "Assert that the \"Last run\" time for the triggered job is updated to \"Just now\" or a very recent time."
---

**Setup**: Navigate to the /admin/jobs page.

**Intent**: Admins must be able to manually trigger background jobs (e.g., "Market Tick") to resolve issues or force updates outside of the normal schedule.

**Steps**:
1. click: click the "Run" button for a job with a trigger path in the jobs list for a job like "Market Tick"
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Just now" in the "Last run" info for the triggered job

**Expected Result**: The job is triggered and its status is updated.
