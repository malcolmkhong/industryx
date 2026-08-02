---
title: "View admin economy statistics"
description: "Verify that the admin economy page displays the correct statistics."
intent: "Admins must be able to see high-level economy metrics to ensure the game's economic balance is maintained."
criticality: high
scenario: standard
flow: "Admin - Economy & Market"
verification: "Assert that the \"Total Money\" metric card is visible."
---

**Setup**: Navigate to the /admin/economy page.

**Intent**: Admins must be able to see high-level economy metrics to ensure the game's economic balance is maintained.

**Steps**:
1. click: click the "Refresh" button in the page header next to the title
2. click: click the "Refresh" button in the page header next to the title

**Verification**:
1. assert: text "Total Money" in a metric card label

**Expected Result**: The page displays metrics for total money, total earned, and player counts.
