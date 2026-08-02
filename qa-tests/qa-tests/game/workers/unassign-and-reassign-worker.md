---
title: "Unassign and reassign a worker"
description: "Unassign a worker from one building and reassign them to another."
intent: "A worker can be unassigned from a building and then reassigned to a different building, updating both building's staff status."
criticality: mid
scenario: standard
flow: "Workers"
verification: "Verify the worker is now assigned to the Smelter and the Iron Mine is empty."
---

**Setup**: Navigate to the Workers page. Ensure a worker is assigned to the Iron Mine and there is another active building (e.g., Smelter) without a worker.

**Intent**: A worker can be unassigned from a building and then reassigned to a different building, updating both building's staff status.

**Steps**:
1. click: the "Unassign worker" icon button next to the Iron Mine in the Worker Assignments section
2. click: the "Assign..." dropdown next to the Smelter in the Worker Assignments section
3. click: the "novice_worker Lv.1" option in the Assign worker to building dropdown

**Verification**:
1. assert: text "NOV Lv.1" next to the Smelter in the Worker Assignments section
2. assert: the "Assign..." dropdown next to the Iron Mine in the Worker Assignments section

**Expected Result**: The worker is successfully moved between buildings.
