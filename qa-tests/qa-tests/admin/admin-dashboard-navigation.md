---
title: "Admin dashboard navigation hub"
description: "Verify navigation from the admin dashboard to the players and investigations pages."
intent: "The admin dashboard serves as a hub; clicking on stat cards should navigate the admin to the detailed management views for players and investigations."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the Investigations page is visible."
---

**Setup**: Navigate to the /admin page.

**Intent**: The admin dashboard serves as a hub; clicking on stat cards should navigate the admin to the detailed management views for players and investigations.

**Steps**:
1. click: click the "Total Players" card in the live stats grid
2. assert: assert: text "Player Directory" is visible as a page heading
3. click: click the "Dashboard" link in the admin sidebar
4. click: click the "Open Investigations" card in the live stats grid

**Verification**:
1. assert: text "Cheat Investigations" as a page heading

**Expected Result**: The admin is successfully navigated to the respective management pages.
