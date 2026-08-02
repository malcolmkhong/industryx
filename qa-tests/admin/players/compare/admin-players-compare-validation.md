---
title: "Comparison tool validation"
description: "Verify that the comparison tool requires at least two player IDs."
intent: "The comparison tool must enforce its requirements to provide a meaningful side-by-side view."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the error message \"Enter at least 2 player IDs\" is visible."
---

**Setup**: Navigate to the /admin/players/compare page.

**Intent**: The comparison tool must enforce its requirements to provide a meaningful side-by-side view.

**Steps**:
1. type: type "user-1" in the Player 1 UUID input field
2. click: click the "Compare" button below the input fields

**Verification**:
1. assert: text "Enter at least 2 player IDs" in the error message area

**Expected Result**: An error message is displayed if fewer than two IDs are provided.
