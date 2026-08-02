---
title: "Toggle dashboard sections"
description: "Verify that the dashboard sections can be collapsed and expanded."
intent: "The dashboard sections must be collapsible to allow players to customize their view and focus on the information most relevant to them."
criticality: mid
scenario: standard
flow: "Dashboard"
verification: "Assert that the Production Rates section is now visible."
---

**Setup**: Navigate to the /game/dashboard page.

**Intent**: The dashboard sections must be collapsible to allow players to customize their view and focus on the information most relevant to them.

**Steps**:
1. click: click the "Collapse Operations" button on the Operations collapsible trigger
2. assert: assert: text "Power Grid" is not visible in the operations section content area
3. click: click the "Expand Production Flow" button on the Production Flow collapsible trigger

**Verification**:
1. assert: text "Production Rates" in the production flow section content area

**Expected Result**: The sections toggle their visibility correctly.
