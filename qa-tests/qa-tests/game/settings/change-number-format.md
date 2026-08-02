---
title: "Change number format setting"
description: "Change the number format and verify it updates the display of large numbers."
intent: "Changing the number format setting should globally update how numerical values are rendered, allowing players to choose their preferred notation (Standard, Scientific, Compact)."
criticality: low
scenario: standard
flow: "Dashboard"
verification: "Verify the money display in the header uses scientific notation."
---

**Setup**: Navigate to the Settings page. Ensure you have a large amount of money (e.g., $15,400).

**Intent**: Changing the number format setting should globally update how numerical values are rendered, allowing players to choose their preferred notation (Standard, Scientific, Compact).

**Steps**:
1. click: the "Number Format" dropdown trigger in the Game Settings section
2. click: the "Scientific (1.5e3)" option in the Number Format dropdown menu

**Verification**:
1. assert: text "1.54e4" (or similar scientific representation of $15,400) in the game header money display

**Expected Result**: The number format is updated, and large numbers across the UI (e.g., in the header) reflect the new format.
