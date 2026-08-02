---
title: "Hire and assign a worker to a building"
description: "Hire a worker and assign them to an active building."
intent: "Hiring a worker and assigning them to a building should increase the assigned worker count and improve building efficiency."
criticality: high
scenario: standard
flow: "Workers"
verification: "Verify the worker is assigned to the building in the Worker Assignments list and the Productivity section."
---

**Setup**: Navigate to the Workers page by clicking "Workers" in the "Production" section of the sidebar. Ensure at least one building is active (e.g., Iron Mine).

**Intent**: Hiring a worker and assigning them to a building should increase the assigned worker count and improve building efficiency.

**Steps**:
1. click: the "Hire for $100" button on the Novice Worker card in the Hire Workers section
2. click: the "Assign..." dropdown next to the Iron Mine in the Worker Assignments section
3. click: the "novice_worker Lv.1" option in the Assign worker to building dropdown

**Verification**:
1. assert: text "NOV Lv.1" next to the Iron Mine in the Worker Assignments section
2. assert: text "1 workers" in the Assigned row of the Productivity section
3. assert: text "0 workers" in the Unassigned row of the Productivity section

**Expected Result**: The worker is hired and then successfully assigned to a building, updating the productivity stats.
