---
title: "Auto-assign unassigned workers"
description: "Use the Auto-Assign tool to staff all active buildings with unassigned workers."
intent: "The Auto-Assign button should automatically link unassigned workers to active buildings that don't have a worker assigned yet."
criticality: mid
scenario: standard
flow: "Workers"
verification: "Verify that the worker is now assigned to a building in the Worker Assignments list."
---

**Setup**: Navigate to the Workers page. Ensure you have at least one unassigned worker and one active building without a worker.

**Intent**: The Auto-Assign button should automatically link unassigned workers to active buildings that don't have a worker assigned yet.

**Steps**:
1. click: the "Hire for $100" button on the Novice Worker card in the Hire Workers section
2. click: the "Auto-Assign" button in the Worker Assignments section header

**Verification**:
1. assert: text "NOV Lv.1" next to an active building in the Worker Assignments section
2. assert: text "1 workers" in the Assigned row of the Productivity section

**Expected Result**: Unassigned workers are automatically distributed to active buildings that lack staff.
