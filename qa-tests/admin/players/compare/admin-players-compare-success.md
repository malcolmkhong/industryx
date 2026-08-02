---
title: "Compare two players side-by-side"
description: "Verify that an admin can compare two players side-by-side."
intent: "Admins must be able to compare multiple players' game states side-by-side to identify outliers or suspicious patterns in progression and wealth."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the comparison table is visible with the display names \"SteelTycoon\" and \"OilBaron\"."
---

**Setup**: Navigate to the /admin/players/compare page.

**Intent**: Admins must be able to compare multiple players' game states side-by-side to identify outliers or suspicious patterns in progression and wealth.

**Steps**:
1. type: type "user-1" in the Player 1 UUID input field
2. type: type "user-2" in the Player 2 UUID input field
3. click: click the "Compare" button below the input fields

**Verification**:
1. assert: text "SteelTycoon" in the comparison table header
2. assert: text "OilBaron" in the comparison table header

**Expected Result**: A comparison table is displayed showing metrics for both players.
