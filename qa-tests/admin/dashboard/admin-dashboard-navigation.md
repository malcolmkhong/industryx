---
title: "Admin dashboard quick navigation"
description: "Navigate from the admin dashboard to the players and investigations pages."
intent: "The admin dashboard should serve as a central hub, providing quick navigation to detailed management views like player lists and investigation queues."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the investigations page is displayed."
---

**Setup**: Navigate to the Admin Dashboard page at /admin.

**Intent**: The admin dashboard should serve as a central hub, providing quick navigation to detailed management views like player lists and investigation queues.

**Steps**:
1. click: the "Total Players" stat card link in the live stats grid
2. assert: text "Player Directory" or similar heading on the players page
3. click: the "Admin" link in the sidebar (to return) in the admin sidebar
4. click: the "Open Investigations" stat card link in the live stats grid

**Verification**:
1. assert: text "Cheat Investigations" or similar heading on the investigations page

**Expected Result**: Clicking the stat cards redirects the admin to the corresponding management pages.
