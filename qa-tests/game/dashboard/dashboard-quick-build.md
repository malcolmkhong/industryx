---
title: "Quick build from dashboard"
description: "Verify that the quick build buttons on the dashboard work."
intent: "Players should be able to quickly build essential structures directly from the dashboard to streamline their early-game progression."
criticality: high
scenario: standard
flow: "Dashboard"
verification: "Assert that the building count in the top stats row increases from 1 to 2."
---

**Setup**: Navigate to the /game/dashboard page as user-1.

**Intent**: Players should be able to quickly build essential structures directly from the dashboard to streamline their early-game progression.

**Steps**:
1. click: click the "Expand Details & Actions" button on the Details & Actions collapsible trigger
2. click: click the "Iron Mine" button in the Quick Build section

**Verification**:
1. assert: text "2" in the buildings stat card in the top stats row

**Expected Result**: A new building is added to the empire and the building count increases.
